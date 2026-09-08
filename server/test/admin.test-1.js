import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, registerTeacher, createClass } from './helpers.js';

// 管理员用户名使用默认值 'admin'
const ADMIN = 'admin';

async function registerAdmin(app) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username: ADMIN, password: 'admin1234', displayName: '管理员', inviteCode: 'SCHOOL2026' },
  });
  assert.equal(res.statusCode, 201, `注册管理员失败: ${res.body}`);
  return res.json().token;
}

describe('管理后台接口', () => {
  let app, db, adminToken, teacherToken;

  before(async () => {
    ({ app, db } = makeApp({ adminUsername: ADMIN }));
    await app.ready();
    adminToken = await registerAdmin(app);
    const t = await registerTeacher(app, 'teacher1');
    teacherToken = t.token;
  });

  after(async () => {
    await app.close();
    db.close();
  });

  // ---------- 权限检查 ----------

  it('未登录访问 admin/stats 返回 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/stats' });
    assert.equal(res.statusCode, 401);
  });

  it('普通班主任访问 admin/stats 返回 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/stats',
      headers: { authorization: `Bearer ${teacherToken}` },
    });
    assert.equal(res.statusCode, 403);
  });

  it('普通班主任访问 admin/settings 返回 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/settings',
      headers: { authorization: `Bearer ${teacherToken}` },
    });
    assert.equal(res.statusCode, 403);
  });

  // ---------- /api/admin/stats ----------

  it('管理员可获取统计数据', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/stats',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(Array.isArray(body.teachers));
    // admin + teacher1 共 2 人
    assert.equal(body.teachers.length, 2);
    assert.equal(typeof body.totalOnline, 'number');

    const adminRow = body.teachers.find(t => t.username === ADMIN);
    assert.ok(adminRow, '统计列表中应包含 admin');
    assert.equal(typeof adminRow.classCount, 'number');
    assert.equal(typeof adminRow.deviceCount, 'number');
    assert.equal(typeof adminRow.onlineCount, 'number');
  });

  it('统计数据反映班级数量', async () => {
    // teacher1 创建一个班级
    await createClass(app, teacherToken, '测试班级');

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/stats',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = res.json();
    const t1 = body.teachers.find(t => t.username === 'teacher1');
    assert.ok(t1, '应包含 teacher1');
    assert.equal(t1.classCount, 1);
  });

  // ---------- /api/admin/settings ----------

  it('管理员可读取初始设置', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/settings',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    // 初始从 config.inviteCode 读取（helpers 里设的 SCHOOL2026）
    assert.equal(body.inviteCode, 'SCHOOL2026');
    assert.equal(body.regOpen, true);
  });

  it('管理员可修改邀请码', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/admin/settings',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { inviteCode: 'NEWCODE99' },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.inviteCode, 'NEWCODE99');
  });

  it('修改邀请码后注册时必须使用新码', async () => {
    // 先确认新码已生效
    const good = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'newteacher', password: 'pass1234', displayName: '新老师', inviteCode: 'NEWCODE99' },
    });
    assert.equal(good.statusCode, 201, `使用新邀请码注册应成功: ${good.body}`);

    // 旧码已失效
    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'another', password: 'pass1234', displayName: '另一个老师', inviteCode: 'SCHOOL2026' },
    });
    assert.equal(bad.statusCode, 403, '旧邀请码应被拒绝');
  });

  it('管理员可关闭注册', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/admin/settings',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { regOpen: false },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().regOpen, false);

    // 关闭后任何人都无法注册
    const attempt = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'blocked', password: 'pass1234', displayName: '被拦截', inviteCode: 'NEWCODE99' },
    });
    assert.equal(attempt.statusCode, 403);
    assert.ok(attempt.json().error.includes('不开放注册'));
  });

  it('管理员重新开放注册后可正常注册', async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/admin/settings',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { regOpen: true },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'reopen', password: 'pass1234', displayName: '重开老师', inviteCode: 'NEWCODE99' },
    });
    assert.equal(res.statusCode, 201, `重新开放后注册应成功: ${res.body}`);
  });

  // ---------- /api/me 的 isAdmin 字段 ----------

  it('/api/me 对管理员返回 isAdmin: true', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().isAdmin, true);
  });

  it('/api/me 对普通班主任返回 isAdmin: false', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { authorization: `Bearer ${teacherToken}` },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().isAdmin, false);
  });
});
