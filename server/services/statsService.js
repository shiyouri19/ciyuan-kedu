import { ValidationError } from '../errors.js';
import { listWatchEvents } from '../repositories/anime.js';

/**
 * 观看统计。
 *
 * 三条口径（来自 ACCEPTANCE 第 4 节，改之前先读）：
 *
 * 1. **一律按 `first_watched_at` 归类**，不按记录的创建时间。补记去年的番，
 *    就该算在去年，而不是今天。
 * 2. **`first_watched_at IS NULL` 的记录（日期不详）不归入任何年份**，
 *    单独统计。宁可显示「有 3 集日期不详」，也不能把它塞进今年骗自己。
 * 3. **时长是标准时长估算**：集级 `duration_minutes` > 作品级 `default_episode_duration_minutes`
 *     > 未知。未知的集**计入集数、不计入时长**，并如实报告有几集。
 *
 * 归档的作品也计入统计——归档只是移出列表，你确实看过那些集。
 */

/** 未知时长时要报告，不能沉默 */
const UNKNOWN_DURATION = 'NULLIF(COALESCE(e.duration_minutes, a.default_episode_duration_minutes), 0)';

const BASE_FROM = `
  FROM episode_watch_state w
  JOIN episodes e  ON e.id = w.episode_id
  JOIN seasons  se ON se.id = e.season_id
  JOIN anime    a  ON a.id = se.anime_id
 WHERE w.is_watched = 1
`;

function num(v) {
  return Number(v ?? 0);
}

function computeMaxStreak(dateStrings = []) {
  if (!Array.isArray(dateStrings) || dateStrings.length === 0) return 0;
  const sorted = [...new Set(dateStrings)].sort();
  let maxStreak = 1;
  let curStreak = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = Date.parse(`${sorted[i - 1]}T00:00:00Z`);
    const curr = Date.parse(`${sorted[i]}T00:00:00Z`);
    const diffDays = Math.round((curr - prev) / (24 * 60 * 60 * 1000));
    if (diffDays === 1) {
      curStreak += 1;
      if (curStreak > maxStreak) maxStreak = curStreak;
    } else if (diffDays > 1) {
      curStreak = 1;
    }
  }
  return maxStreak;
}

/** 全库概览：与日期无关的总量 */
function overviewOf(db) {
  const anime = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS archived
       FROM anime`
    )
    .get();

  const byStatus = db
    .prepare(
      `SELECT s.status, COUNT(*) AS c
         FROM user_anime_state s
         JOIN anime a ON a.id = s.anime_id
        WHERE a.deleted_at IS NULL
        GROUP BY s.status`
    )
    .all();

  const favRow = db
    .prepare(
      `SELECT COUNT(*) AS c
         FROM user_anime_state s
         JOIN anime a ON a.id = s.anime_id
        WHERE a.deleted_at IS NULL AND s.is_favorite = 1`
    )
    .get();

  const episodes = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN e.is_special = 0 THEN 1 ELSE 0 END) AS main
       FROM episodes e
       JOIN seasons se ON se.id = e.season_id
       JOIN anime a ON a.id = se.anime_id`
    )
    .get();

  const watched = db
    .prepare(
      `SELECT
         COUNT(*) AS episodes,
         SUM(CASE WHEN ${UNKNOWN_DURATION} IS NULL THEN 1 ELSE 0 END) AS missing_duration,
         COALESCE(SUM(${UNKNOWN_DURATION}), 0) AS minutes
       ${BASE_FROM}`
    )
    .get();

  const statusMap = {};
  for (const r of byStatus) statusMap[r.status] = num(r.c);

  const animeTotal = num(anime?.total);
  const animeArchived = num(anime?.archived);
  const animeActive = animeTotal - animeArchived;
  const completedCount = num(statusMap.completed);
  const completionRate = animeActive > 0 ? Math.round((completedCount / animeActive) * 100) : 0;

  return {
    anime_total: animeTotal,
    anime_archived: animeArchived,
    anime_active: animeActive,
    favorite_count: num(favRow?.c),
    completion_rate: completionRate,
    by_status: statusMap,
    episodes_total: num(episodes?.total),
    episodes_main: num(episodes?.main),
    watched_episodes: num(watched?.episodes),
    watched_minutes: num(watched?.minutes),
    watched_missing_duration: num(watched?.missing_duration)
  };
}

/** 有观看记录的年份列表，倒序。日期不详的不在其中。 */
function availableYears(db) {
  return db
    .prepare(
      `SELECT substr(w.first_watched_at, 1, 4) AS y, COUNT(*) AS c
       ${BASE_FROM}
        AND w.first_watched_at IS NOT NULL
        AND length(w.first_watched_at) = 10
       GROUP BY y
       ORDER BY y DESC`
    )
    .all()
    .map((r) => ({ year: Number(r.y), episodes: num(r.c) }));
}

/** 某一年的汇总 + 月度 + 季度 + Stage 13 每日打卡热力图与连续追番天数 */
function yearOf(db, year) {
  const y = String(year);
  const range = `AND substr(w.first_watched_at, 1, 4) = ?`;

  const total = db
    .prepare(
      `SELECT
         COUNT(*) AS episodes,
         SUM(CASE WHEN ${UNKNOWN_DURATION} IS NULL THEN 1 ELSE 0 END) AS missing_duration,
         COALESCE(SUM(${UNKNOWN_DURATION}), 0) AS minutes,
         COUNT(DISTINCT a.id) AS anime_count
       ${BASE_FROM}
        AND w.first_watched_at IS NOT NULL
        ${range}`
    )
    .get(y);

  const months = db
    .prepare(
      `SELECT
         CAST(substr(w.first_watched_at, 6, 2) AS INTEGER) AS m,
         COUNT(*) AS episodes,
         COALESCE(SUM(${UNKNOWN_DURATION}), 0) AS minutes
       ${BASE_FROM}
        AND w.first_watched_at IS NOT NULL
        ${range}
       GROUP BY m
       ORDER BY m`
    )
    .all(y);

  const dailyRows = db
    .prepare(
      `SELECT
         w.first_watched_at AS d,
         COUNT(*) AS episodes,
         COALESCE(SUM(${UNKNOWN_DURATION}), 0) AS minutes
       ${BASE_FROM}
        AND w.first_watched_at IS NOT NULL
        AND length(w.first_watched_at) = 10
        ${range}
       GROUP BY w.first_watched_at
       ORDER BY w.first_watched_at ASC`
    )
    .all(y);

  const dailyActivity = dailyRows.map((r) => ({
    date: r.d,
    episodes: num(r.episodes),
    minutes: num(r.minutes)
  }));

  const monthMap = new Map(months.map((r) => [num(r.m), r]));

  // 月度：补齐 1..12，没数据的月份是 0，前端才好画柱状图
  const monthList = [];
  for (let m = 1; m <= 12; m += 1) {
    const hit = monthMap.get(m);
    monthList.push({
      month: m,
      episodes: num(hit?.episodes),
      minutes: num(hit?.minutes)
    });
  }

  // 季度：由月度聚合，避免再查一次
  const quarters = [1, 2, 3, 4].map((q) => {
    const ms = monthList.filter((x) => Math.ceil(x.month / 3) === q);
    return {
      quarter: q,
      episodes: ms.reduce((s, x) => s + x.episodes, 0),
      minutes: ms.reduce((s, x) => s + x.minutes, 0)
    };
  });

  return {
    year: Number(year),
    episodes: num(total?.episodes),
    minutes: num(total?.minutes),
    anime_count: num(total?.anime_count),
    missing_duration_count: num(total?.missing_duration),
    active_days: dailyActivity.length,
    max_streak_days: computeMaxStreak(dailyActivity.map((d) => d.date)),
    daily_activity: dailyActivity,
    months: monthList,
    quarters
  };
}

/** 日期不详的记录：不归入任何年份，单独列出来 */
function unknownDateOf(db) {
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS episodes,
         SUM(CASE WHEN ${UNKNOWN_DURATION} IS NULL THEN 1 ELSE 0 END) AS missing_duration,
         COALESCE(SUM(${UNKNOWN_DURATION}), 0) AS minutes
       ${BASE_FROM}
        AND w.first_watched_at IS NULL`
    )
    .get();

  return {
    episodes: num(row?.episodes),
    minutes: num(row?.minutes),
    missing_duration_count: num(row?.missing_duration)
  };
}

/** P2 高级统计：评分分布、作品类型占比、高频标签 Top 榜与最近观看操作时间轴 */
function advancedOf(db) {
  const ratingRows = db
    .prepare(
      `SELECT s.rating AS r, COUNT(*) AS c
         FROM user_anime_state s
         JOIN anime a ON a.id = s.anime_id
        WHERE a.deleted_at IS NULL AND s.rating IS NOT NULL
        GROUP BY s.rating
        ORDER BY s.rating ASC`
    )
    .all();

  const ratingMap = new Map(ratingRows.map((x) => [num(x.r), num(x.c)]));
  const ratingDistribution = [];
  let totalScore = 0;
  let ratedCount = 0;
  for (let score = 1; score <= 10; score += 1) {
    const count = ratingMap.get(score) || 0;
    ratingDistribution.push({ rating: score, count });
    totalScore += score * count;
    ratedCount += count;
  }

  const typeRows = db
    .prepare(
      `SELECT COALESCE(a.anime_type, 'other') AS t, COUNT(*) AS c
         FROM anime a
        WHERE a.deleted_at IS NULL
        GROUP BY COALESCE(a.anime_type, 'other')
        ORDER BY c DESC`
    )
    .all()
    .map((r) => ({ type: r.t, count: num(r.c) }));

  const topTags = db
    .prepare(
      `SELECT t.name, COUNT(*) AS c
         FROM anime_tags at
         JOIN tags t ON t.id = at.tag_id
         JOIN anime a ON a.id = at.anime_id
        WHERE a.deleted_at IS NULL
        GROUP BY t.id, t.name
        ORDER BY c DESC, t.name ASC
        LIMIT 12`
    )
    .all()
    .map((r) => ({ name: r.name, count: num(r.c) }));

  return {
    rated_count: ratedCount,
    average_rating: ratedCount > 0 ? Number((totalScore / ratedCount).toFixed(2)) : null,
    rating_distribution: ratingDistribution,
    by_type: typeRows,
    top_tags: topTags,
    recent_events: listWatchEvents(db, { limit: 20 })
  };
}

export function getStats(db, { year } = {}) {
  const years = availableYears(db);
  const overview = overviewOf(db);

  // 没指定年份时，默认看最近有记录的那年；一条都没有就用今年
  const latest = years[0]?.year ?? new Date().getFullYear();
  const target = year ? Number(year) : latest;

  if (year && (!Number.isInteger(target) || target < 1900 || target > 2100)) {
    throw new ValidationError('年份需为 1900–2100 之间的整数', 'year');
  }

  return {
    overview,
    available_years: years,
    latest_year: latest,
    year: yearOf(db, target),
    unknown_date: unknownDateOf(db),
    advanced: advancedOf(db)
  };
}
