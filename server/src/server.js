import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { buildApp } from './app.js';

const config = loadConfig();
config.webRoot = process.env.WEB_ROOT || null;

if (!process.env.TOKEN_SECRET) {
  console.warn('[警告] 未设置 TOKEN_SECRET，本次使用随机密钥，重启后所有登录态会失效。');
}

const db = openDb(config.dataDir);
const app = buildApp(db, config, { logger: { level: process.env.LOG_LEVEL || 'info' } });

const shutdown = async (signal) => {
  app.log.info(`收到 ${signal}，正在关闭`);
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

await app.listen({ host: config.host, port: config.port });
