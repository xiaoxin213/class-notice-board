/**
 * 连接中枢。
 * - 教室端：WebSocket 长连接，服务端定时下发心跳，超时判离线
 * - 教师端：SSE 单向下行，用于推送在线状态与送达回执
 * 在线状态只放内存，进程重启后由教室端重连自然恢复，不引入 Redis。
 */
export class Hub {
  constructor(db, config) {
    this.db = db;
    this.config = config;
    this.devices = new Map();  // deviceId -> { ws, classId, lastSeen }
    this.teachers = new Map(); // teacherId -> Set<ServerResponse>
    this.timer = null;
  }

  // ---- 教室端 ----

  attachDevice(deviceId, classId, ws) {
    this.devices.get(deviceId)?.ws.close(4000, 'replaced');
    this.devices.set(deviceId, { ws, classId, lastSeen: Date.now() });
  }

  detachDevice(deviceId, ws) {
    const entry = this.devices.get(deviceId);
    if (entry && entry.ws === ws) this.devices.delete(deviceId);
  }

  touchDevice(deviceId) {
    const entry = this.devices.get(deviceId);
    if (entry) entry.lastSeen = Date.now();
  }

  isOnline(deviceId) {
    return this.devices.has(deviceId);
  }

  onlineDeviceIds(classId) {
    const ids = [];
    for (const [id, e] of this.devices) if (e.classId === classId) ids.push(id);
    return ids;
  }

  onlineCount(classId) {
    return this.onlineDeviceIds(classId).length;
  }

  sendToDevice(deviceId, frame) {
    const entry = this.devices.get(deviceId);
    if (!entry || entry.ws.readyState !== 1) return false;
    entry.ws.send(JSON.stringify(frame));
    return true;
  }

  sendToClass(classId, frame) {
    let sent = 0;
    for (const id of this.onlineDeviceIds(classId)) {
      if (this.sendToDevice(id, frame)) sent += 1;
    }
    return sent;
  }

  // ---- 教师端 ----

  addTeacherStream(teacherId, res) {
    if (!this.teachers.has(teacherId)) this.teachers.set(teacherId, new Set());
    this.teachers.get(teacherId).add(res);
  }

  removeTeacherStream(teacherId, res) {
    const set = this.teachers.get(teacherId);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) this.teachers.delete(teacherId);
  }

  /** 推给与该班级有关联的所有在线教师 */
  notifyClassTeachers(classId, event) {
    const rows = this.db
      .prepare('SELECT teacher_id FROM teacher_class WHERE class_id = ?')
      .all(classId);
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const { teacher_id: tid } of rows) {
      for (const res of this.teachers.get(tid) ?? []) {
        res.write(payload);
      }
    }
  }

  // ---- 心跳 ----

  startHeartbeat() {
    if (this.timer) return;
    const { heartbeatIntervalMs, offlineTimeoutMs } = this.config;
    this.timer = setInterval(() => {
      const deadline = Date.now() - offlineTimeoutMs;
      for (const [id, entry] of [...this.devices]) {
        if (entry.lastSeen < deadline) {
          entry.ws.close(4001, 'heartbeat timeout');
          this.devices.delete(id);
          this.notifyClassTeachers(entry.classId, {
            type: 'device_status', classId: entry.classId, online: this.onlineCount(entry.classId),
          });
          continue;
        }
        this.sendToDevice(id, { type: 'ping', ts: Date.now() });
      }
    }, heartbeatIntervalMs);
    this.timer.unref?.();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    for (const { ws } of this.devices.values()) ws.close(1001, 'shutdown');
    this.devices.clear();
    for (const set of this.teachers.values()) for (const res of set) res.end();
    this.teachers.clear();
  }
}
