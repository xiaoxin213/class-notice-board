import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, registerTeacher, createClass } from './helpers.js';

const apps = [];
const app = () => { const ctx = makeApp(); apps.push(ctx); return ctx; };
after(async () => { for (const c of apps) { await c.app.close(); c.db.close(); } });

describe('账号', () => {
  test('邀请码不正确时拒绝注册', async () => {
    const { app: a } = app();
    const res = await a.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'someone', password: 'pass1234', inviteCode: '000000' },
    });
    assert.equal(res.statusCode, 403);
  });

  test('注册后可用返回的令牌访问 /api/me', async () => {
    const { app: a } = app();
    const { token } = await registerTeacher(a);
    const res = await a.inject({ url: '/api/me', headers: { authorization: `Bearer ${token}` } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().displayName, '陈老师');
  });

  test('重复账号名返回 409', async () => {
    const { app: a } = app();
    await registerTeacher(a);
    const res = await a.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'chenfeifei', password: 'pass1234', inviteCode: 'SCHOOL2026' },
    });
    assert.equal(res.statusCode, 409);
  });

  test('密码错误无法登录', async () => {
    const { app: a } = app();
    await registerTeacher(a);
    const res = await a.inject({
      method: 'POST', url: '/api/auth/login', payload: { username: 'chenfeifei', password: 'wrong' },
    });
    assert.equal(res.statusCode, 401);
  });

  test('无令牌访问受保护接口返回 401', async () => {
    const { app: a } = app();
    assert.equal((await a.inject({ url: '/api/classes' })).statusCode, 401);
  });

  test('被篡改的令牌无法通过校验', async () => {
    const { app: a } = app();
    const { token } = await registerTeacher(a);
    const forged = `${token.split('.')[0]}.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`;
    const res = await a.inject({ url: '/api/me', headers: { authorization: `Bearer ${forged}` } });
    assert.equal(res.statusCode, 401);
  });
});

describe('班级', () => {
  test('创建后出现在列表中且在线数为 0', async () => {
    const { app: a } = app();
    const { token } = await registerTeacher(a);
    await createClass(a, token);
    const body = (await a.inject({ url: '/api/classes', headers: { authorization: `Bearer ${token}` } })).json();
    assert.equal(body.classes.length, 1);
    assert.equal(body.classes[0].name, '五(1)班');
    assert.equal(body.classes[0].online, 0);
  });

  test('达到班级数上限后拒绝创建', async () => {
    const ctx = makeApp({ maxClassesPerTeacher: 2 });
    apps.push(ctx);
    const { token } = await registerTeacher(ctx.app);
    await createClass(ctx.app, token, '一班');
    await createClass(ctx.app, token, '二班');
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/classes',
      headers: { authorization: `Bearer ${token}` }, payload: { name: '三班' },
    });
    assert.equal(res.statusCode, 400);
  });

  test('不能操作别人的班级', async () => {
    const { app: a } = app();
    const { token: t1 } = await registerTeacher(a, 'teacher1');
    const { token: t2 } = await registerTeacher(a, 'teacher2');
    const cls = await createClass(a, t1);
    const res = await a.inject({
      method: 'POST', url: '/api/notices',
      headers: { authorization: `Bearer ${t2}` }, payload: { classId: cls.id, content: '测试' },
    });
    assert.equal(res.statusCode, 403);
  });
});

describe('绑定码', () => {
  test('生成的绑定码为 6 位数字并带过期时间', async () => {
    const { app: a } = app();
    const { token } = await registerTeacher(a);
    const cls = await createClass(a, token);
    const res = await a.inject({
      method: 'POST', url: `/api/classes/${cls.id}/bind-code`, headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.statusCode, 201);
    assert.match(res.json().code, /^\d{6}$/);
    assert.ok(res.json().expireAt > Math.floor(Date.now() / 1000));
  });

  test('绑定成功后该码作废，不能二次使用', async () => {
    const { app: a } = app();
    const { token } = await registerTeacher(a);
    const cls = await createClass(a, token);
    const { code } = (await a.inject({
      method: 'POST', url: `/api/classes/${cls.id}/bind-code`, headers: { authorization: `Bearer ${token}` },
    })).json();

    const first = await a.inject({ method: 'POST', url: '/api/device/bind', payload: { code } });
    assert.equal(first.statusCode, 201);
    assert.equal(first.json().className, '五(1)班');
    assert.ok(first.json().deviceToken);

    const second = await a.inject({ method: 'POST', url: '/api/device/bind', payload: { code } });
    assert.equal(second.statusCode, 400);
  });

  test('过期的绑定码不可用', async () => {
    const ctx = makeApp({ bindCodeTtlSeconds: -1 });
    apps.push(ctx);
    const { token } = await registerTeacher(ctx.app);
    const cls = await createClass(ctx.app, token);
    const { code } = (await ctx.app.inject({
      method: 'POST', url: `/api/classes/${cls.id}/bind-code`, headers: { authorization: `Bearer ${token}` },
    })).json();
    const res = await ctx.app.inject({ method: 'POST', url: '/api/device/bind', payload: { code } });
    assert.equal(res.statusCode, 400);
  });

  test('连续猜错绑定码会被限流', async () => {
    const { app: a } = app();
    let limited = false;
    for (let i = 0; i < 15; i += 1) {
      const res = await a.inject({ method: 'POST', url: '/api/device/bind', payload: { code: '000000' } });
      if (res.statusCode === 429) { limited = true; break; }
    }
    assert.ok(limited, '应在多次失败后返回 429');
  });
});

describe('通知校验', () => {
  test('空内容被拒绝', async () => {
    const { app: a } = app();
    const { token } = await registerTeacher(a);
    const cls = await createClass(a, token);
    const res = await a.inject({
      method: 'POST', url: '/api/notices',
      headers: { authorization: `Bearer ${token}` }, payload: { classId: cls.id, content: '   ' },
    });
    assert.equal(res.statusCode, 400);
  });

  test('超过字数上限被拒绝', async () => {
    const { app: a } = app();
    const { token } = await registerTeacher(a);
    const cls = await createClass(a, token);
    const res = await a.inject({
      method: 'POST', url: '/api/notices',
      headers: { authorization: `Bearer ${token}` }, payload: { classId: cls.id, content: '通'.repeat(201) },
    });
    assert.equal(res.statusCode, 400);
  });

  test('无设备在线时仍可发布，sentTo 为 0', async () => {
    const { app: a } = app();
    const { token } = await registerTeacher(a);
    const cls = await createClass(a, token);
    const res = await a.inject({
      method: 'POST', url: '/api/notices',
      headers: { authorization: `Bearer ${token}` },
      payload: { classId: cls.id, content: '请全班同学马上到操场集合。' },
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().sentTo, 0);
  });
});
