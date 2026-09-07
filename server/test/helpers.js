import { openDb } from '../src/db.js';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/app.js';

export function makeApp(overrides = {}) {
  const config = {
    ...loadConfig({ DATA_DIR: ':memory:', TOKEN_SECRET: 'test-secret', INVITE_CODE: 'SCHOOL2026' }),
    ...overrides,
  };
  const db = openDb(':memory:');
  const app = buildApp(db, config);
  return { app, db, config };
}

export async function registerTeacher(app, username = 'chenfeifei') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username, password: 'pass1234', displayName: '陈老师', inviteCode: 'SCHOOL2026' },
  });
  return res.json();
}

export async function createClass(app, token, name = '五(1)班') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/classes',
    headers: { authorization: `Bearer ${token}` },
    payload: { name },
  });
  return res.json();
}
