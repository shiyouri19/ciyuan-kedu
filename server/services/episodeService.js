import { withTransaction } from '../db/index.js';
import {
  createSeason,
  listSeasons,
  createEpisode,
  listEpisodes,
  setWatched,
  correctFirstWatchedAt,
  getWatchState,
  totalWatchedMinutes,
  countWatchedWithoutDuration
} from '../repositories/episode.js';
import { getAnime } from '../repositories/anime.js';
import { ValidationError, NotFoundError } from '../errors.js';

/**
 * 季集与观看记录的业务层。
 *
 * 三条语义规则（与 docs/DECISIONS.md 对齐，改之前先想清楚）：
 *
 * 1. 「+1」不是把集号加一，而是「把下一个未看的集标记为已看」。
 *    这样跳看、补看、取消某一集之后，+1 的语义依然正确。
 * 2. 「-1」撤销最后一个已看的集，而不是按集号减一。
 * 3. 「看到第 N 集」把 1..N 标为已看，但不清除 N 之后已有的记录——
 *    用户可能跳着看，后面看过的不能被抹掉。
 *
 * 进度的两个数字不能混：
 * - current = 已看集里最大的集号，界面上说「看到第 N 集」
 * - watched = 已看的集数，统计时长用它
 * 跳看时 current > watched，所以要单独标出 has_gap，不能让「看到第 12 集」
 * 掩盖「其实只看了 8 集」。
 */

const MAX_EPISODES = 2000;

function requireAnime(db, animeId) {
  const anime = getAnime(db, animeId);
  if (!anime) throw new NotFoundError('作品不存在或已被删除');
  return anime;
}

export function parseEpisodeCount(value) {
  if (value === null || value === undefined || value === '') {
    throw new ValidationError('请填写总集数', 'episode_count');
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_EPISODES) {
    throw new ValidationError(`总集数需为 1–${MAX_EPISODES} 的整数`, 'episode_count');
  }
  return n;
}

/**
 * 观看日期校验。null / 空串表示「日期不详」。
 * 用 Date.UTC 构造再逐项比对，而不是 toISOString 截字符串——
 * 后者在 UTC+8 下会把 2026-10-25 算成 10-24，导致合法日期被判非法。
 */
export function parseWatchDate(date) {
  if (date === null || date === undefined || date === '') return null;
  const s = String(date).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new ValidationError('观看日期格式需为 YYYY-MM-DD', 'date');
  }
  const [y, m, d] = s.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    throw new ValidationError('这个日期不存在', 'date');
  }
  return s;
}

/** 本篇季：取 season_number 为 1 的那季，没有则取排序第一季。多季支持留到以后。 */
function getMainSeason(db, animeId) {
  const seasons = listSeasons(db, animeId);
  return seasons.find((s) => Number(s.season_number) === 1) ?? seasons[0] ?? null;
}

function ensureMainSeason(db, animeId) {
  return getMainSeason(db, animeId) ?? createSeason(db, animeId, { season_number: 1, sort_order: 0 });
}

/* ---------------- 进度推导 ---------------- */

/**
 * 进度完全由 episode + episode_watch_state 推导，不存冗余字段。
 * 这样任何一次标记/取消都自动反映到进度上，不会出现「进度和记录对不上」。
 */
export function computeProgress(db, animeId) {
  const rows = db
    .prepare(
      `SELECT e.episode_number, e.is_special, COALESCE(w.is_watched, 0) AS is_watched
         FROM episodes e
         JOIN seasons s ON s.id = e.season_id
         LEFT JOIN episode_watch_state w ON w.episode_id = e.id
        WHERE s.anime_id = ?
        ORDER BY s.sort_order, s.season_number, e.sort_order, e.episode_number`
    )
    .all(animeId);

  const main = rows.filter((r) => Number(r.is_special) !== 1);
  const watchedRows = main.filter((r) => Number(r.is_watched) === 1);

  const total = main.length;
  const watched = watchedRows.length;
  const current = watchedRows.reduce((max, r) => Math.max(max, Number(r.episode_number) || 0), 0);
  const nextRow = main.find((r) => Number(r.is_watched) !== 1);

  return {
    total,
    watched,
    current,
    next_episode: nextRow ? Number(nextRow.episode_number) : null,
    // 跳看标记：看到第 12 集，但只看了 8 集
    has_gap: watched > 0 && current > watched,
    at_end: total > 0 && watched >= total,
    minutes: totalWatchedMinutes(db, animeId),
    // 已看但时长未知的集数，用于如实说明「这部分未计入时长」
    missing_duration_count: countWatchedWithoutDuration(db, animeId)
  };
}

/* ---------------- 建集与改集数 ---------------- */

/**
 * 保证前 count 集存在，并删掉尾部未观看的多余集。
 * 不开事务——由调用方决定事务边界（createAnimeEntry 要在自己的事务里调它）。
 *
 * 缩减时只删「未观看」的尾部集：已观看的集即使超出目标集数也保留，
 * 因为删掉就等于丢掉观看记录。返回值里如实报告保留了几集。
 */
export function ensureEpisodes(db, animeId, count) {
  const season = ensureMainSeason(db, animeId);
  const existing = listEpisodes(db, season.id).filter((e) => Number(e.is_special) !== 1);
  const have = new Set(existing.map((e) => Number(e.episode_number)));

  let created = 0;
  for (let n = 1; n <= count; n += 1) {
    if (have.has(n)) continue;
    createEpisode(db, season.id, {
      episode_number: n,
      episode_key: String(n),
      sort_order: n
    });
    created += 1;
  }

  let removed = 0;
  let keptWatched = 0;
  for (const ep of existing) {
    const num = Number(ep.episode_number);
    if (!Number.isFinite(num) || num <= count) continue;
    if (Number(ep.is_watched) === 1) {
      keptWatched += 1;
      continue;
    }
    db.prepare('DELETE FROM episodes WHERE id = ?').run(ep.id);
    removed += 1;
  }

  return {
    requested: count,
    created,
    removed,
    kept_watched: keptWatched,
    progress: computeProgress(db, animeId)
  };
}

export function setEpisodeCount(db, animeId, count) {
  requireAnime(db, animeId);
  const total = parseEpisodeCount(count);
  return withTransaction(db, () => ensureEpisodes(db, animeId, total));
}

/* ---------------- 标记 ---------------- */

/**
 * 标记单集。date 为 null 时一律取当天（D-001：不弹日期选择器）。
 * 重复标记同一集是幂等的，不会刷新 first_watched_at。
 */
export function markEpisode(db, episodeId, watched, date = null) {
  const row = db
    .prepare(
      `SELECT e.id, e.episode_number, s.anime_id
         FROM episodes e JOIN seasons s ON s.id = e.season_id
        WHERE e.id = ?`
    )
    .get(episodeId);
  if (!row) throw new NotFoundError('这一集不存在');

  const value = parseWatchDate(date);

  return withTransaction(db, () => {
    setWatched(db, episodeId, Boolean(watched), value);
    return {
      episode: {
        id: row.id,
        episode_number: row.episode_number,
        is_watched: Boolean(watched)
      },
      state: getWatchState(db, episodeId),
      progress: computeProgress(db, row.anime_id)
    };
  });
}

/**
 * 改某集的观看日期。**与「标记已看」是两个动作**，不能合并：
 * - 标记是幂等的，重复点不会改日期（防止日期漂移）
 * - 改日期是用户显式操作，传什么就写什么
 *
 * date 传 null 表示「日期不详」——这类记录不计入任何年份的统计。
 */
export function setWatchedDate(db, episodeId, date) {
  const row = db
    .prepare(
      `SELECT e.id, e.episode_number, s.anime_id
         FROM episodes e JOIN seasons s ON s.id = e.season_id
        WHERE e.id = ?`
    )
    .get(episodeId);
  if (!row) throw new NotFoundError('这一集不存在');

  const existing = getWatchState(db, episodeId);
  if (!existing || Number(existing.is_watched) !== 1) {
    throw new ValidationError('这一集还没标记为已看，先标记再改日期', 'watched');
  }

  const value = parseWatchDate(date);

  return withTransaction(db, () => {
    const updated = correctFirstWatchedAt(db, episodeId, value);
    return {
      episode: { id: row.id, episode_number: row.episode_number },
      state: updated,
      progress: computeProgress(db, row.anime_id)
    };
  });
}

/**
 * 前进/后退一集。delta 只接受 +1 和 -1。
 */
export function advanceProgress(db, animeId, delta) {
  requireAnime(db, animeId);
  if (delta !== -1 && delta !== 1) {
    throw new ValidationError('每次只能前进或后退一集', 'delta');
  }

  return withTransaction(db, () => {
    const season = getMainSeason(db, animeId);
    const eps = season ? listEpisodes(db, season.id).filter((e) => Number(e.is_special) !== 1) : [];
    if (!eps.length) {
      throw new ValidationError('还没有设置集数，请先在详情里设置总集数', 'episode_count');
    }

    if (delta > 0) {
      const target = eps.find((e) => Number(e.is_watched) !== 1);
      if (!target) {
        return { at_end: true, changed: null, progress: computeProgress(db, animeId) };
      }
      setWatched(db, target.id, true);
      return {
        at_end: false,
        changed: { id: target.id, episode_number: target.episode_number },
        progress: computeProgress(db, animeId)
      };
    }

    const watchedList = eps.filter((e) => Number(e.is_watched) === 1);
    if (!watchedList.length) {
      return { at_start: true, changed: null, progress: computeProgress(db, animeId) };
    }
    const last = watchedList[watchedList.length - 1];
    setWatched(db, last.id, false);
    return {
      at_start: false,
      changed: { id: last.id, episode_number: last.episode_number },
      progress: computeProgress(db, animeId)
    };
  });
}

/**
 * 区间补记：把第 from 到第 to 集标为已看，可统一指定观看日期。
 *
 * 只处理**未看**的集：已标记过的不动，用 skipped 报告跳过了几集。
 * 理由是「补记」的语义是「把漏掉的补上」，不是「批量改日期」。
 * 静默覆盖用户已有的日期，比少标几集糟糕得多。要改已看集的日期，用单集编辑。
 */
export function markRange(db, animeId, from, to, date = null) {
  requireAnime(db, animeId);

  const a = Number(from);
  const b = Number(to);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < a) {
    throw new ValidationError('补记范围不对：起始集要小于等于结束集，且都大于 0', 'range');
  }
  if (b > MAX_EPISODES) {
    throw new ValidationError(`集号不能超过 ${MAX_EPISODES}`, 'range');
  }

  const value = parseWatchDate(date);

  return withTransaction(db, () => {
    const season = getMainSeason(db, animeId);
    const eps = season ? listEpisodes(db, season.id).filter((e) => Number(e.is_special) !== 1) : [];
    if (!eps.length) {
      throw new ValidationError('还没有设置集数，请先设定总集数', 'episode_count');
    }

    const inRange = eps.filter((e) => {
      const n = Number(e.episode_number);
      return n >= a && n <= b;
    });

    const targets = inRange.filter((e) => Number(e.is_watched) !== 1);
    for (const e of targets) {
      setWatched(db, e.id, true, value);
      if (value === null) {
        // setWatched 内部把 null 当成「没指定日期 → 用今天」，
        // 而这里 null 表达的是「日期不详」，所以显式再改一次。
        // 两个语义不能混用，否则「日期不详」的批量补记会悄悄写成今天。
        correctFirstWatchedAt(db, e.id, null);
      }
    }

    return {
      marked: targets.length,
      skipped: inRange.length - targets.length,
      range: { from: a, to: b },
      date: value,
      progress: computeProgress(db, animeId)
    };
  });
}

/**
 * 「看到第 N 集」：只补标记，不清除。
 * 想撤销后面的记录，用逐集或 -1。
 */
export function setProgress(db, animeId, target) {
  requireAnime(db, animeId);
  const n = Number(target);
  if (!Number.isFinite(n) || n < 0 || n > MAX_EPISODES) {
    throw new ValidationError('集号不正确', 'episode_number');
  }

  return withTransaction(db, () => {
    const season = getMainSeason(db, animeId);
    const eps = season ? listEpisodes(db, season.id).filter((e) => Number(e.is_special) !== 1) : [];
    if (!eps.length) {
      throw new ValidationError('还没有设置集数，请先在详情里设置总集数', 'episode_count');
    }

    const targets = eps.filter((e) => Number(e.episode_number) <= n && Number(e.is_watched) !== 1);
    for (const e of targets) setWatched(db, e.id, true);

    return { marked: targets.length, progress: computeProgress(db, animeId) };
  });
}

/* ---------------- 查询 ---------------- */

export function getEpisodesView(db, animeId) {
  const anime = requireAnime(db, animeId);

  const seasons = listSeasons(db, animeId).map((s) => ({
    id: s.id,
    season_number: s.season_number,
    title: s.title,
    episodes: listEpisodes(db, s.id).map((e) => ({
      id: e.id,
      episode_number: e.episode_number,
      episode_key: e.episode_key,
      title: e.title,
      is_special: Number(e.is_special) === 1,
      is_watched: Number(e.is_watched) === 1,
      first_watched_at: e.first_watched_at
    }))
  }));

  return {
    anime_id: animeId,
    title: anime.canonical_title,
    default_episode_duration_minutes: anime.default_episode_duration_minutes,
    progress: computeProgress(db, animeId),
    seasons
  };
}
