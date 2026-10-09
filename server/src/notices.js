import { now } from './db.js';

/** 下发给教室端的通知帧 */
function noticeFrame(notice, publisherName) {
  return {
    type: 'notice',
    id: notice.id,
    content: notice.content,
    publisher: publisherName,
    publishedAt: notice.created_at,
    displaySeconds: notice.display_seconds,
    // 新版客户端读取以下两个字段；旧版客户端会忽略，按本地设置展示并播报 speakTimes 次
    displayMode: notice.display_mode ?? 'fullscreen',
    speak: notice.speak !== 0,
    speakTimes: notice.speak_times,
    expireAt: notice.expire_at,
  };
}

/** 发给旧版客户端的升级提示，借用 notice 帧（id=0，旧版回执时服务端会忽略） */
export const UPGRADE_PROMPT_TEXT = '教室端有新版本，请联系管理员安装新版客户端。';
function upgradePromptFrame() {
  return {
    type: 'notice',
    id: 0,
    content: UPGRADE_PROMPT_TEXT,
    publisher: '系统',
    publishedAt: now(),
    displaySeconds: 20,
    displayMode: 'toast',
    speak: false,
    speakTimes: 1,
    expireAt: now() + 60,
  };
}

/**
 * 旧版设备上线且本次没有补投通知时，推一次升级提示；每台设备 24 小时内最多一次。
 * 有补投时不推：旧版客户端只有一个展示窗口，后到的帧会顶掉正在展示的真实通知。
 */
export function maybePromptUpgrade(db, hub, deviceId) {
  const row = db.prepare('SELECT upgrade_prompted_at FROM device WHERE id = ?').get(deviceId);
  if (!row || (row.upgrade_prompted_at && row.upgrade_prompted_at > now() - 24 * 3600)) return false;
  if (!hub.sendToDevice(deviceId, upgradePromptFrame())) return false;
  db.prepare('UPDATE device SET upgrade_prompted_at = ? WHERE id = ?').run(now(), deviceId);
  return true;
}

export function publishNotice(db, hub, config, {
  classId, teacherId, content, displaySeconds, speakTimes, displayMode = 'fullscreen', speak = true,
}) {
  const ts = now();
  const info = db.prepare(`
    INSERT INTO notice (class_id, publisher_id, content, display_seconds, speak_times, display_mode, speak,
                        expire_at, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(classId, teacherId, content, displaySeconds, speakTimes, displayMode, speak ? 1 : 0,
    ts + config.noticeTtlSeconds, ts);

  const notice = db.prepare('SELECT * FROM notice WHERE id = ?').get(info.lastInsertRowid);
  const publisher = db.prepare('SELECT display_name FROM teacher WHERE id = ?').get(teacherId);

  const sentTo = dispatch(db, hub, notice, publisher.display_name);
  return { notice, sentTo };
}

/** 把一条通知推给该班级当前在线的设备，返回实际送出的台数 */
function dispatch(db, hub, notice, publisherName) {
  const frame = noticeFrame(notice, publisherName);
  const record = db.prepare(`
    INSERT INTO notice_delivery (notice_id, device_id, status) VALUES (?, ?, 'sent')
    ON CONFLICT(notice_id, device_id) DO NOTHING
  `);

  let sent = 0;
  for (const deviceId of hub.onlineDeviceIds(notice.class_id)) {
    if (hub.sendToDevice(deviceId, frame)) {
      record.run(notice.id, deviceId);
      sent += 1;
    }
  }
  return sent;
}

/**
 * 设备上线时补投未过期的待送通知。
 * 只补投 TTL 内的——学生都放学了还在喊"到操场集合"是负价值。
 */
export function deliverPending(db, hub, deviceId, classId) {
  const rows = db.prepare(`
    SELECT n.*, t.display_name AS publisher_name
    FROM notice n
    JOIN teacher t ON t.id = n.publisher_id
    LEFT JOIN notice_delivery d ON d.notice_id = n.id AND d.device_id = ?
    WHERE n.class_id = ? AND n.expire_at > ? AND d.notice_id IS NULL
    ORDER BY n.id ASC
  `).all(deviceId, classId, now());

  for (const row of rows) {
    if (hub.sendToDevice(deviceId, noticeFrame(row, row.publisher_name))) {
      db.prepare(`
        INSERT INTO notice_delivery (notice_id, device_id, status) VALUES (?, ?, 'sent')
        ON CONFLICT(notice_id, device_id) DO NOTHING
      `).run(row.id, deviceId);
    }
  }
  return rows.length;
}

/** 教室端回执：标记送达，全部送达则整条通知置为 delivered */
export function ackNotice(db, hub, deviceId, noticeId) {
  const updated = db.prepare(`
    UPDATE notice_delivery SET status = 'delivered', acked_at = ?
    WHERE notice_id = ? AND device_id = ? AND status != 'delivered'
  `).run(now(), noticeId, deviceId);
  if (updated.changes === 0) return null;

  const notice = db.prepare('SELECT * FROM notice WHERE id = ?').get(noticeId);
  if (!notice) return null;

  const pending = db.prepare(
    "SELECT COUNT(*) AS c FROM notice_delivery WHERE notice_id = ? AND status != 'delivered'",
  ).get(noticeId).c;

  if (pending === 0) {
    db.prepare("UPDATE notice SET status = 'delivered' WHERE id = ?").run(noticeId);
  }

  hub.notifyClassTeachers(notice.class_id, {
    type: 'notice_ack', noticeId, classId: notice.class_id, deviceId, allDelivered: pending === 0,
  });
  return notice;
}

/** 把超时仍未送达的通知标记作废，避免 pending 无限堆积 */
export function expireStaleNotices(db) {
  return db.prepare(
    "UPDATE notice SET status = 'expired' WHERE status = 'pending' AND expire_at <= ?",
  ).run(now()).changes;
}
