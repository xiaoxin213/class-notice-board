import Fastify from 'fastify';
import { WebSocketServer } from 'ws';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { now } from './db.js';
import {
  hashPassword, verifyPassword, signToken, verifyToken,
  newDeviceToken, hashDeviceToken, newBindCode,
} from './auth.js';
import { Hub } from './hub.js';
import { publishNotice, deliverPending, ackNotice, expireStaleNotices } from './notices.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.mp3': 'audio/mpeg',
};

/** 绑定码是 6 位数字，只有 100 万种组合，必须限制尝试频率 */
class AttemptLimiter {
  constructor(max = 10, windowMs = 10 * 60 * 1000) {
    this.max = max; this.windowMs = windowMs; this.hits = new Map();
  }

  check(key) {
    const rec = this.hits.get(key);
    if (!rec || Date.now() > rec.resetAt) {
      this.hits.set(key, { count: 1, resetAt: Date.now() + this.windowMs });
      return true;
    }
    rec.count += 1;
    return rec.count <= this.max;
  }

  reset(key) { this.hits.delete(key); }
}

// ---------- setting 表辅助 ----------

function getSetting(db, key, fallback = '') {
  const row = db.prepare('SELECT value FROM setting WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(db, key, value) {
  db.prepare(
    'INSERT INTO setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, String(value));
}

export function buildApp(db, config, { logger = false } = {}) {
  const app = Fastify({ logger, bodyLimit: 64 * 1024 });
  const hub = new Hub(db, config);
  const bindLimiter = new AttemptLimiter();

  app.decorate('hub', hub);

  // ---------- 鉴权 ----------

  const requireTeacher = async (req, reply) => {
    const raw = req.headers.authorization ?? '';
    const payload = verifyToken(raw.replace(/^Bearer\s+/i, ''), config.tokenSecret);
    if (!payload?.tid) return reply.code(401).send({ error: '未登录或登录已过期' });
    req.teacher = db.prepare('SELECT id, username, display_name FROM teacher WHERE id = ?').get(payload.tid);
    if (!req.teacher) return reply.code(401).send({ error: '账号不存在' });
  };

  const requireAdmin = async (req, reply) => {
    if (req.teacher?.username !== config.adminUsername) {
      return reply.code(403).send({ error: '需要管理员权限' });
    }
  };

  const canAccessClass = (teacherId, classId) => !!db
    .prepare('SELECT 1 FROM teacher_class WHERE teacher_id = ? AND class_id = ?')
    .get(teacherId, classId);

  // ---------- 账号 ----------

  app.post('/api/auth/register', async (req, reply) => {
    const { username, password, displayName, inviteCode } = req.body ?? {};

    // 始终需要邀请码注册（邀请码为空则完全关闭注册）
    const currentCode = getSetting(db, 'invite_code', config.inviteCode);
    if (!currentCode || inviteCode !== currentCode) {
      return reply.code(403).send({ error: '注册需要邀请码，请联系管理员获取' });
    }

    if (!username || String(username).length < 3) return reply.code(400).send({ error: '账号名至少 3 个字符' });
    if (!password || String(password).length < 6) return reply.code(400).send({ error: '密码至少 6 位' });
    if (db.prepare('SELECT 1 FROM teacher WHERE username = ?').get(username)) {
      return reply.code(409).send({ error: '该账号名已被注册' });
    }
    const info = db.prepare(
      'INSERT INTO teacher (username, password, display_name, created_at) VALUES (?, ?, ?, ?)',
    ).run(username, hashPassword(password), displayName || username, now());
    return reply.code(201).send({
      token: signToken({ tid: info.lastInsertRowid }, config.tokenSecret, config.tokenTtlSeconds),
      teacher: { id: info.lastInsertRowid, username, displayName: displayName || username, isAdmin: false },
    });
  });

  app.post('/api/auth/login', async (req, reply) => {
    const { username, password } = req.body ?? {};
    const row = db.prepare('SELECT * FROM teacher WHERE username = ?').get(username ?? '');
    if (!row || !verifyPassword(String(password ?? ''), row.password)) {
      return reply.code(401).send({ error: '账号或密码不正确' });
    }
    if (row.disabled) {
      return reply.code(403).send({ error: '账号已被停用，请联系管理员' });
    }
    const isAdmin = row.username === config.adminUsername;
    return {
      token: signToken({ tid: row.id }, config.tokenSecret, config.tokenTtlSeconds),
      teacher: { id: row.id, username: row.username, displayName: row.display_name, isAdmin },
    };
  });

  app.get('/api/me', { preHandler: requireTeacher }, async (req) => ({
    id: req.teacher.id,
    username: req.teacher.username,
    displayName: req.teacher.display_name,
    isAdmin: req.teacher.username === config.adminUsername,
  }));

  // ---------- 班级 ----------

  app.get('/api/classes', { preHandler: requireTeacher }, async (req) => {
    const rows = db.prepare(`
      SELECT c.id, c.name, tc.role
      FROM class c JOIN teacher_class tc ON tc.class_id = c.id
      WHERE tc.teacher_id = ? ORDER BY c.id
    `).all(req.teacher.id);
    return {
      max: config.maxClassesPerTeacher,
      classes: rows.map((c) => ({ ...c, online: hub.onlineCount(c.id) })),
    };
  });

  app.post('/api/classes', { preHandler: requireTeacher }, async (req, reply) => {
    const name = String(req.body?.name ?? '').trim();
    if (!name) return reply.code(400).send({ error: '请填写班级名称' });

    const count = db.prepare('SELECT COUNT(*) AS c FROM teacher_class WHERE teacher_id = ?').get(req.teacher.id).c;
    if (count >= config.maxClassesPerTeacher) {
      return reply.code(400).send({ error: `最多只能创建 ${config.maxClassesPerTeacher} 个班级` });
    }
    const created = db.transaction(() => {
      const info = db.prepare('INSERT INTO class (name, created_at) VALUES (?, ?)').run(name, now());
      db.prepare("INSERT INTO teacher_class (teacher_id, class_id, role) VALUES (?, ?, 'owner')")
        .run(req.teacher.id, info.lastInsertRowid);
      return info.lastInsertRowid;
    })();
    return reply.code(201).send({ id: created, name, role: 'owner', online: 0 });
  });


  app.patch('/api/classes/:id', { preHandler: requireTeacher }, async (req, reply) => {
    const classId = Number(req.params.id);
    const row = db.prepare('SELECT role FROM teacher_class WHERE teacher_id = ? AND class_id = ?').get(req.teacher.id, classId);
    if (!row) return reply.code(403).send({ error: '无权操作该班级' });
    if (row.role !== 'owner') return reply.code(403).send({ error: '只有班主任可以修改班级名称' });
    const name = String(req.body?.name ?? '').trim();
    if (!name) return reply.code(400).send({ error: '请填写班级名称' });
    db.prepare('UPDATE class SET name = ? WHERE id = ?').run(name, classId);
    return { id: classId, name };
  });

  app.delete('/api/classes/:id', { preHandler: requireTeacher }, async (req, reply) => {
    const classId = Number(req.params.id);
    const row = db.prepare('SELECT role FROM teacher_class WHERE teacher_id = ? AND class_id = ?').get(req.teacher.id, classId);
    if (!row) return reply.code(403).send({ error: '无权操作该班级' });
    if (row.role !== 'owner') return reply.code(403).send({ error: '只有班主任可以删除班级' });
    db.prepare('DELETE FROM class WHERE id = ?').run(classId);
    return reply.code(204).send();
  });

  // ---------- 教室绑定 ----------

  app.post('/api/classes/:id/bind-code', { preHandler: requireTeacher }, async (req, reply) => {
    const classId = Number(req.params.id);
    if (!canAccessClass(req.teacher.id, classId)) return reply.code(403).send({ error: '无权操作该班级' });

    const expireAt = now() + config.bindCodeTtlSeconds;
    // 极小概率撞码，重试几次即可
    for (let i = 0; i < 5; i += 1) {
      const code = newBindCode();
      if (db.prepare('SELECT 1 FROM bind_code WHERE code = ? AND used_at IS NULL AND expire_at > ?').get(code, now())) continue;
      db.prepare(`
        INSERT INTO bind_code (code, class_id, created_by, expire_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(code) DO UPDATE SET class_id = excluded.class_id,
          created_by = excluded.created_by, expire_at = excluded.expire_at, used_at = NULL
      `).run(code, classId, req.teacher.id, expireAt);
      return reply.code(201).send({ code, expireAt });
    }
    return reply.code(500).send({ error: '生成绑定码失败，请重试' });
  });

  app.post('/api/device/bind', async (req, reply) => {
    const key = req.ip;
    if (!bindLimiter.check(key)) return reply.code(429).send({ error: '尝试次数过多，请稍后再试' });

    const code = String(req.body?.code ?? '').trim();
    const row = db.prepare('SELECT * FROM bind_code WHERE code = ?').get(code);
    if (!row || row.used_at || row.expire_at <= now()) {
      return reply.code(400).send({ error: '绑定码无效或已过期' });
    }
    const token = newDeviceToken();
    const cls = db.prepare('SELECT name FROM class WHERE id = ?').get(row.class_id);
    const deviceName = String(req.body?.deviceName ?? '教室电脑').slice(0, 40);
    const result = db.transaction(() => {
      db.prepare('UPDATE bind_code SET used_at = ? WHERE code = ?').run(now(), code);
      // 同一班级内同名设备 → 复用旧记录（换绑时不堆积）
      const existing = db.prepare('SELECT id FROM device WHERE class_id = ? AND name = ?')
        .get(row.class_id, deviceName);
      if (existing) {
        db.prepare('UPDATE device SET token_hash = ?, last_seen_at = ? WHERE id = ?')
          .run(hashDeviceToken(token), now(), existing.id);
        return { deviceId: existing.id };
      }
      const info = db.prepare(
        'INSERT INTO device (class_id, token_hash, name, created_at) VALUES (?, ?, ?, ?)',
      ).run(row.class_id, hashDeviceToken(token), deviceName, now());
      return { deviceId: info.lastInsertRowid };
    })();
    bindLimiter.reset(key);
    return reply.code(201).send({
      deviceToken: token, deviceId: result.deviceId, classId: row.class_id, className: cls.name,
    });
  });

  app.get('/api/classes/:id/devices', { preHandler: requireTeacher }, async (req, reply) => {
    const classId = Number(req.params.id);
    if (!canAccessClass(req.teacher.id, classId)) return reply.code(403).send({ error: '无权操作该班级' });
    const rows = db.prepare('SELECT id, name, last_seen_at FROM device WHERE class_id = ?').all(classId);
    return { devices: rows.map((d) => ({ ...d, online: hub.isOnline(d.id) })) };
  });

  app.delete('/api/classes/:id/devices/:deviceId', { preHandler: requireTeacher }, async (req, reply) => {
    const classId = Number(req.params.id);
    const deviceId = Number(req.params.deviceId);
    if (!canAccessClass(req.teacher.id, classId)) return reply.code(403).send({ error: '无权操作该班级' });
    const device = db.prepare('SELECT id FROM device WHERE id = ? AND class_id = ?').get(deviceId, classId);
    if (!device) return reply.code(404).send({ error: '设备不存在' });
    if (hub.isOnline(deviceId)) return reply.code(400).send({ error: '设备在线中，无法删除' });
    db.prepare('DELETE FROM device WHERE id = ?').run(deviceId);
    return reply.code(204).send();
  });

  app.post('/api/classes/:id/sound-test', { preHandler: requireTeacher }, async (req, reply) => {
    const classId = Number(req.params.id);
    if (!canAccessClass(req.teacher.id, classId)) return reply.code(403).send({ error: '无权操作该班级' });
    const sent = hub.sendToClass(classId, { type: 'sound_test', text: '声音测试，教室电脑已就绪。' });
    return { sentTo: sent };
  });

  // ---------- 通知 ----------

  app.post('/api/notices', { preHandler: requireTeacher }, async (req, reply) => {
    const classId = Number(req.body?.classId);
    const content = String(req.body?.content ?? '').trim();
    if (!canAccessClass(req.teacher.id, classId)) return reply.code(403).send({ error: '无权操作该班级' });
    if (!content) return reply.code(400).send({ error: '通知内容不能为空' });
    if (content.length > config.maxNoticeLength) {
      return reply.code(400).send({ error: `通知内容最多 ${config.maxNoticeLength} 字` });
    }
    const displaySeconds = Math.min(Math.max(Number(req.body?.displaySeconds) || 60, 5), 3600);
    const speakTimes = Math.min(Math.max(Number(req.body?.speakTimes) || 2, 0), 10);

    const { notice, sentTo } = publishNotice(db, hub, config, {
      classId, teacherId: req.teacher.id, content, displaySeconds, speakTimes,
    });
    return reply.code(201).send({ id: notice.id, sentTo, online: hub.onlineCount(classId) });
  });

  app.get('/api/notices', { preHandler: requireTeacher }, async (req, reply) => {
    const classId = Number(req.query?.classId);
    if (!canAccessClass(req.teacher.id, classId)) return reply.code(403).send({ error: '无权操作该班级' });
    const rows = db.prepare(`
      SELECT n.id, n.content, n.status, n.created_at, n.display_seconds, n.speak_times, t.display_name AS publisher
      FROM notice n JOIN teacher t ON t.id = n.publisher_id
      WHERE n.class_id = ? ORDER BY n.id DESC LIMIT 30
    `).all(classId);
    return { notices: rows };
  });

  // ---------- 管理后台 ----------

  app.get('/api/admin/stats', { preHandler: [requireTeacher, requireAdmin] }, async () => {
    const teachers = db.prepare(
      'SELECT id, username, display_name, disabled, created_at FROM teacher ORDER BY id',
    ).all();

    const result = teachers.map((t) => {
      const classes = db.prepare(`
        SELECT c.id FROM class c
        JOIN teacher_class tc ON tc.class_id = c.id
        WHERE tc.teacher_id = ? AND tc.role = 'owner'
      `).all(t.id);

      let deviceCount = 0;
      let onlineCount = 0;
      for (const c of classes) {
        deviceCount += db.prepare('SELECT COUNT(*) AS n FROM device WHERE class_id = ?').get(c.id).n;
        onlineCount += hub.onlineCount(c.id);
      }

      return {
        id: t.id,
        username: t.username,
        displayName: t.display_name,
        disabled: t.disabled === 1,
        createdAt: t.created_at,
        classCount: classes.length,
        deviceCount,
        onlineCount,
      };
    });

    return { teachers: result, totalOnline: hub.devices.size };
  });

  app.get('/api/admin/settings', { preHandler: [requireTeacher, requireAdmin] }, async () => ({
    inviteCode: getSetting(db, 'invite_code', config.inviteCode),
  }));

  app.put('/api/admin/settings', { preHandler: [requireTeacher, requireAdmin] }, async (req) => {
    const { inviteCode } = req.body ?? {};
    if (inviteCode !== undefined) setSetting(db, 'invite_code', String(inviteCode).trim());
    return { inviteCode: getSetting(db, 'invite_code', config.inviteCode) };
  });

  app.get('/api/admin/downloads', { preHandler: [requireTeacher, requireAdmin] }, async () => {
    if (!config.webRoot) return { files: [] };
    const dir = join(config.webRoot, 'downloads');
    try {
      const entries = await readdir(dir);
      const files = entries
        .filter((name) => name.endsWith('.exe') || name.endsWith('.dmg') || name.endsWith('.pkg'))
        .map((name) => ({ name, url: `/downloads/${name}` }));
      return { files };
    } catch {
      return { files: [] };
    }
  });

  // 修改用户姓名 / 密码
  app.patch('/api/admin/teachers/:id', { preHandler: [requireTeacher, requireAdmin] }, async (req, reply) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM teacher WHERE id = ?').get(id);
    if (!row) return reply.code(404).send({ error: '用户不存在' });

    const { displayName, password } = req.body ?? {};
    if (displayName !== undefined) {
      const name = String(displayName).trim();
      if (!name) return reply.code(400).send({ error: '姓名不能为空' });
      db.prepare('UPDATE teacher SET display_name = ? WHERE id = ?').run(name, id);
    }
    if (password !== undefined) {
      if (String(password).length < 6) return reply.code(400).send({ error: '密码至少 6 位' });
      db.prepare('UPDATE teacher SET password = ? WHERE id = ?').run(hashPassword(String(password)), id);
    }
    return { ok: true };
  });

  // 停用 / 启用用户
  app.patch('/api/admin/teachers/:id/disabled', { preHandler: [requireTeacher, requireAdmin] }, async (req, reply) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM teacher WHERE id = ?').get(id);
    if (!row) return reply.code(404).send({ error: '用户不存在' });
    if (row.username === config.adminUsername) return reply.code(403).send({ error: '不能停用管理员账号' });
    const disabled = req.body?.disabled ? 1 : 0;
    db.prepare('UPDATE teacher SET disabled = ? WHERE id = ?').run(disabled, id);
    return { ok: true, disabled: disabled === 1 };
  });

  // 删除用户
  app.delete('/api/admin/teachers/:id', { preHandler: [requireTeacher, requireAdmin] }, async (req, reply) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM teacher WHERE id = ?').get(id);
    if (!row) return reply.code(404).send({ error: '用户不存在' });
    if (row.username === config.adminUsername) return reply.code(403).send({ error: '不能删除管理员账号' });
    db.prepare('DELETE FROM teacher WHERE id = ?').run(id);
    return reply.code(204).send();
  });

  // ---------- 教师端 SSE ----------

  app.get('/api/events', async (req, reply) => {
    // EventSource 无法自定义请求头，令牌只能走 query
    const payload = verifyToken(String(req.query?.token ?? ''), config.tokenSecret);
    if (!payload?.tid) return reply.code(401).send({ error: '未登录' });

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // 防止反向代理缓冲导致事件不实时
    });
    reply.raw.write(': connected\n\n');
    hub.addTeacherStream(payload.tid, reply.raw);

    const keepAlive = setInterval(() => reply.raw.write(': ping\n\n'), 20_000);
    req.raw.on('close', () => {
      clearInterval(keepAlive);
      hub.removeTeacherStream(payload.tid, reply.raw);
    });
    return reply;
  });

  app.get('/health', async () => ({ ok: true, devices: hub.devices.size }));

  // ---------- 教室端 WebSocket ----------

  const wss = new WebSocketServer({ noServer: true });

  app.server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname !== '/ws/device') return socket.destroy();

    const device = db.prepare('SELECT * FROM device WHERE token_hash = ?')
      .get(hashDeviceToken(url.searchParams.get('token') ?? ''));
    if (!device) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      hub.attachDevice(device.id, device.class_id, ws);
      db.prepare('UPDATE device SET last_seen_at = ? WHERE id = ?').run(now(), device.id);

      const cls = db.prepare('SELECT name FROM class WHERE id = ?').get(device.class_id);
      ws.send(JSON.stringify({
        type: 'ready', deviceId: device.id, classId: device.class_id, className: cls?.name ?? '',
      }));
      hub.notifyClassTeachers(device.class_id, {
        type: 'device_status', classId: device.class_id, online: hub.onlineCount(device.class_id),
      });
      deliverPending(db, hub, device.id, device.class_id);

      ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        hub.touchDevice(device.id);
        db.prepare('UPDATE device SET last_seen_at = ? WHERE id = ?').run(now(), device.id);
        if (msg.type === 'ack' && msg.id) ackNotice(db, hub, device.id, Number(msg.id));
        if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      });

      ws.on('close', () => {
        hub.detachDevice(device.id, ws);
        hub.notifyClassTeachers(device.class_id, {
          type: 'device_status', classId: device.class_id, online: hub.onlineCount(device.class_id),
        });
      });
    });
  });

  // ---------- 静态资源（托管教师端构建产物，省掉一个 nginx 容器）----------

  if (config.webRoot) {
    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/ws')) {
        return reply.code(404).send({ error: 'not found' });
      }
      const rel = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
      let file = join(config.webRoot, rel);
      try {
        if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      } catch {
        file = join(config.webRoot, 'index.html'); // SPA 回退
      }
      try {
        const body = await readFile(file);
        return reply.type(MIME[extname(file)] ?? 'application/octet-stream').send(body);
      } catch {
        return reply.code(404).send({ error: 'not found' });
      }
    });
  }

  // 定期清理过期未送达的通知
  const sweeper = setInterval(() => expireStaleNotices(db), 60_000);
  sweeper.unref?.();
  app.addHook('onClose', async () => { clearInterval(sweeper); hub.stop(); });

  hub.startHeartbeat();
  return app;
}
