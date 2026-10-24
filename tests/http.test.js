import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/db/index.js';
import { createServer } from '../server/http.js';
import { createAnime } from '../server/repositories/anime.js';

async function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fanzhang-http-'));
  const { db, schemaVersion } = openDatabase(dir);
  const cfg = { dataDir: dir };
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

test('健康检查：返回 200 与数据库架构版本', async () => {
  const s = await startServer();
  try {
    const res = await fetch(`${s.base}/api/health`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /application\/json/);

    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.schemaVersion, 2);
    assert.equal(data.counts.anime, 0);
    assert.ok(data.dataDir);
  } finally {
    await s.close();
  }
});

test('健康检查：作品数随数据库变化', async () => {
  const s = await startServer();
  try {
    createAnime(s.db, { canonical_title: '接口计数测试' });
    const data = await (await fetch(`${s.base}/api/health`)).json();
    assert.equal(data.counts.anime, 1);
  } finally {
    await s.close();
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
