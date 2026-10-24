import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/db/index.js';
import { createAnimeEntry, searchLibrary } from '../server/services/animeService.js';
import {
  ensureEpisodes,
  setEpisodeCount,
  getEpisodesView,
  markEpisode,
  advanceProgress,
  setProgress,
  computeProgress
} from '../server/services/episodeService.js';
import { ValidationError, NotFoundError } from '../server/errors.js';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fanzhang-ep-'));
  const { db } = openDatabase(dir);
  return {
    db,
    cleanup() {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

function makeAnime(db, extra = {}) {
  return createAnimeEntry(db, { canonical_title: '测试番', ...extra }).anime;
}

/* ---------------- 建集 ---------------- */

test('设置集数：建出 1..N 集，进度为零', () => {
  const { db, cleanup } = setup();
  try {
    const anime = makeAnime(db);
    const res = setEpisodeCount(db, anime.id, 12);

    assert.equal(res.created, 12);
    assert.equal(res.removed, 0);
    assert.equal(res.progress.total, 12);
    assert.equal(res.progress.watched, 0);
    assert.equal(res.progress.current, 0);
    assert.equal(res.progress.next_episode, 1);

    const view = getEpisodesView(db, anime.id);
    assert.equal(view.seasons.length, 1, '应只有一个本篇季');
    assert.equal(view.seasons[0].episodes.length, 12);
    assert.deepEqual(
      view.seasons[0].episodes.map((e) => e.episode_number),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    );
  } finally {
    cleanup();
  }
});

test('设置集数：重复设置幂等，不会重复建集', () => {
  const { db, cleanup } = setup();
  try {
    const anime = makeAnime(db);
    setEpisodeCount(db, anime.id, 12);
    const second = setEpisodeCount(db, anime.id, 12);

    assert.equal(second.created, 0);
    assert.equal(second.progress.total, 12);
    assert.equal(getEpisodesView(db, anime.id).seasons.length, 1, '不应建出第二个季');
  } finally {
    cleanup();
  }
});

test('扩大集数：只补新增的集', () => {
  const { db, cleanup } = setup();
  try {
    const anime = makeAnime(db);
    setEpisodeCount(db, anime.id, 12);
    const res = setEpisodeCount(db, anime.id, 24);

    assert.equal(res.created, 12);
    assert.equal(res.removed, 0);
    assert.equal(res.progress.total, 24);
  } finally {
    cleanup();
  }
});

test('缩小集数：删掉尾部未观看的集', () => {
  const { db, cleanup } = setup();
  try {
    const anime = makeAnime(db);
    setEpisodeCount(db, anime.id, 12);
    const res = setEpisodeCount(db, anime.id, 8);

    assert.equal(res.removed, 4);
    assert.equal(res.kept_watched, 0);
    assert.equal(res.progress.total, 8);
  } finally {
    cleanup();
  }
});

test('缩小集数：已观看的尾部集不删除，观看记录不能丢', () => {
  const { db, cleanup } = setup();
  try {
    const anime = makeAnime(db);
    setEpisodeCount(db, anime.id, 12);
    setProgress(db, anime.id, 12); // 全看完

    const res = setEpisodeCount(db, anime.id, 8);
    assert.equal(res.removed, 0, '一集都不该删');
    assert.equal(res.kept_watched, 4, '后 4 集因为已观看被保留');
    assert.equal(res.progress.total, 12, '总集数按实际保留的算');
    assert.equal(res.progress.watched, 12);
  } finally {
    cleanup();
  }
});

test('集数校验：0、负数、小数、超上限都拒绝', () => {
  const { db, cleanup } = setup();
  try {
    const anime = makeAnime(db);
    for (const bad of [0, -1, 1.5, 5000, '', null]) {
      assert.throws(() => setEpisodeCount(db, anime.id, bad), ValidationError, `应拒绝 ${bad}`);
    }
  } finally {
    cleanup();
  }
});

/* ---------------- 前进 / 后退 ---------------- */

test('+1：按「下一个未看的集」推进，不是按集号加一', () => {
  const { db, cleanup } = setup();
  try {
    const anime = makeAnime(db);
    setEpisodeCount(db, anime.id, 12);

    const r1 = advanceProgress(db, anime.id, 1);
    assert.equal(r1.changed.episode_number, 1);
    assert.equal(r1.progress.current, 1);

    const r2 = advanceProgress(db, anime.id, 1);
    assert.equal(r2.changed.episode_number, 2);
    assert.equal(r2.progress.watched, 2);
  } finally {
    cleanup();
  }
});

test('+1：跳看过之后，仍然补最前面的缺口', () => {
  const { db, cleanup } = setup();
  try {
    const anime = makeAnime(db);
    setEpisodeCount(db, anime.id, 12);
    setProgress(db, anime.id, 5);
    // 手动取消第 2、3 集，制造缺口
    const view = getEpisodesView(db, anime.id);
    const ep2 = view.seasons[0].episodes.find((e) => e.episode_number === 2);
    const ep3 = view.seasons[0].episodes.find((e) => e.episode_number === 3);
    markEpisode(db, ep2.id, false);
    markEpisode(db, ep3.id, false);

    const res = advanceProgress(db, anime.id, 1);
    assert.equal(res.changed.episode_number, 2, '缺口在 2，应该先补 2');
    assert.equal(res.progress.has_gap, true);
  } finally {
    cleanup();
  }
});

test('+1：全部看完后返回 at_end，不产生新记录', () => {
  const { db, cleanup } = setup();
  try {
    const anime = makeAnime(db);
    setEpisodeCount(db, anime.id, 3);
    setProgress(db, anime.id, 3);

    const res = advanceProgress(db, anime.id, 1);
    assert.equal(res.at_end, true);
    assert.equal(res.changed, null);
    assert.equal(res.progress.watched, 3);
  } finally {
    cleanup();
  }
});

test('-1：撤销最后一部已看的集', () => {
  const { db, cleanup } = setup();
  try {
    const anime = makeAnime(db);
    setEpisodeCount(db, anime.id, 12);
    setProgress(db, anime.id, 5);

    const res = advanceProgress(db, anime.id, -1);
    assert.equal(res.changed.episode_number, 5);
    assert.equal(res.progress.watched, 4);
    assert.equal(res.progress.current, 4);
  } finally {
    cleanup();
  }
});

test('-1：一集没看时返回 at_start', () => {
  const { db, cleanup } = setup();
  try {
    const anime = makeAnime(db);
    setEpisodeCount(db, anime.id, 12);
    const res = advanceProgress(db, anime.id, -1);
    assert.equal(res.at_start, true);
    assert.equal(res.changed, null);
  } finally {
    cleanup();
  }
});

test('+1 / -1：没有设集数时给出可理解的错误', () => {
  const { db, cleanup } = setup();
  try {
    const anime = makeAnime(db);
    assert.throws(() => advanceProgress(db, anime.id, 1), ValidationError);
    assert.throws(() => advanceProgress(db, anime.id, -1), ValidationError);
  } finally {
    cleanup();
  }
});

/* ---------------- 看到第 N 集 ---------------- */

test('看到第 N 集：只补标记，不清除 N 之后已有的记录', () => {
  const { db, cleanup } = setup();
  try {
    const anime = makeAnime(db);
    setEpisodeCount(db, anime.id, 12);
    setProgress(db, anime.id, 10); // 先看到 10

    const res = setProgress(db, anime.id, 3); // 再改回 3
    assert.equal(res.marked, 0, '前 3 集已经看过，不用再标');
    assert.equal(res.progress.watched, 10, '第 4–10 集的记录必须保留');
    assert.equal(res.progress.current, 10);
  } finally {
    cleanup();
  }
});

test('看到第 N 集：只补缺失的集，返回实际标记数', () => {
  const { db, cleanup } = setup();
  try {
    const anime = makeAnime(db);
    setEpisodeCount(db, anime.id, 12);
    setProgress(db, anime.id, 3);

    const res = setProgress(db, anime.id, 6);
    assert.equal(res.marked, 3);
    assert.equal(res.progress.watched, 6);
    assert.equal(res.progress.current, 6);
    assert.equal(res.progress.has_gap, false);
  } finally {
    cleanup();
  }
});

/* ---------------- 单集标记 ---------------- */

test('单集标记：重复标记幂等，不刷新首次观看日期', () => {
  const { db, cleanup } = setup();
  try {
    const anime = makeAnime(db);
    setEpisodeCount(db, anime.id, 12);
    const ep1 = getEpisodesView(db, anime.id).seasons[0].episodes[0];

    const first = markEpisode(db, ep1.id, true, '2020-01-01');
    assert.equal(first.state.first_watched_at, '2020-01-01');

    const again = markEpisode(db, ep1.id, true);
    assert.equal(again.state.first_watched_at, '2020-01-01', '重复标记不应改日期');
    assert.equal(again.progress.watched, 1);
  } finally {
    cleanup();
  }
});

test('单集标记：默认记录为当天（D-001）', () => {
  const { db, cleanup } = setup();
  try {
    const anime = makeAnime(db);
    setEpisodeCount(db, anime.id, 12);
    const ep1 = getEpisodesView(db, anime.id).seasons[0].episodes[0];

    const res = markEpisode(db, ep1.id, true);
    const today = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const expected = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`;
    assert.equal(res.state.first_watched_at, expected);
  } finally {
    cleanup();
  }
});

test('单集标记：取消后清空日期，重新标记写入新日期', () => {
  const { db, cleanup } = setup();
  try {
    const anime = makeAnime(db);
    setEpisodeCount(db, anime.id, 12);
    const ep1 = getEpisodesView(db, anime.id).seasons[0].episodes[0];

    markEpisode(db, ep1.id, true, '2020-01-01');
    const off = markEpisode(db, ep1.id, false);
    assert.equal(off.state.first_watched_at, null);
    assert.equal(off.progress.watched, 0);

    const on = markEpisode(db, ep1.id, true, '2021-05-05');
    assert.equal(on.state.first_watched_at, '2021-05-05');
  } finally {
    cleanup();
  }
});

test('单集标记：日期格式非法时拒绝', () => {
  const { db, cleanup } = setup();
  try {
    const anime = makeAnime(db);
    setEpisodeCount(db, anime.id, 12);
    const ep1 = getEpisodesView(db, anime.id).seasons[0].episodes[0];
    assert.throws(() => markEpisode(db, ep1.id, true, '2020/01/01'), ValidationError);
  } finally {
    cleanup();
  }
});

test('单集标记：不存在的集返回 NotFound', () => {
  const { db, cleanup } = setup();
  try {
    assert.throws(() => markEpisode(db, 'no-such-episode', true), NotFoundError);
  } finally {
    cleanup();
  }
});

/* ---------------- 时长统计 ---------------- */

test('时长：作品默认时长参与计算', () => {
  const { db, cleanup } = setup();
  try {
    const anime = makeAnime(db, { default_episode_duration_minutes: 24 });
    setEpisodeCount(db, anime.id, 12);
    setProgress(db, anime.id, 3);

    const p = computeProgress(db, anime.id);
    assert.equal(p.minutes, 72);
    assert.equal(p.missing_duration_count, 0);
  } finally {
    cleanup();
  }
});

test('时长：都没设时长时计入集数但不伪造时长', () => {
  const { db, cleanup } = setup();
  try {
    const anime = makeAnime(db);
    setEpisodeCount(db, anime.id, 12);
    setProgress(db, anime.id, 3);

    const p = computeProgress(db, anime.id);
    assert.equal(p.watched, 3, '集数照常计');
    assert.equal(p.minutes, 0, '不伪造时长');
    assert.equal(p.missing_duration_count, 3, '如实报告有几集时长未知');
  } finally {
    cleanup();
  }
});

/* ---------------- 与作品列表的联动 ---------------- */

test('列表：返回集数进度字段，供卡片直接显示', () => {
  const { db, cleanup } = setup();
  try {
    const anime = makeAnime(db);
    setEpisodeCount(db, anime.id, 12);
    setProgress(db, anime.id, 5);
    // 制造缺口：取消第 2 集
    const ep2 = getEpisodesView(db, anime.id).seasons[0].episodes[1];
    markEpisode(db, ep2.id, false);

    const [row] = searchLibrary(db, {});
    assert.equal(row.episode_total, 12);
    assert.equal(row.episode_watched, 4);
    assert.equal(row.episode_current, 5);
  } finally {
    cleanup();
  }
});

test('录入时直接带集数：建作品的同时建好集', () => {
  const { db, cleanup } = setup();
  try {
    const res = createAnimeEntry(db, {
      canonical_title: '带集数录入',
      episodes: 24
    });
    const view = getEpisodesView(db, res.anime.id);
    assert.equal(view.progress.total, 24);
  } finally {
    cleanup();
  }
});

test('录入时集数非法：整个创建回滚，不留半个作品', () => {
  const { db, cleanup } = setup();
  try {
    assert.throws(
      () => createAnimeEntry(db, { canonical_title: '会被回滚', episodes: 0 }),
      ValidationError
    );
    assert.equal(searchLibrary(db, {}).length, 0, '不应留下作品记录');
  } finally {
    cleanup();
  }
});

test('作品不存在：集数相关操作一律 NotFound', () => {
  const { db, cleanup } = setup();
  try {
    assert.throws(() => setEpisodeCount(db, 'nope', 12), NotFoundError);
    assert.throws(() => getEpisodesView(db, 'nope'), NotFoundError);
    assert.throws(() => advanceProgress(db, 'nope', 1), NotFoundError);
  } finally {
    cleanup();
  }
});

test('ensureEpisodes 不开事务，可以由调用方包在自己的事务里', () => {
  const { db, cleanup } = setup();
  try {
    const anime = makeAnime(db);
    const res = ensureEpisodes(db, anime.id, 6);
    assert.equal(res.created, 6);
    assert.equal(computeProgress(db, anime.id).total, 6);
  } finally {
    cleanup();
  }
});
