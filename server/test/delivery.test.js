import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { makeApp, registerTeacher, createClass } from './helpers.js';

/**
 * 从连接建立那一刻就缓存所有帧。
 * 服务端在 ready 之后会立刻补投待送通知，若等 ready 返回后才挂监听会漏帧。
 */
function connect(url) {
  const ws = new WebSocket(url);
  ws.frames = [];
  ws.waiters = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    ws.frames.push(msg);
    for (const w of [...ws.waiters]) {
      if (w.type === msg.type) {
        ws.waiters.splice(ws.waiters.indexOf(w), 1);
        w.resolve(msg);
      }
    }
  });
  return ws;
}

function waitFrame(ws, type, timeout = 3000) {
  const buffered = ws.frames.find((f) => f.type === type);
  if (buffered) return Promise.resolve(buffered);
  return new Promise((resolve, reject) => {
    const waiter = { type, resolve };
    ws.waiters.push(waiter);
    const timer = setTimeout(() => {
      const i = ws.waiters.indexOf(waiter);
      if (i >= 0) { ws.waiters.splice(i, 1); reject(new Error(`等待 ${type} 帧超时`)); }
    }, timeout);
    timer.unref?.();
  });
}

const closeSocket = (ws) => new Promise((resolve) => {
  if (ws.readyState === WebSocket.CLOSED) return resolve();
  ws.on('close', resolve);
  ws.close();
});

/** 每个用例独立起一个实例，避免设备在线状态跨用例污染 */
async function setup(t, overrides = {}) {
  const ctx = makeApp(overrides);
  const sockets = [];
  await ctx.app.listen({ port: 0, host: '127.0.0.1' });
  const base = `ws://127.0.0.1:${ctx.app.server.address().port}`;
  const { token } = await registerTeacher(ctx.app);
  const { id: classId } = await createClass(ctx.app, token);
  const auth = { authorization: `Bearer ${token}` };

  t.after(async () => {
    await Promise.all(sockets.map(closeSocket));
    await ctx.app.close();
    ctx.db.close();
  });

  return {
    ctx, classId, auth, base, sockets,

    /** version 默认模拟新版客户端；传 null 模拟不上报版本号的旧版客户端 */
    async bindDevice({ version = '1.1.0', deviceName = '五一班教室机' } = {}) {
      const { code } = (await ctx.app.inject({
        method: 'POST', url: `/api/classes/${classId}/bind-code`, headers: auth,
      })).json();
      const bound = (await ctx.app.inject({
        method: 'POST', url: '/api/device/bind', payload: { code, deviceName },
      })).json();
      const v = version ? `&v=${encodeURIComponent(version)}` : '';
      const ws = connect(`${base}/ws/device?token=${bound.deviceToken}${v}`);
      sockets.push(ws);
      await waitFrame(ws, 'ready');
      return { ws, ...bound };
    },

    publish(content, extra = {}) {
      return ctx.app.inject({
        method: 'POST', url: '/api/notices', headers: auth, payload: { classId, content, ...extra },
      });
    },

    classes() {
      return ctx.app.inject({ url: '/api/classes', headers: auth }).then((r) => r.json());
    },
  };
}

describe('教室端投递', () => {
  test('设备令牌无效时握手被拒绝', async (t) => {
    const s = await setup(t);
    const ws = new WebSocket(`${s.base}/ws/device?token=bogus`);
    await new Promise((resolve) => ws.on('error', resolve));
    assert.equal(ws.readyState, WebSocket.CLOSED);
  });

  test('设备上线后班级在线数变为 1', async (t) => {
    const s = await setup(t);
    await s.bindDevice();
    const body = await s.classes();
    assert.equal(body.classes.find((c) => c.id === s.classId).online, 1);
  });

  test('发布的通知能实时下发到在线教室端，字段完整', async (t) => {
    const s = await setup(t);
    const { ws } = await s.bindDevice();
    const res = await s.publish('请全班同学马上到操场集合。', { displaySeconds: 60, speakTimes: 2 });
    assert.equal(res.json().sentTo, 1);

    const frame = await waitFrame(ws, 'notice');
    assert.equal(frame.content, '请全班同学马上到操场集合。');
    assert.equal(frame.publisher, '陈老师');
    assert.equal(frame.displaySeconds, 60);
    assert.equal(frame.speakTimes, 2);
    assert.ok(frame.expireAt > Math.floor(Date.now() / 1000));
  });

  test('教室端回执后通知状态变为 delivered', async (t) => {
    const s = await setup(t);
    const { ws } = await s.bindDevice();
    await s.publish('带作业本来办公室。');
    const frame = await waitFrame(ws, 'notice');

    ws.send(JSON.stringify({ type: 'ack', id: frame.id, status: 'displayed' }));
    await new Promise((r) => setTimeout(r, 150));

    const list = (await s.ctx.app.inject({
      url: `/api/notices?classId=${s.classId}`, headers: s.auth,
    })).json();
    assert.equal(list.notices.find((n) => n.id === frame.id).status, 'delivered');
  });

  test('离线时发布的通知，设备上线后在 TTL 内补投一次', async (t) => {
    const s = await setup(t);
    const res = await s.publish('课代表来办公室。'); // 此刻无设备在线
    assert.equal(res.json().sentTo, 0);

    const { ws } = await s.bindDevice();
    const frame = await waitFrame(ws, 'notice');
    assert.equal(frame.content, '课代表来办公室。');
  });

  test('补投过的通知不会重复下发', async (t) => {
    const s = await setup(t);
    await s.publish('请到办公室。');
    const { ws } = await s.bindDevice();
    await waitFrame(ws, 'notice');
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(ws.frames.filter((f) => f.type === 'notice').length, 1);
  });

  test('已过期的通知不会补投', async (t) => {
    const s = await setup(t, { noticeTtlSeconds: -1 });
    await s.publish('早已过期的通知');
    const { ws } = await s.bindDevice();
    await new Promise((r) => setTimeout(r, 250));
    assert.ok(!ws.frames.some((f) => f.type === 'notice'), '过期通知不应被补投');
  });

  test('声音测试指令能下发到教室端', async (t) => {
    const s = await setup(t);
    const { ws } = await s.bindDevice();
    const res = await s.ctx.app.inject({
      method: 'POST', url: `/api/classes/${s.classId}/sound-test`, headers: s.auth,
    });
    assert.equal(res.json().sentTo, 1);
    assert.ok((await waitFrame(ws, 'sound_test')).text);
  });

  test('设备断开后在线数归零', async (t) => {
    const s = await setup(t);
    const { ws } = await s.bindDevice();
    await closeSocket(ws);
    await new Promise((r) => setTimeout(r, 150));
    const body = await s.classes();
    assert.equal(body.classes.find((c) => c.id === s.classId).online, 0);
  });

  test('同一设备重复连接时旧连接被顶下线，在线数仍为 1', async (t) => {
    const s = await setup(t);
    const { deviceToken } = await s.bindDevice();
    const second = connect(`${s.base}/ws/device?token=${deviceToken}`);
    s.sockets.push(second);
    await waitFrame(second, 'ready');
    await new Promise((r) => setTimeout(r, 150));
    const body = await s.classes();
    assert.equal(body.classes.find((c) => c.id === s.classId).online, 1);
  });
});

describe('发布时选择展示方式与语音播报', () => {
  test('默认全屏 + 播报，帧里带上 displayMode / speak', async (t) => {
    const s = await setup(t);
    const { ws } = await s.bindDevice();
    await s.publish('请到办公室。');
    const frame = await waitFrame(ws, 'notice');
    assert.equal(frame.displayMode, 'fullscreen');
    assert.equal(frame.speak, true);
    assert.equal(frame.speakTimes, 2);
  });

  test('可选浮窗 + 不播报，并写入发布记录', async (t) => {
    const s = await setup(t);
    const { ws } = await s.bindDevice();
    await s.publish('明天带红领巾。', { displayMode: 'toast', speak: false });
    const frame = await waitFrame(ws, 'notice');
    assert.equal(frame.displayMode, 'toast');
    assert.equal(frame.speak, false);

    const list = (await s.ctx.app.inject({
      url: `/api/notices?classId=${s.classId}`, headers: s.auth,
    })).json();
    const row = list.notices.find((n) => n.id === frame.id);
    assert.equal(row.display_mode, 'toast');
    assert.equal(row.speak, 0);
  });

  test('非法的展示方式按全屏处理', async (t) => {
    const s = await setup(t);
    const { ws } = await s.bindDevice();
    await s.publish('到操场集合。', { displayMode: 'bogus' });
    assert.equal((await waitFrame(ws, 'notice')).displayMode, 'fullscreen');
  });

  test('补投的通知同样保留发布时的展示方式', async (t) => {
    const s = await setup(t);
    await s.publish('课代表来办公室。', { displayMode: 'toast', speak: false });
    const { ws } = await s.bindDevice();
    const frame = await waitFrame(ws, 'notice');
    assert.equal(frame.displayMode, 'toast');
    assert.equal(frame.speak, false);
  });
});

describe('新旧版本教室端兼容', () => {
  test('设备列表返回客户端版本，旧版为 null', async (t) => {
    const s = await setup(t);
    await s.bindDevice({ version: '1.1.0', deviceName: '前屏' });
    await s.bindDevice({ version: null, deviceName: '后屏' });
    const { devices } = (await s.ctx.app.inject({
      url: `/api/classes/${s.classId}/devices`, headers: s.auth,
    })).json();
    assert.equal(devices.find((d) => d.name === '前屏').client_version, '1.1.0');
    assert.equal(devices.find((d) => d.name === '后屏').client_version, null);
  });

  test('发布结果返回在线旧版设备数', async (t) => {
    const s = await setup(t);
    await s.bindDevice({ version: '1.1.0', deviceName: '前屏' });
    await s.bindDevice({ version: null, deviceName: '后屏' });
    const body = (await s.publish('请到办公室。')).json();
    assert.equal(body.online, 2);
    assert.equal(body.legacyOnline, 1);
  });

  test('非法版本号按旧版处理', async (t) => {
    const s = await setup(t);
    await s.bindDevice({ version: '<script>' });
    assert.equal((await s.publish('测试')).json().legacyOnline, 1);
  });

  test('旧版设备上线时收到一次升级提示（id=0），回执被忽略', async (t) => {
    const s = await setup(t);
    const { ws } = await s.bindDevice({ version: null });
    const frame = await waitFrame(ws, 'notice');
    assert.equal(frame.id, 0);
    assert.match(frame.content, /新版本/);
    ws.send(JSON.stringify({ type: 'ack', id: frame.id }));
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(ws.readyState, WebSocket.OPEN);
  });

  test('升级提示 24 小时内只推一次', async (t) => {
    const s = await setup(t);
    const { ws, deviceToken } = await s.bindDevice({ version: null });
    await waitFrame(ws, 'notice');
    const again = connect(`${s.base}/ws/device?token=${deviceToken}`);
    s.sockets.push(again);
    await waitFrame(again, 'ready');
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(!again.frames.some((f) => f.type === 'notice'), '24 小时内不应重复提示');
  });

  test('旧版设备有补投通知时不推升级提示，避免顶掉真实通知', async (t) => {
    const s = await setup(t);
    await s.publish('请到办公室。');
    const { ws } = await s.bindDevice({ version: null });
    await waitFrame(ws, 'notice');
    await new Promise((r) => setTimeout(r, 200));
    const notices = ws.frames.filter((f) => f.type === 'notice');
    assert.equal(notices.length, 1);
    assert.equal(notices[0].content, '请到办公室。');
  });

  test('新版设备不会收到升级提示', async (t) => {
    const s = await setup(t);
    const { ws } = await s.bindDevice();
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(!ws.frames.some((f) => f.type === 'notice'));
  });

  test('关闭 LEGACY_UPGRADE_PROMPT 后不推升级提示', async (t) => {
    const s = await setup(t, { legacyUpgradePrompt: false });
    const { ws } = await s.bindDevice({ version: null });
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(!ws.frames.some((f) => f.type === 'notice'));
  });
});
