import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/db/index.js';
import { createServer } from '../server/http.js';
import { createAnime } from '../server/repositories/anime.js';

async function startServer(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fanzhang-http-'));
  const { db, schemaVersion } = openDatabase(dir);
  const cfg = { dataDir: dir, ...overrides };
  const server = createServer({ db, cfg, schemaVersion });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  return {
    base: `http://127.0.0.1:${port}`,
    db,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

test('健康检查：返回 200 与数据库架构版本，但不泄露本机路径', async () => {
  const s = await startServer();
  try {
    const res = await fetch(`${s.base}/api/health`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /application\/json/);

    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.schemaVersion, 4);
    // 这个接口在鉴权之前，任何本机网页都能读，所以不能带数据目录和作品数
    assert.equal(data.dataDir, undefined, '不应暴露数据目录');
    assert.equal(data.counts, undefined, '不应暴露作品数');
  } finally {
    await s.close();
  }
});

test('健康检查：不随数据库内容变化，不泄露库规模', async () => {
  const s = await startServer();
  try {
    createAnime(s.db, { canonical_title: '接口计数测试' });
    const raw = await (await fetch(`${s.base}/api/health`)).text();
    const data = JSON.parse(raw);
    assert.equal(data.counts, undefined, '不应返回作品数');
    assert.equal(raw.includes('接口计数测试'), false, '不应泄露库内容');
  } finally {
    await s.close();
  }
});

test('安全：设置口令后，无口令不能关闭服务', async () => {
  const s = await startServer({ accessToken: 'secret-123' });
  try {
    // shutdown 曾经在鉴权检查之前，任何本机网页 POST 一下就能把服务关掉
    const res = await fetch(`${s.base}/api/shutdown`, { method: 'POST' });
    assert.equal(res.status, 401, '无口令调用 shutdown 必须被拒绝');

    const alive = await fetch(`${s.base}/api/health`);
    assert.equal(alive.status, 200, '服务应该还活着');
    assert.equal((await alive.json()).authRequired, true);
  } finally {
    await s.close();
  }
});

test('安全：默认不发 CORS 通配头，显式配置才发', async () => {
  const plain = await startServer();
  try {
    const res = await fetch(`${plain.base}/api/health`);
    assert.equal(res.headers.get('access-control-allow-origin'), null, '默认不应有 CORS 头');
  } finally {
    await plain.close();
  }

  const withOrigin = await startServer({ corsOrigin: 'https://example.com' });
  try {
    const res = await fetch(`${withOrigin.base}/api/health`);
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://example.com');
  } finally {
    await withOrigin.close();
  }
});

test('首页：返回 HTML 且包含应用名', async () => {
  const s = await startServer();
  try {
    const res = await fetch(`${s.base}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    const html = await res.text();
    assert.match(html, /次元刻度/);
  } finally {
    await s.close();
  }
});

test('未知接口：返回结构化 404 JSON 而不是崩溃', async () => {
  const s = await startServer();
  try {
    const res = await fetch(`${s.base}/api/does-not-exist`);
    assert.equal(res.status, 404);
    const data = await res.json();
    assert.equal(data.error.code, 'no_such_endpoint');
    assert.ok(data.error.message.includes('/api/does-not-exist'));
  } finally {
    await s.close();
  }
});

test('未知页面：返回 404', async () => {
  const s = await startServer();
  try {
    const res = await fetch(`${s.base}/nope.html`);
    assert.equal(res.status, 404);
  } finally {
    await s.close();
  }
});

test('路径穿越：试图读取 web 目录之外的文件被拒绝', async () => {
  const s = await startServer();
  try {
    const res = await fetch(`${s.base}/%2e%2e/package.json`);
    assert.equal(res.status, 404, '不得返回项目根目录下的文件');
    const text = await res.text();
    assert.ok(!text.includes('"name"'), '响应中不应包含 package.json 内容');
  } finally {
    await s.close();
  }
});

test('非 GET 请求：返回 405 且不执行任何写操作', async () => {
  const s = await startServer();
  try {
    const res = await fetch(`${s.base}/`, { method: 'POST' });
    assert.equal(res.status, 405);
    const data = await res.json();
    assert.equal(data.error.code, 'method_not_allowed');
  } finally {
    await s.close();
  }
});
