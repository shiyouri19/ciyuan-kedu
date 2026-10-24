import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/db/index.js';
import {
  createAnimeEntry,
  updateAnimeEntry,
  changeStatus,
  setTags,
  searchLibrary,
  getAnimeDetail,
  assessArchive,
  archiveAnimeEntry,
  restoreAnimeEntry,
  assessDelete,
  deleteAnimeEntry
} from '../server/services/animeService.js';
import { markEpisode } from '../server/services/episodeService.js';
import { ValidationError, NotFoundError } from '../server/errors.js';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fanzhang-svc-'));
  const { db } = openDatabase(dir);
  return {
    db,
    cleanup() {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

test('新建作品：默认状态为想看，返回完整详情', () => {
  const { db, cleanup } = setup();
  try {
    const res = createAnimeEntry(db, {
      canonical_title: '  葬送的芙莉莲  ',
      release_year: 2023,
      anime_type: 'TV',
      synopsis: '精灵魔法使的旅程'
    });

    assert.equal(res.anime.canonical_title, '葬送的芙莉莲', '标题应去除首尾空格');
    assert.equal(res.anime.release_year, 2023);
    assert.equal(res.anime.anime_type, 'TV');
    assert.equal(res.anime.metadata_status, 'manual');
    assert.equal(res.state.status, 'want', '未指定状态时默认想看');
    assert.equal(res.season_count, 0);
    assert.equal(res.episode_count, 0);
  } finally {
    cleanup();
  }
});

test('新建作品：标题必填且长度受限', () => {
  const { db, cleanup } = setup();
  try {
    assert.throws(() => createAnimeEntry(db, {}), ValidationError);
    assert.throws(() => createAnimeEntry(db, { canonical_title: '   ' }), /标题不能为空/);
    assert.throws(() => createAnimeEntry(db, { canonical_title: 'x'.repeat(201) }), /不能超过 200 字/);
  } finally {
    cleanup();
  }
});

test('新建作品：年份、类型、评分、时长越界均被拒绝', () => {
  const { db, cleanup } = setup();
  try {
    assert.throws(() => createAnimeEntry(db, { canonical_title: 'a', release_year: 1800 }), /1900–2100/);
    assert.throws(() => createAnimeEntry(db, { canonical_title: 'a', release_year: 2200 }), /1900–2100/);
    assert.throws(() => createAnimeEntry(db, { canonical_title: 'a', release_year: 2020.5 }), /整数/);
    assert.throws(() => createAnimeEntry(db, { canonical_title: 'a', anime_type: '动漫' }), /作品类型/);
    assert.throws(() => createAnimeEntry(db, { canonical_title: 'a', status: '看完了' }), /状态/);
    assert.throws(() => createAnimeEntry(db, { canonical_title: 'a', rating: 11 }), /1–10/);
    assert.throws(() => createAnimeEntry(db, { canonical_title: 'a', rating: 0 }), /1–10/);
    assert.throws(
      () => createAnimeEntry(db, { canonical_title: 'a', default_episode_duration_minutes: 0 }),
      /1–600/
    );
  } finally {
    cleanup();
  }
});

test('新建作品：标签自动创建并关联，重复标签去重', () => {
  const { db, cleanup } = setup();
  try {
    const res = createAnimeEntry(db, {
      canonical_title: '标签测试',
      tags: ['治愈', ' 治愈 ', '', '奇幻']
    });
    assert.equal(res.tags.length, 2, '空白与重复标签应被去掉');
    const names = res.tags.map((t) => t.name).sort();
    assert.deepEqual(names, ['奇幻', '治愈']);
  } finally {
    cleanup();
  }
});

test('新建作品：标签非法时整体回滚，不留下没有标签的作品', () => {
  const { db, cleanup } = setup();
  try {
    assert.throws(() =>
      createAnimeEntry(db, { canonical_title: '回滚测试', tags: ['x'.repeat(21)] })
    );
    const count = Number(db.prepare('SELECT COUNT(*) AS c FROM anime').get().c);
    assert.equal(count, 0, '事务失败后作品不应残留');
  } finally {
    cleanup();
  }
});

test('更新作品：只改资料字段，个人状态不受影响', () => {
  const { db, cleanup } = setup();
  try {
    const created = createAnimeEntry(db, { canonical_title: '原标题', status: 'watching', rating: 8 });
    const id = created.anime.id;

    const updated = updateAnimeEntry(db, id, {
      canonical_title: '新标题',
      release_year: 2024,
      synopsis: '新简介'
    });

    assert.equal(updated.anime.canonical_title, '新标题');
    assert.equal(updated.anime.release_year, 2024);
    assert.equal(updated.state.status, 'watching', '更新资料不应重置状态');
    assert.equal(updated.state.rating, 8, '更新资料不应重置评分');
  } finally {
    cleanup();
  }
});

test('更新作品：没有可更新字段时报错，不存在的作品报 404', () => {
  const { db, cleanup } = setup();
  try {
    const created = createAnimeEntry(db, { canonical_title: '空更新' });
    assert.throws(() => updateAnimeEntry(db, created.anime.id, {}), /没有可更新的字段/);
    assert.throws(() => updateAnimeEntry(db, 'no-such-id', { canonical_title: 'x' }), NotFoundError);
  } finally {
    cleanup();
  }
});

test('修改状态：只改状态时保留评分与收藏', () => {
  const { db, cleanup } = setup();
  try {
    const created = createAnimeEntry(db, {
      canonical_title: '状态保留',
      status: 'watching',
      rating: 9,
      is_favorite: true
    });
    const id = created.anime.id;

    const st = changeStatus(db, id, { status: 'completed' });
    assert.equal(st.status, 'completed');
    assert.equal(st.rating, 9, '未传评分时不应清空');
    assert.equal(Number(st.is_favorite), 1, '未传收藏时不应清空');
  } finally {
    cleanup();
  }
});

test('修改状态：显式传 null 可清空评分', () => {
  const { db, cleanup } = setup();
  try {
    const created = createAnimeEntry(db, { canonical_title: '清空评分', rating: 7 });
    const st = changeStatus(db, created.anime.id, { status: 'watching', rating: null });
    assert.equal(st.rating, null);
  } finally {
    cleanup();
  }
});

test('设置标签：覆盖式，不影响其它作品', () => {
  const { db, cleanup } = setup();
  try {
    const a = createAnimeEntry(db, { canonical_title: 'A', tags: ['旧1', '旧2'] });
    const b = createAnimeEntry(db, { canonical_title: 'B', tags: ['旧1'] });

    const tags = setTags(db, a.anime.id, ['新标签']);
    assert.deepEqual(tags.map((t) => t.name), ['新标签']);

    const bDetail = getAnimeDetail(db, b.anime.id);
    assert.deepEqual(bDetail.tags.map((t) => t.name), ['旧1'], '另一部作品的标签不受影响');
  } finally {
    cleanup();
  }
});

test('列表：关键词搜索与状态筛选', () => {
  const { db, cleanup } = setup();
  try {
    createAnimeEntry(db, { canonical_title: '葬送的芙莉莲', status: 'watching' });
    createAnimeEntry(db, { canonical_title: '药屋少女的呢喃', status: 'watching' });
    createAnimeEntry(db, { canonical_title: '迷宫饭', status: 'want' });

    assert.equal(searchLibrary(db, {}).length, 3);
    assert.equal(searchLibrary(db, { keyword: '芙莉莲' }).length, 1);
    assert.equal(searchLibrary(db, { keyword: '的' }).length, 2);
    assert.equal(searchLibrary(db, { status: 'watching' }).length, 2);
    assert.equal(searchLibrary(db, { status: 'want' }).length, 1);
    assert.equal(searchLibrary(db, { keyword: '不存在' }).length, 0);
  } finally {
    cleanup();
  }
});

test('列表：排序可用且非法字段被拒绝', () => {
  const { db, cleanup } = setup();
  try {
    createAnimeEntry(db, { canonical_title: 'B番', release_year: 2020 });
    createAnimeEntry(db, { canonical_title: 'A番', release_year: 2024 });

    const asc = searchLibrary(db, { sortBy: 'canonical_title', order: 'asc' });
    assert.equal(asc[0].canonical_title, 'A番');

    const byYearDesc = searchLibrary(db, { sortBy: 'release_year', order: 'desc' });
    assert.equal(byYearDesc[0].release_year, 2024);

    assert.throws(() => searchLibrary(db, { sortBy: 'id; DROP TABLE anime' }), /排序字段/);
    assert.throws(() => searchLibrary(db, { order: 'random' }), /排序方向/);
  } finally {
    cleanup();
  }
});

test('列表：归档作品不出现在列表中', () => {
  const { db, cleanup } = setup();
  try {
    const a = createAnimeEntry(db, { canonical_title: '将归档' });
    createAnimeEntry(db, { canonical_title: '保留' });

    archiveAnimeEntry(db, a.anime.id);
    const list = searchLibrary(db, {});
    assert.equal(list.length, 1);
    assert.equal(list[0].canonical_title, '保留');
  } finally {
    cleanup();
  }
});

test('归档评估：说明保留哪些数据，且不改动数据库', () => {
  const { db, cleanup } = setup();
  try {
    const a = createAnimeEntry(db, { canonical_title: '评估对象', rating: 9, tags: ['收藏'] });
    const info = assessArchive(db, a.anime.id);

    assert.equal(info.will_delete_watch_history, false);
    assert.equal(info.will_delete_local_files, false);
    assert.equal(info.reversible, true);
    // 只在语义上断言，不锁死具体措辞（文案会改，「数据都保留」这个承诺不会改）
    assert.match(info.message, /保留/);

    const detail = getAnimeDetail(db, a.anime.id);
    assert.equal(detail.state.rating, 9, '评估不应修改数据');
    assert.equal(detail.tags.length, 1);
  } finally {
    cleanup();
  }
});

test('归档后数据完整保留，可以被恢复', () => {
  const { db, cleanup } = setup();
  try {
    const a = createAnimeEntry(db, {
      canonical_title: '可恢复',
      status: 'completed',
      rating: 10,
      is_favorite: true,
      notes: '这个很好',
      tags: ['神作']
    });
    const id = a.anime.id;

    archiveAnimeEntry(db, id);
    assert.equal(searchLibrary(db, {}).length, 0);

    const archived = getAnimeDetail(db, id);
    assert.equal(archived.anime.deleted_at !== null, true);
    assert.equal(archived.state.rating, 10, '归档后评分保留');
    assert.equal(archived.state.notes, '这个很好', '归档后备注保留');
    assert.equal(archived.tags.length, 1, '归档后标签保留');

    const restored = restoreAnimeEntry(db, id);
    assert.equal(restored.restored, true);
    assert.equal(searchLibrary(db, {}).length, 1, '恢复后回到列表');

    const again = restoreAnimeEntry(db, id);
    assert.equal(again.restored, false, '重复恢复应为无操作');
  } finally {
    cleanup();
  }
});

test('不存在的作品：详情、状态、归档均报 404', () => {
  const { db, cleanup } = setup();
  try {
    assert.throws(() => getAnimeDetail(db, 'x'), NotFoundError);
    assert.throws(() => changeStatus(db, 'x', { status: 'watching' }), NotFoundError);
    assert.throws(() => archiveAnimeEntry(db, 'x'), NotFoundError);
    assert.throws(() => restoreAnimeEntry(db, 'x'), NotFoundError);
  } finally {
    cleanup();
  }
});

/* ---------------- 封面 ---------------- */

test('封面：新建时可带原始图片地址并存下来', () => {
  const { db, cleanup } = setup();
  try {
    const res = createAnimeEntry(db, {
      canonical_title: '带封面的作品',
      cover_url: 'https://lain.bgm.tv/pic/cover/c/aa/bb/123_x.jpg'
    });
    assert.equal(res.anime.cover_path, 'https://lain.bgm.tv/pic/cover/c/aa/bb/123_x.jpg');

    const [row] = searchLibrary(db, {});
    assert.equal(row.cover_path, 'https://lain.bgm.tv/pic/cover/c/aa/bb/123_x.jpg', '列表也要带出封面');
  } finally {
    cleanup();
  }
});

test('封面：已有作品可以单独补封面，不影响个人状态', () => {
  const { db, cleanup } = setup();
  try {
    const { anime } = createAnimeEntry(db, { canonical_title: '后补封面', status: 'watching', rating: 8 });
    const res = updateAnimeEntry(db, anime.id, { cover_url: 'https://lain.bgm.tv/pic/cover/c/cc/dd/9_y.jpg' });

    assert.equal(res.anime.cover_path, 'https://lain.bgm.tv/pic/cover/c/cc/dd/9_y.jpg');
    assert.equal(res.state.rating, 8, '补封面不能动评分');
    assert.equal(res.state.status, 'watching', '补封面不能动状态');
  } finally {
    cleanup();
  }
});

test('封面：本地代理地址不能入库，否则 /api/cover 会套娃', () => {
  const { db, cleanup } = setup();
  try {
    assert.throws(
      () => createAnimeEntry(db, { canonical_title: 'x', cover_url: '/api/cover?u=https%3A%2F%2Fa.jpg' }),
      ValidationError
    );
  } finally {
    cleanup();
  }
});

test('封面：非 http(s) 协议被拒绝', () => {
  const { db, cleanup } = setup();
  try {
    for (const bad of ['javascript:alert(1)', 'file:///C:/x.jpg', 'ftp://a/b.jpg', 'not-a-url']) {
      assert.throws(() => createAnimeEntry(db, { canonical_title: 'x', cover_url: bad }), ValidationError, `应拒绝 ${bad}`);
    }
  } finally {
    cleanup();
  }
});

/* ---------------- 彻底删除 ---------------- */

test('彻底删除：作品、季、集、观看记录一并消失', () => {
  const { db, cleanup } = setup();
  try {
    const { anime } = createAnimeEntry(db, { canonical_title: '要删掉的番', episodes: 12 });
    // 标记两集
    const eps = db
      .prepare(
        `SELECT e.id FROM episodes e JOIN seasons s ON s.id = e.season_id WHERE s.anime_id = ? ORDER BY e.sort_order`
      )
      .all(anime.id);
    markEpisode(db, eps[0].id, true, '2025-01-01');
    markEpisode(db, eps[1].id, true, '2025-01-02');

    const info = assessDelete(db, anime.id);
    assert.equal(info.episodes, 12);
    assert.equal(info.watched, 2);
    assert.equal(info.reversible, false);

    const res = deleteAnimeEntry(db, anime.id);
    assert.equal(res.deleted, true);
    assert.equal(res.title, '要删掉的番');

    assert.equal(searchLibrary(db, {}).length, 0, '列表里没有了');

    const leftEpisodes = db
      .prepare('SELECT COUNT(*) c FROM episodes e JOIN seasons s ON s.id = e.season_id WHERE s.anime_id = ?')
      .get(anime.id);
    assert.equal(leftEpisodes.c, 0, '集记录被级联删除');

    const leftWatch = db
      .prepare(
        `SELECT COUNT(*) c FROM episode_watch_state w
           JOIN episodes e ON e.id = w.episode_id
           JOIN seasons s ON s.id = e.season_id
          WHERE s.anime_id = ?`
      )
      .get(anime.id);
    assert.equal(leftWatch.c, 0, '观看记录被级联删除');
  } finally {
    cleanup();
  }
});

test('彻底删除：不存在的作品返回 NotFound', () => {
  const { db, cleanup } = setup();
  try {
    assert.throws(() => deleteAnimeEntry(db, 'nope'), NotFoundError);
  } finally {
    cleanup();
  }
});

test('彻底删除：只删目标，不波及别的作品', () => {
  const { db, cleanup } = setup();
  try {
    const a = createAnimeEntry(db, { canonical_title: '留着', episodes: 12 });
    const b = createAnimeEntry(db, { canonical_title: '删掉', episodes: 12 });

    deleteAnimeEntry(db, b.anime.id);

    const list = searchLibrary(db, {});
    assert.equal(list.length, 1);
    assert.equal(list[0].canonical_title, '留着');
    assert.equal(getAnimeDetail(db, a.anime.id).episode_count, 12, '另一部集数不受影响');
  } finally {
    cleanup();
  }
});

test('彻底删除：共享的标签本身保留', () => {
  const { db, cleanup } = setup();
  try {
    const a = createAnimeEntry(db, { canonical_title: '番A', tags: ['治愈'] });
    const b = createAnimeEntry(db, { canonical_title: '番B', tags: ['治愈'] });

    deleteAnimeEntry(db, a.anime.id);

    // 标签表是共享的，删作品不应删标签定义
    const tag = db.prepare("SELECT COUNT(*) c FROM tags WHERE name = '治愈'").get();
    assert.equal(tag.c, 1, '标签定义还在');

    const link = db.prepare('SELECT COUNT(*) c FROM anime_tags WHERE anime_id = ?').get(a.anime.id);
    assert.equal(link.c, 0, '关联被删除');

    const other = db.prepare('SELECT COUNT(*) c FROM anime_tags WHERE anime_id = ?').get(b.anime.id);
    assert.equal(other.c, 1, '别的作品的关联不受影响');
  } finally {
    cleanup();
  }
});
