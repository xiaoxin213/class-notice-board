import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { buildApp } from './app.js';
import { hashPassword } from './auth.js';

const config = loadConfig();
config.webRoot = process.env.WEB_ROOT || null;

// 同时支持裸名（Docker compose 映射后）和 CNB_ 前缀（本地直接读 .env）
const env = (key) => process.env[key] || process.env[`CNB_${key}`];

if (!env('TOKEN_SECRET')) {
  console.warn('[警告] 未设置 TOKEN_SECRET，本次使用随机密钥，重启后所有登录态会失效。');
}

const db = openDb(config.dataDir);

// 启动时自动建管理员账号（幂等，仅首次有效）
const initUser = env('INIT_ADMIN_USERNAME');
if (initUser) {
  const exists = db.prepare('SELECT 1 FROM teacher WHERE username = ?').get(initUser);
  if (!exists) {
    const pwd  = env('INIT_ADMIN_PASSWORD')    || 'Admin@123';
    const name = env('INIT_ADMIN_DISPLAY_NAME') || initUser;
    db.prepare('INSERT INTO teacher (username, password, display_name, created_at) VALUES (?, ?, ?, ?)')
      .run(initUser, hashPassword(pwd), name, Math.floor(Date.now() / 1000));
    console.log(`[初始化] 已创建账号: ${initUser}`);
  }
}
const app = buildApp(db, config, { logger: { level: env('LOG_LEVEL') || 'info' } });

const shutdown = async (signal) => {
  app.log.info(`收到 ${signal}，正在关闭`);
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

await app.listen({ host: config.host, port: config.port });
