import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeApp } from './helpers.js';

describe('静态文件与安装包下载（教室端自动更新依赖此接口）', () => {
  let ctx, root;
  const body = Buffer.from('0123456789abcdefghij'); // 20 字节

  before(() => {
    root = mkdtempSync(join(tmpdir(), 'cnb-web-'));
    mkdirSync(join(root, 'downloads'));
    writeFileSync(join(root, 'index.html'), '<html>spa</html>');
    writeFileSync(join(root, 'downloads', '班级通知屏-Setup-v1.1.1.exe'), body);
    writeFileSync(join(root, 'downloads', 'latest.yml'), 'version: 1.1.1\n');
    ctx = makeApp({ webRoot: root });
  });
  after(async () => { await ctx.app.close(); ctx.db.close(); rmSync(root, { recursive: true, force: true }); });

  const exe = '/downloads/' + encodeURIComponent('班级通知屏-Setup-v1.1.1.exe');

  test('中文文件名的安装包可下载，声明支持 Range', async () => {
    const res = await ctx.app.inject({ url: exe });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['accept-ranges'], 'bytes');
    assert.equal(Number(res.headers['content-length']), body.length);
    assert.deepEqual(res.rawPayload, body);
  });

  test('latest.yml 可访问', async () => {
    const res = await ctx.app.inject({ url: '/downloads/latest.yml' });
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /version: 1\.1\.1/);
  });

  test('单段 Range 返回 206 和对应片段', async () => {
    const res = await ctx.app.inject({ url: exe, headers: { range: 'bytes=5-9' } });
    assert.equal(res.statusCode, 206);
    assert.equal(res.headers['content-range'], `bytes 5-9/${body.length}`);
    assert.equal(res.body, '56789');
  });

  test('开放结尾与后缀 Range', async () => {
    assert.equal((await ctx.app.inject({ url: exe, headers: { range: 'bytes=15-' } })).body, 'fghij');
    assert.equal((await ctx.app.inject({ url: exe, headers: { range: 'bytes=-3' } })).body, 'hij');
  });

  test('越界 Range 返回 416', async () => {
    const res = await ctx.app.inject({ url: exe, headers: { range: 'bytes=100-200' } });
    assert.equal(res.statusCode, 416);
  });

  test('多段 Range 退回整个文件', async () => {
    const res = await ctx.app.inject({ url: exe, headers: { range: 'bytes=0-1,5-6' } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.rawPayload, body);
  });

  test('前端路由仍回退到 index.html', async () => {
    const res = await ctx.app.inject({ url: '/console' });
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /spa/);
  });
});
