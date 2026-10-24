import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase, withTransaction } from '../server/db/index.js';
import {
  createAnime,
  getAnime,
  listAnime,
  updateAnime,
  archiveAnime,
  setUserState,
  getUserState
} from '../server/repositories/anime.js';
import {
  createSeason,
  createEpisode,
  listEpisodes,
  setWatched,
  setWatchedBatch,
  correctFirstWatchedAt,
  countWatchedEpisodes,
  totalWatchedMinutes,
  countWatchedWithoutDuration
} from '../server/repositories/episode.js';
import { createTag, attachTag, listTagsOfAnime, setSetting, getSetting } from '../server/repositories/meta.js';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fanzhang-repo-'));
  const { db } = openDatabase(dir);
  return {
    db,
    dir,
    cleanup() {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

/** 建一部作品 + 一季 + N 集，返回 { animeId, seasonId, episodes } */
function seed(db, { eps = 3, duration = 24, defaultDuration = null } = {}) {
  const anime = createAnime(db, {
    canonical_title: '测试番剧',
    release_year: 2026,
    default_episode_duration_minutes: defaultDuration
  });
  const season = createSeason(db, anime.id, { season_number: 1 });
  const episodes = [];
  for (let i = 1; i <= eps; i += 1) {
    episodes.push(
      createEpisode(db, season.id, {
        episode_number: i,
        episode_key: String(i),
        duration_minutes: duration,
        sort_order: i
      })
    );
  }
  return { animeId: anime.id, seasonId: season.id, episodes };
}

test('作品：创建、读取、更新、软删除', () => {
  const { db, cleanup } = setup();
  try {
    const a = createAnime(db, { canonical_title: '  葬送的芙莉莲  ', release_year: 2023 });
    assert.equal(a.canonical_title, '葬送的芙莉莲', '标题首尾空格应被去除');
    assert.equal(a.metadata_status, 'manual');
    assert.ok(a.id);

    const updated = updateAnime(db, a.id, { release_year: 2024, synopsis: '精灵魔法使的故事' });
    assert.equal(updated.release_year, 2024);
    assert.equal(updated.synopsis, '精灵魔法使的故事');

    const archived = archiveAnime(db, a.id);
    assert.ok(archived.deleted_at, '软删除应写入 deleted_at');
    assert.equal(getAnime(db, a.id) !== null, true, '软删除后记录仍在');

    const visible = listAnime(db);
    assert.equal(visible.length, 0, '默认列表不应包含已归档作品');
  } finally {
    cleanup();
  }
});

test('作品：标题为空时拒绝创建', () => {
  const { db, cleanup } = setup();
  try {
    assert.throws(() => createAnime(db, { canonical_title: '   ' }), /不能为空/);
  } finally {
    cleanup();
  }
});

test('个人状态：写入后可读，重复写入为更新而非新增', () => {
  const { db, cleanup } = setup();
  try {
    const a = createAnime(db, { canonical_title: '状态测试' });

    setUserState(db, a.id, { status: 'watching', rating: 8 });
    let st = getUserState(db, a.id);
    assert.equal(st.status, 'watching');
    assert.equal(st.rating, 8);

    setUserState(db, a.id, { status: 'completed', rating: 9, is_favorite: true });
    st = getUserState(db, a.id);
    assert.equal(st.status, 'completed');
    assert.equal(st.is_favorite, 1);

    const count = db.prepare('SELECT COUNT(*) AS c FROM user_anime_state').get().c;
    assert.equal(Number(count), 1, '同一作品只应有一行状态');
  } finally {
    cleanup();
  }
});

test('个人状态：非法状态值被 CHECK 约束拒绝', () => {
  const { db, cleanup } = setup();
  try {
    const a = createAnime(db, { canonical_title: '非法状态' });
    assert.throws(() => setUserState(db, a.id, { status: 'unknown' }), /CHECK/i);
  } finally {
    cleanup();
  }
});

test('集数：同一季内 episode_key 唯一，跨季可重复', () => {
  const { db, cleanup } = setup();
  try {
    const a = createAnime(db, { canonical_title: '集数唯一性' });
    const s1 = createSeason(db, a.id, { season_number: 1 });
    const s2 = createSeason(db, a.id, { season_number: 2 });

    createEpisode(db, s1.id, { episode_key: '1' });
    assert.throws(() => createEpisode(db, s1.id, { episode_key: '1' }), /UNIQUE/i);

    const e = createEpisode(db, s2.id, { episode_key: '1' });
    assert.ok(e.id, '第二季可以有同名的第 1 集');
  } finally {
    cleanup();
  }
});

test('观看状态：首次标记写入观看日期，重复标记不重复计数', () => {
  const { db, cleanup } = setup();
  try {
    const { animeId, episodes } = seed(db, { eps: 3 });

    const w1 = setWatched(db, episodes[0].id, true, '2025-04-01');
    assert.equal(Number(w1.is_watched), 1);
    assert.equal(w1.first_watched_at, '2025-04-01');
    assert.equal(countWatchedEpisodes(db, animeId), 1);

    // 重复标记同一集，不应增加计数，也不应改变首次观看日期
    setWatched(db, episodes[0].id, true, '2026-10-24');
    assert.equal(countWatchedEpisodes(db, animeId), 1, '重复标记不得重复计数');
    assert.equal(
      db.prepare('SELECT first_watched_at FROM episode_watch_state WHERE episode_id = ?').get(episodes[0].id)
        .first_watched_at,
      '2025-04-01',
      '重复标记不应漂移首次观看日期'
    );
  } finally {
    cleanup();
  }
});

test('观看状态：取消已看清空日期，重新标记可指定新日期', () => {
  const { db, cleanup } = setup();
  try {
    const { animeId, episodes } = seed(db, { eps: 2 });
    const ep = episodes[0];

    setWatched(db, ep.id, true, '2025-01-01');
    assert.equal(countWatchedEpisodes(db, animeId), 1);

    const off = setWatched(db, ep.id, false);
    assert.equal(Number(off.is_watched), 0);
    assert.equal(off.first_watched_at, null, '取消已看应清空首次观看日期');
    assert.equal(countWatchedEpisodes(db, animeId), 0, '取消后统计应更新');

    const again = setWatched(db, ep.id, true, '2026-03-15');
    assert.equal(again.first_watched_at, '2026-03-15');
    assert.equal(countWatchedEpisodes(db, animeId), 1);
  } finally {
    cleanup();
  }
});

test('观看状态：显式修正观看日期生效，可置为日期不详', () => {
  const { db, cleanup } = setup();
  try {
    const { animeId, episodes } = seed(db, { eps: 1 });
    const ep = episodes[0];

    setWatched(db, ep.id, true, '2025-01-01');
    assert.equal(correctFirstWatchedAt(db, ep.id, '2024-12-31').first_watched_at, '2024-12-31');
    assert.equal(countWatchedEpisodes(db, animeId), 1, '改日期不应影响集数统计');

    assert.equal(correctFirstWatchedAt(db, ep.id, null).first_watched_at, null, '可置为日期不详');
    assert.equal(countWatchedEpisodes(db, animeId), 1, '日期不详仍算已看');
  } finally {
    cleanup();
  }
});

test('批量标记：只返回真正变化的集数，重复点击不会重复计数', () => {
  const { db, cleanup } = setup();
  try {
    const { animeId, episodes } = seed(db, { eps: 5 });
    const ids = episodes.map((e) => e.id);

    const changed1 = setWatchedBatch(db, ids, true, '2026-01-01');
    assert.equal(changed1, 5);
    assert.equal(countWatchedEpisodes(db, animeId), 5);

    const changed2 = setWatchedBatch(db, ids, true, '2026-01-01');
    assert.equal(changed2, 0, '全部已看时批量标记不应产生变更');
    assert.equal(countWatchedEpisodes(db, animeId), 5);
  } finally {
    cleanup();
  }
});

test('事务：批量标记中途失败时整体回滚', () => {
  const { db, cleanup } = setup();
  try {
    const { animeId, episodes } = seed(db, { eps: 2 });
    const before = countWatchedEpisodes(db, animeId);

    assert.throws(() =>
      withTransaction(db, () => {
        setWatched(db, episodes[0].id, true);
        throw new Error('模拟中途失败');
      })
    );

    assert.equal(countWatchedEpisodes(db, animeId), before, '失败的批量操作不应留下部分结果');
  } finally {
    cleanup();
  }
});

test('统计：未知时长计入集数但不计入时长', () => {
  const { db, cleanup } = setup();
  try {
    const { animeId, episodes } = seed(db, { eps: 3, duration: 24 });
    // 第三集时长未知（集级和作品级都为空）
    db.prepare('UPDATE episodes SET duration_minutes = NULL WHERE id = ?').run(episodes[2].id);

    setWatchedBatch(db, episodes.map((e) => e.id), true);

    assert.equal(countWatchedEpisodes(db, animeId), 3, '三集都算已看');
    assert.equal(totalWatchedMinutes(db, animeId), 48, '只有两集有有效时长');
    assert.equal(countWatchedWithoutDuration(db, animeId), 1);
  } finally {
    cleanup();
  }
});

test('统计：集级时长优先于作品默认时长', () => {
  const { db, cleanup } = setup();
  try {
    const { animeId, episodes } = seed(db, { eps: 2, duration: 24, defaultDuration: 30 });
    setWatchedBatch(db, episodes.map((e) => e.id), true);
    assert.equal(totalWatchedMinutes(db, animeId), 48, '应使用集级 24 分钟而非默认 30 分钟');
  } finally {
    cleanup();
  }
});

test('统计：全部时长未知时总时长为 0，集数照常统计', () => {
  const { db, cleanup } = setup();
  try {
    const { animeId, episodes } = seed(db, { eps: 2, duration: null, defaultDuration: null });
    setWatchedBatch(db, episodes.map((e) => e.id), true);
    assert.equal(countWatchedEpisodes(db, animeId), 2);
    assert.equal(totalWatchedMinutes(db, animeId), 0);
    assert.equal(countWatchedWithoutDuration(db, animeId), 2);
  } finally {
    cleanup();
  }
});

test('集数列表：未标记的集默认 is_watched = 0', () => {
  const { db, cleanup } = setup();
  try {
    const { seasonId, episodes } = seed(db, { eps: 3 });
    setWatched(db, episodes[1].id, true);

    const list = listEpisodes(db, seasonId);
    assert.equal(list.length, 3);
    assert.equal(Number(list[0].is_watched), 0);
    assert.equal(Number(list[1].is_watched), 1);
    assert.equal(Number(list[2].is_watched), 0);
  } finally {
    cleanup();
  }
});

test('标签与设置：标签名唯一，设置可覆盖', () => {
  const { db, cleanup } = setup();
  try {
    const a = createAnime(db, { canonical_title: '标签测试' });
    const t = createTag(db, '治愈');
    assert.throws(() => createTag(db, '治愈'), /UNIQUE/i);

    attachTag(db, a.id, t.id);
    attachTag(db, a.id, t.id); // 重复关联应被忽略
    assert.equal(listTagsOfAnime(db, a.id).length, 1);

    assert.equal(getSetting(db, 'theme', 'light'), 'light');
    setSetting(db, 'theme', 'dark');
    assert.equal(getSetting(db, 'theme'), 'dark');
    setSetting(db, 'theme', 'auto');
    assert.equal(getSetting(db, 'theme'), 'auto');
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS c FROM app_settings').get().c), 1);
  } finally {
    cleanup();
  }
});

test('本地文件缺失不影响观看记录：归档作品后统计仍可查', () => {
  const { db, cleanup } = setup();
  try {
    const { animeId, episodes } = seed(db, { eps: 2 });
    setWatchedBatch(db, episodes.map((e) => e.id), true);

    archiveAnime(db, animeId);

    assert.equal(countWatchedEpisodes(db, animeId), 2, '归档不得删除观看记录');
  } finally {
    cleanup();
  }
});
