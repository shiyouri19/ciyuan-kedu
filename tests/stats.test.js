import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/db/index.js';
import { createAnimeEntry, archiveAnimeEntry } from '../server/services/animeService.js';
import { setEpisodeCount, getEpisodesView, markEpisode, setProgress } from '../server/services/episodeService.js';
import { getStats } from '../server/services/statsService.js';
import { ValidationError } from '../server/errors.js';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fanzhang-stats-'));
  const { db } = openDatabase(dir);
  return {
    db,
    cleanup() {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

/** 建一部番并返回集 id 列表 */
function makeShow(db, title, episodes, extra = {}) {
  const { anime } = createAnimeEntry(db, { canonical_title: title, ...extra });
  setEpisodeCount(db, anime.id, episodes);
  const eps = getEpisodesView(db, anime.id).seasons[0].episodes;
  return { anime, eps };
}

function watch(db, ep, date) {
  markEpisode(db, ep.id, true, date);
}

/* ---------------- 空库 ---------------- */

test('空库：不崩，各字段为 0，默认年份为今年', () => {
  const { db, cleanup } = setup();
  try {
    const s = getStats(db);
    assert.equal(s.overview.anime_total, 0);
    assert.equal(s.overview.watched_episodes, 0);
    assert.equal(s.overview.watched_minutes, 0);
    assert.equal(s.year.episodes, 0);
    assert.equal(s.year.months.length, 12, '月度要补齐 12 个');
    assert.deepEqual(s.available_years, []);
    assert.equal(s.year.year, new Date().getFullYear());
    assert.equal(s.unknown_date.episodes, 0);
  } finally {
    cleanup();
  }
});

/* ---------------- 按首次观看日期归类 ---------------- */

test('年度统计：按 first_watched_at 归类，不是按记录创建时间', () => {
  const { db, cleanup } = setup();
  try {
    const { eps } = makeShow(db, '补记的番', 12, { default_episode_duration_minutes: 24 });
    // 今天才录入，但记录的是 2024 年看的
    watch(db, eps[0], '2024-05-01');
    watch(db, eps[1], '2024-05-02');

    const s2024 = getStats(db, { year: 2024 });
    assert.equal(s2024.year.episodes, 2);
    assert.equal(s2024.year.minutes, 48);

    const thisYear = new Date().getFullYear();
    if (thisYear !== 2024) {
      const sNow = getStats(db, { year: thisYear });
      assert.equal(sNow.year.episodes, 0, '不该按录入时间算进今年');
    }
  } finally {
    cleanup();
  }
});

test('年度统计：跨年数据分别归入各自年份', () => {
  const { db, cleanup } = setup();
  try {
    const { eps } = makeShow(db, '跨年番', 12);
    watch(db, eps[0], '2024-12-31');
    watch(db, eps[1], '2025-01-01');
    watch(db, eps[2], '2025-06-15');

    assert.equal(getStats(db, { year: 2024 }).year.episodes, 1);
    assert.equal(getStats(db, { year: 2025 }).year.episodes, 2);

    const s = getStats(db);
    assert.deepEqual(
      s.available_years.map((y) => y.year),
      [2025, 2024],
      '年份列表应倒序'
    );
    assert.equal(s.latest_year, 2025, '默认看最近有记录的那年');
  } finally {
    cleanup();
  }
});

/* ---------------- 日期不详 ---------------- */

test('日期不详：不归入任何年份，单独统计', () => {
  const { db, cleanup } = setup();
  try {
    const { eps } = makeShow(db, '日期不详的番', 12, { default_episode_duration_minutes: 24 });
    // markEpisode 不传日期时会写当天，这里显式置空来模拟「日期不详」
    watch(db, eps[0], '2025-03-01');
    markEpisode(db, eps[1].id, true, null);
    db.prepare('UPDATE episode_watch_state SET first_watched_at = NULL WHERE episode_id = ?').run(eps[1].id);

    const s = getStats(db);
    assert.equal(s.year.year, 2025);
    assert.equal(s.year.episodes, 1, '年份里只算有日期的那条');
    assert.equal(s.unknown_date.episodes, 1, '日期不详要单独列出来');
    assert.equal(s.unknown_date.minutes, 24, '时长照算，只是不归年');
    assert.equal(s.overview.watched_episodes, 2, '总览仍然算两条');
  } finally {
    cleanup();
  }
});

/* ---------------- 季度与月度 ---------------- */

test('季度：由月度正确聚合', () => {
  const { db, cleanup } = setup();
  try {
    const { eps } = makeShow(db, '按季看的番', 12);
    watch(db, eps[0], '2025-01-10'); // Q1
    watch(db, eps[1], '2025-03-31'); // Q1
    watch(db, eps[2], '2025-04-01'); // Q2
    watch(db, eps[3], '2025-07-15'); // Q3
    watch(db, eps[4], '2025-12-31'); // Q4

    const q = getStats(db, { year: 2025 }).year.quarters;
    assert.deepEqual(
      q.map((x) => x.episodes),
      [2, 1, 1, 1]
    );
    assert.equal(
      q.reduce((s, x) => s + x.episodes, 0),
      5,
      '四季之和应等于全年'
    );
  } finally {
    cleanup();
  }
});

test('月度：12 个月都返回，没数据的月份为 0', () => {
  const { db, cleanup } = setup();
  try {
    const { eps } = makeShow(db, '月度番', 12);
    watch(db, eps[0], '2025-02-14');
    watch(db, eps[1], '2025-02-20');
    watch(db, eps[2], '2025-11-01');

    const m = getStats(db, { year: 2025 }).year.months;
    assert.equal(m.length, 12);
    assert.equal(m[1].episodes, 2, '2 月应该有 2 集');
    assert.equal(m[10].episodes, 1, '11 月应该有 1 集');
    assert.equal(m[0].episodes, 0, '1 月没有');
    assert.equal(m[11].episodes, 0, '12 月没有');
  } finally {
    cleanup();
  }
});

/* ---------------- 时长口径 ---------------- */

test('时长：未知时长的集计入集数、不计入时长，并如实报告', () => {
  const { db, cleanup } = setup();
  try {
    // 作品没设默认时长
    const { eps, anime } = makeShow(db, '没时长的番', 12);
    watch(db, eps[0], '2025-05-01');
    watch(db, eps[1], '2025-05-02');

    let s = getStats(db, { year: 2025 });
    assert.equal(s.year.episodes, 2, '集数照常计');
    assert.equal(s.year.minutes, 0, '不伪造时长');
    assert.equal(s.year.missing_duration_count, 2, '要说明有几集算不出时长');

    // 事后补上作品级时长，统计应立刻反映
    db.prepare('UPDATE anime SET default_episode_duration_minutes = 24 WHERE id = ?').run(anime.id);
    s = getStats(db, { year: 2025 });
    assert.equal(s.year.minutes, 48);
    assert.equal(s.year.missing_duration_count, 0);
  } finally {
    cleanup();
  }
});

test('时长：集级时长优先于作品级', () => {
  const { db, cleanup } = setup();
  try {
    const { eps } = makeShow(db, '时长优先级', 12, { default_episode_duration_minutes: 24 });
    // 把第 1 集改成 45 分钟（比如剧场版特别长）
    db.prepare('UPDATE episodes SET duration_minutes = 45 WHERE id = ?').run(eps[0].id);

    watch(db, eps[0], '2025-05-01'); // 45
    watch(db, eps[1], '2025-05-02'); // 24

    assert.equal(getStats(db, { year: 2025 }).year.minutes, 69);
  } finally {
    cleanup();
  }
});

/* ---------------- 概览 ---------------- */

test('概览：状态分布与总集数正确', () => {
  const { db, cleanup } = setup();
  try {
    makeShow(db, '在看番', 12, { status: 'watching' });
    makeShow(db, '看完番', 12, { status: 'completed' });
    makeShow(db, '想看番', 12, { status: 'want' });

    const o = getStats(db).overview;
    assert.equal(o.anime_total, 3);
    assert.equal(o.anime_active, 3);
    assert.equal(o.episodes_total, 36);
    assert.equal(o.by_status.watching, 1);
    assert.equal(o.by_status.completed, 1);
    assert.equal(o.by_status.want, 1);
  } finally {
    cleanup();
  }
});

test('概览：归档作品的观看记录仍计入（归档不等于没看过）', () => {
  const { db, cleanup } = setup();
  try {
    const { anime, eps } = makeShow(db, '归档但看过', 12, { default_episode_duration_minutes: 24 });
    watch(db, eps[0], '2025-05-01');
    archiveAnimeEntry(db, anime.id);

    const s = getStats(db, { year: 2025 });
    assert.equal(s.overview.anime_archived, 1);
    assert.equal(s.overview.anime_active, 0);
    assert.equal(s.year.episodes, 1, '归档不影响统计');
    assert.equal(s.year.minutes, 24);
  } finally {
    cleanup();
  }
});

test('取消已看后统计立即减少', () => {
  const { db, cleanup } = setup();
  try {
    const { eps } = makeShow(db, '取消测试', 12, { default_episode_duration_minutes: 24 });
    watch(db, eps[0], '2025-05-01');
    watch(db, eps[1], '2025-05-01');
    assert.equal(getStats(db, { year: 2025 }).year.episodes, 2);

    markEpisode(db, eps[0].id, false);
    assert.equal(getStats(db, { year: 2025 }).year.episodes, 1);
    assert.equal(getStats(db, { year: 2025 }).year.minutes, 24);
  } finally {
    cleanup();
  }
});

/* ---------------- 参数校验 ---------------- */

test('年份非法时报 400 级错误', () => {
  const { db, cleanup } = setup();
  try {
    for (const bad of [1800, 2200]) {
      assert.throws(() => getStats(db, { year: bad }), ValidationError, `应拒绝 ${bad}`);
    }
  } finally {
    cleanup();
  }
});
