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
    speakTimes: notice.speak_times,
    expireAt: notice.expire_at,
  };
}

export function publishNotice(db, hub, config, { classId, teacherId, content, displaySeconds, speakTimes }) {
  const ts = now();
  const info = db.prepare(`
    INSERT INTO notice (class_id, publisher_id, content, display_seconds, speak_times, expire_at, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(classId, teacherId, content, displaySeconds, speakTimes, ts + config.noticeTtlSeconds, ts);

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
