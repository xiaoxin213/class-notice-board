import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS teacher (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT    NOT NULL UNIQUE,
  password     TEXT    NOT NULL,
  display_name TEXT    NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS class (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS teacher_class (
  teacher_id INTEGER NOT NULL REFERENCES teacher(id) ON DELETE CASCADE,
  class_id   INTEGER NOT NULL REFERENCES class(id)   ON DELETE CASCADE,
  role       TEXT    NOT NULL DEFAULT 'owner',
  PRIMARY KEY (teacher_id, class_id)
);

CREATE TABLE IF NOT EXISTS device (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id     INTEGER NOT NULL REFERENCES class(id) ON DELETE CASCADE,
  token_hash   TEXT    NOT NULL UNIQUE,
  name         TEXT    NOT NULL DEFAULT '教室电脑',
  last_seen_at INTEGER,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_device_class ON device(class_id);

CREATE TABLE IF NOT EXISTS bind_code (
  code       TEXT    PRIMARY KEY,
  class_id   INTEGER NOT NULL REFERENCES class(id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL REFERENCES teacher(id),
  expire_at  INTEGER NOT NULL,
  used_at    INTEGER
);

CREATE TABLE IF NOT EXISTS notice (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id        INTEGER NOT NULL REFERENCES class(id) ON DELETE CASCADE,
  publisher_id    INTEGER NOT NULL REFERENCES teacher(id),
  content         TEXT    NOT NULL,
  display_seconds INTEGER NOT NULL DEFAULT 60,
  speak_times     INTEGER NOT NULL DEFAULT 2,
  expire_at       INTEGER NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'pending',
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notice_class ON notice(class_id, id DESC);

CREATE TABLE IF NOT EXISTS notice_delivery (
  notice_id INTEGER NOT NULL REFERENCES notice(id) ON DELETE CASCADE,
  device_id INTEGER NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  status    TEXT    NOT NULL DEFAULT 'sent',
  acked_at  INTEGER,
  PRIMARY KEY (notice_id, device_id)
);

CREATE TABLE IF NOT EXISTS setting (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function openDb(dataDir) {
  const file = dataDir === ':memory:' ? ':memory:' : join(dataDir, 'data.db');
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });

  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);

  // node:sqlite 没有 transaction()，补上一个与 better-sqlite3 API 兼容的实现
  db.transaction = (fn) => (...args) => {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };

  return db;
}

export const now = () => Math.floor(Date.now() / 1000);
