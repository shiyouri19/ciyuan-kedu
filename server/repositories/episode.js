import { randomUUID } from 'node:crypto';
import { withTransaction } from '../db/index.js';

const now = () => new Date().toISOString();
/** 只取日期部分的本地日，用于「首次观看日期」这种日精度的字段 */
const todayLocal = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/* ---------------- seasons ---------------- */

export function createSeason(db, animeId, { season_number, title, sort_order } = {}) {
  const id = randomUUID();
  const ts = now();
  db.prepare(
    `INSERT INTO seasons (id, anime_id, season_number, title, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, animeId, season_number ?? null, title ?? null, sort_order ?? 0, ts, ts);
  return db.prepare('SELECT * FROM seasons WHERE id = ?').get(id);
}

export function listSeasons(db, animeId) {
  return db
    .prepare('SELECT * FROM seasons WHERE anime_id = ? ORDER BY sort_order, season_number')
    .all(animeId);
}

/* ---------------- episodes ---------------- */

export function createEpisode(db, seasonId, { episode_number, episode_key, title, duration_minutes, is_special, sort_order } = {}) {
  if (!episode_key) throw new Error('episode_key 不能为空');
  const id = randomUUID();
  const ts = now();
  db.prepare(
    `INSERT INTO episodes (
       id, season_id, episode_number, episode_key, title, duration_minutes, is_special, sort_order, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    seasonId,
    episode_number ?? null,
    String(episode_key),
    title ?? null,
    duration_minutes ?? null,
    is_special ? 1 : 0,
    sort_order ?? 0,
    ts,
    ts
  );
  return db.prepare('SELECT * FROM episodes WHERE id = ?').get(id);
}

export function listEpisodes(db, seasonId) {
  return db
    .prepare(
      `SELECT e.*, COALESCE(w.is_watched, 0) AS is_watched, w.first_watched_at
       FROM episodes e
       LEFT JOIN episode_watch_state w ON w.episode_id = e.id
       WHERE e.season_id = ?
       ORDER BY e.sort_order, e.episode_number`
    )
    .all(seasonId);
}

/* ---------------- watch state ---------------- */

/**
 * 标记单集观看状态。
 * - 从未记录 → 插入
 * - 已是 watched 再标 watched → 完全不动（避免重复计数与日期漂移）。要改日期请用 correctFirstWatchedAt
 * - 取消 watched → 清空 first_watched_at
 * - 取消后重新标记 → 写入新的 first_watched_at
 */
export function setWatched(db, episodeId, watched, firstWatchedAt = null) {
  const ts = now();
  const existing = db
    .prepare('SELECT * FROM episode_watch_state WHERE episode_id = ?')
    .get(episodeId);

  if (!existing) {
    db.prepare(
      `INSERT INTO episode_watch_state (id, episode_id, is_watched, first_watched_at, recorded_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      episodeId,
      watched ? 1 : 0,
      watched ? firstWatchedAt ?? todayLocal() : null,
      ts,
      ts
    );
    return getWatchState(db, episodeId);
  }

  if (!watched) {
    db.prepare(
      `UPDATE episode_watch_state
          SET is_watched = 0, first_watched_at = NULL, updated_at = ?
        WHERE episode_id = ?`
    ).run(ts, episodeId);
    return getWatchState(db, episodeId);
  }

  if (existing.is_watched) {
    // 已经是「已看」：重复标记视为幂等操作，不计数、不改日期
    return getWatchState(db, episodeId);
  }

  db.prepare(
    `UPDATE episode_watch_state
        SET is_watched = 1, first_watched_at = ?, updated_at = ?
      WHERE episode_id = ?`
  ).run(firstWatchedAt ?? todayLocal(), ts, episodeId);
  return getWatchState(db, episodeId);
}

/**
 * 显式修正「首次观看日期」。这是与「重复标记」不同的动作：
 * 前者是用户主动改日期，后者只是确认已看。
 * 传入 null 表示「日期不详」。
 */
export function correctFirstWatchedAt(db, episodeId, dateOrNull) {
  const ts = now();
  const existing = db
    .prepare('SELECT id FROM episode_watch_state WHERE episode_id = ?')
    .get(episodeId);
  if (!existing) {
    throw new Error('该集尚无观看状态，无法修正观看日期');
  }
  db.prepare('UPDATE episode_watch_state SET first_watched_at = ?, updated_at = ? WHERE episode_id = ?').run(
    dateOrNull ?? null,
    ts,
    episodeId
  );
  return getWatchState(db, episodeId);
}

export function getWatchState(db, episodeId) {
  return db.prepare('SELECT * FROM episode_watch_state WHERE episode_id = ?').get(episodeId) ?? null;
}

/**
 * 批量标记。整批在一个事务里，任何一集失败则全部回滚。
 * 返回真正发生状态变化的集数，便于确认批量操作的影响范围。
 */
export function setWatchedBatch(db, episodeIds, watched, firstWatchedAt = null) {
  return withTransaction(db, () => {
    let changed = 0;
    for (const episodeId of episodeIds) {
      const before = db
        .prepare('SELECT is_watched FROM episode_watch_state WHERE episode_id = ?')
        .get(episodeId);
      const wasWatched = Number(before?.is_watched ?? 0) === 1;
      if (wasWatched === Boolean(watched)) continue;
      setWatched(db, episodeId, watched, firstWatchedAt);
      changed += 1;
    }
    return changed;
  });
}

/* ---------------- 统计 ---------------- */

/**
 * 已看集数：不同 episode 的数量。重复标记不会重复计数，因为状态表对 episode_id 有唯一约束。
 */
export function countWatchedEpisodes(db, animeId) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM episode_watch_state w
       JOIN episodes e ON e.id = w.episode_id
       JOIN seasons  s ON s.id = e.season_id
       WHERE s.anime_id = ? AND w.is_watched = 1`
    )
    .get(animeId);
  return Number(row?.c ?? 0);
}

/**
 * 累计标准时长（分钟）。
 * 时长优先级：集级 duration_minutes > 作品默认 default_episode_duration_minutes。
 * 两者都为空时该集不计入时长，但仍计入集数（不伪造时长）。
 */
export function totalWatchedMinutes(db, animeId) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(COALESCE(e.duration_minutes, a.default_episode_duration_minutes)), 0) AS m
       FROM episode_watch_state w
       JOIN episodes e ON e.id = w.episode_id
       JOIN seasons  s ON s.id = e.season_id
       JOIN anime    a ON a.id = s.anime_id
       WHERE s.anime_id = ?
         AND w.is_watched = 1
         AND COALESCE(e.duration_minutes, a.default_episode_duration_minutes) IS NOT NULL`
    )
    .get(animeId);
  return Number(row?.m ?? 0);
}

/** 已看但时长未知的集数，用于在界面上如实说明「这部分时长未计入」 */
export function countWatchedWithoutDuration(db, animeId) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM episode_watch_state w
       JOIN episodes e ON e.id = w.episode_id
       JOIN seasons  s ON s.id = e.season_id
       JOIN anime    a ON a.id = s.anime_id
       WHERE s.anime_id = ?
         AND w.is_watched = 1
         AND COALESCE(e.duration_minutes, a.default_episode_duration_minutes) IS NULL`
    )
    .get(animeId);
  return Number(row?.c ?? 0);
}
