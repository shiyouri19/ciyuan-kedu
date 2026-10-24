import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/db/index.js';
import { createServer } from '../server/http.js';

async function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fanzhang-api-'));
  const { db, schemaVersion } = openDatabase(dir);
  const server = createServer({ db, cfg: { dataDir: dir }, schemaVersion });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const call = async (method, p, body) => {
    const init = { method, headers: {} };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const res = await fetch(base + p, init);
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* 非 JSON 响应 */
    }
    return { status: res.status, json, text };
  };

  return {
    base,
    call,
    async close() {
      await new Promise((r) => server.close(r));
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

test('POST /api/anime：创建成功返回 201 与完整详情', async () => {
  const s = await startServer();
  try {
    const r = await s.call('POST', '/api/anime', {
      canonical_title: '迷宫饭',
      release_year: 2024,
      anime_type: 'TV',
      status: 'watching',
      rating: 8,
      tags: ['奇幻', '美食']
    });
    assert.equal(r.status, 201);
    assert.equal(r.json.anime.canonical_title, '迷宫饭');
    assert.equal(r.json.state.status, 'watching');
    assert.equal(r.json.tags.length, 2);
  } finally {
    await s.close();
  }
});

test('POST /api/anime：校验失败返回 400 并指明字段', async () => {
  const s = await startServer();
  try {
    const r = await s.call('POST', '/api/anime', { canonical_title: '' });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'validation_error');
    assert.equal(r.json.error.field, 'canonical_title');
  } finally {
    await s.close();
  }
});

test('POST /api/anime：非法 JSON 返回 400 而不是崩溃', async () => {
  const s = await startServer();
  try {
    const r = await s.call('POST', '/api/anime', '{not json');
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'invalid_json');
  } finally {
    await s.close();
  }
});

test('GET /api/anime：支持关键词、状态与排序参数', async () => {
  const s = await startServer();
  try {
    await s.call('POST', '/api/anime', { canonical_title: '芙莉莲', status: 'watching', release_year: 2023 });
    await s.call('POST', '/api/anime', { canonical_title: '迷宫饭', status: 'want', release_year: 2024 });

    const all = await s.call('GET', '/api/anime');
    assert.equal(all.status, 200);
    assert.equal(all.json.data.length, 2);

    const kw = await s.call('GET', '/api/anime?keyword=' + encodeURIComponent('芙莉莲'));
    assert.equal(kw.json.data.length, 1);

    const st = await s.call('GET', '/api/anime?status=want');
    assert.equal(st.json.data.length, 1);
    assert.equal(st.json.data[0].canonical_title, '迷宫饭');

    const sorted = await s.call('GET', '/api/anime?sortBy=release_year&order=desc');
    assert.equal(sorted.json.data[0].release_year, 2024);
  } finally {
    await s.close();
  }
});

test('GET /api/anime：非法排序字段返回 400', async () => {
  const s = await startServer();
  try {
    const r = await s.call('GET', '/api/anime?sortBy=' + encodeURIComponent('id; DROP TABLE anime'));
    assert.equal(r.status, 400);
  } finally {
    await s.close();
  }
});

test('GET /api/anime/:id：返回详情，不存在返回 404', async () => {
  const s = await startServer();
  try {
    const created = await s.call('POST', '/api/anime', { canonical_title: '详情测试' });
    const id = created.json.anime.id;

    const detail = await s.call('GET', `/api/anime/${id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.json.anime.id, id);
    assert.equal(detail.json.episode_count, 0);

    const missing = await s.call('GET', '/api/anime/no-such-id');
    assert.equal(missing.status, 404);
    assert.equal(missing.json.error.code, 'not_found');
  } finally {
    await s.close();
  }
});

test('PATCH /api/anime/:id：更新资料字段', async () => {
  const s = await startServer();
  try {
    const created = await s.call('POST', '/api/anime', { canonical_title: '旧标题' });
    const id = created.json.anime.id;

    const r = await s.call('PATCH', `/api/anime/${id}`, { canonical_title: '新标题', release_year: 2022 });
    assert.equal(r.status, 200);
    assert.equal(r.json.anime.canonical_title, '新标题');
    assert.equal(r.json.anime.release_year, 2022);
  } finally {
    await s.close();
  }
});

test('POST /api/anime/:id/status：改状态并保留评分', async () => {
  const s = await startServer();
  try {
    const created = await s.call('POST', '/api/anime', { canonical_title: '状态', rating: 7, status: 'want' });
    const id = created.json.anime.id;

    const r = await s.call('POST', `/api/anime/${id}/status`, { status: 'completed' });
    assert.equal(r.status, 200);
    assert.equal(r.json.state.status, 'completed');
    assert.equal(r.json.state.rating, 7);
  } finally {
    await s.close();
  }
});

test('PUT /api/anime/:id/tags：覆盖式设置标签', async () => {
  const s = await startServer();
  try {
    const created = await s.call('POST', '/api/anime', { canonical_title: '标签', tags: ['旧'] });
    const id = created.json.anime.id;

    const r = await s.call('PUT', `/api/anime/${id}/tags`, { tags: ['新1', '新2'] });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.tags.map((t) => t.name).sort(), ['新1', '新2']);
  } finally {
    await s.close();
  }
});

test('归档流程：评估 → 归档 → 列表为空 → 恢复', async () => {
  const s = await startServer();
  try {
    const created = await s.call('POST', '/api/anime', { canonical_title: '归档对象', rating: 9 });
    const id = created.json.anime.id;

    const check = await s.call('GET', `/api/anime/${id}/archive-check`);
    assert.equal(check.status, 200);
    assert.equal(check.json.will_delete_watch_history, false);
    assert.equal(check.json.reversible, true);

    const archived = await s.call('POST', `/api/anime/${id}/archive`);
    assert.equal(archived.status, 200);

    const list = await s.call('GET', '/api/anime');
    assert.equal(list.json.data.length, 0);

    const detail = await s.call('GET', `/api/anime/${id}`);
    assert.equal(detail.json.state.rating, 9, '归档后评分仍在');

    const restored = await s.call('POST', `/api/anime/${id}/restore`);
    assert.equal(restored.json.restored, true);

    const list2 = await s.call('GET', '/api/anime');
    assert.equal(list2.json.data.length, 1);
  } finally {
    await s.close();
  }
});

test('GET /api/meta：返回前端需要的枚举白名单', async () => {
  const s = await startServer();
  try {
    const r = await s.call('GET', '/api/meta');
    assert.equal(r.status, 200);
    assert.ok(r.json.statuses.includes('watching'));
    assert.ok(r.json.animeTypes.includes('TV'));
    assert.ok(r.json.sortFields.includes('updated_at'));
  } finally {
    await s.close();
  }
});

test('GET /api/tags：返回已存在的标签', async () => {
  const s = await startServer();
  try {
    await s.call('POST', '/api/anime', { canonical_title: 'A', tags: ['共享标签'] });
    const r = await s.call('GET', '/api/tags');
    assert.equal(r.status, 200);
    assert.ok(r.json.data.some((t) => t.name === '共享标签'));
  } finally {
    await s.close();
  }
});

test('方法不支持：返回 405 而不是 404', async () => {
  const s = await startServer();
  try {
    const r = await s.call('DELETE', '/api/anime');
    assert.equal(r.status, 405);
    assert.equal(r.json.error.code, 'method_not_allowed');
  } finally {
    await s.close();
  }
});
