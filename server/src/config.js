import { randomBytes } from 'node:crypto';

const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));

export function loadConfig(env = process.env) {
  return {
    host: env.HOST || '0.0.0.0',
    port: int(env.PORT, 3210),
    dataDir: env.DATA_DIR || './data',
    // 生产环境必须显式设置，否则重启后所有登录态失效
    tokenSecret: env.TOKEN_SECRET || randomBytes(32).toString('hex'),
    // 注册邀请码初始值（写入 DB 后以 DB 为准），留空表示开放注册
    inviteCode: env.INVITE_CODE || '',
    // 管理员账号用户名，登录后可访问管理后台
    adminUsername: env.ADMIN_USERNAME || 'admin',
    // 登录态有效期
    tokenTtlSeconds: int(env.TOKEN_TTL_SECONDS, 30 * 24 * 3600),
    // 绑定码有效期
    bindCodeTtlSeconds: int(env.BIND_CODE_TTL_SECONDS, 30 * 60),
    // 通知默认存活时间：超时未送达即作废，不再补投
    noticeTtlSeconds: int(env.NOTICE_TTL_SECONDS, 300),
    // 单账号班级数上限
    maxClassesPerTeacher: int(env.MAX_CLASSES, 50),
    // 通知正文长度上限
    maxNoticeLength: int(env.MAX_NOTICE_LENGTH, 200),
    heartbeatIntervalMs: int(env.HEARTBEAT_INTERVAL_MS, 25_000),
    offlineTimeoutMs: int(env.OFFLINE_TIMEOUT_MS, 60_000),
    // 静态文件目录，生产环境设为 web/dist 的路径
    webRoot: env.WEB_ROOT || '',
  };
}
