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
import { getAnime, listExternals, recordWatchEvent } from '../repositories/anime.js';
import { requestJson, resolveProxy, DEFAULT_UA } from '../net.js';
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

function ensureSeasonByNumber(db, animeId, seasonNumber = 1, title = null) {
  const num = Number(seasonNumber) || 1;
  const seasons = listSeasons(db, animeId);
  const found = seasons.find((s) => Number(s.season_number) === num);
  if (found) return found;
  return createSeason(db, animeId, {
    season_number: num,
    title: title || (num === 1 ? '第 1 季' : `第 ${num} 季`),
    sort_order: num - 1
  });
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
  const specials = rows.filter((r) => Number(r.is_special) === 1);
  const watchedRows = main.filter((r) => Number(r.is_watched) === 1);
  const watchedSpecials = specials.filter((r) => Number(r.is_watched) === 1);

  const total = main.length;
  const watched = watchedRows.length;
  const current = watchedRows.reduce((max, r) => Math.max(max, Number(r.episode_number) || 0), 0);
  const nextRow = main.find((r) => Number(r.is_watched) !== 1);

  return {
    total,
    watched,
    current,
    special_total: specials.length,
    special_watched: watchedSpecials.length,
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
 * 保证指定季（默认第 1 季）前 count 集存在，并删掉尾部未观看的多余集。
 */
export function ensureEpisodes(db, animeId, count, seasonNumber = 1) {
  const sNum = Number(seasonNumber) || 1;
  const season = ensureSeasonByNumber(db, animeId, sNum);
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
    season_number: season.season_number ?? sNum,
    requested: count,
    created,
    removed,
    kept_watched: keptWatched,
    progress: computeProgress(db, animeId)
  };
}

export function setEpisodeCount(db, animeId, count, seasonNumber = 1) {
  requireAnime(db, animeId);
  const total = parseEpisodeCount(count);
  const sNum = Number(seasonNumber) || 1;
  if (!Number.isInteger(sNum) || sNum < 1 || sNum > 50) {
    throw new ValidationError('季度号需为 1–50 的整数', 'season_number');
  }
  return withTransaction(db, () => ensureEpisodes(db, animeId, total, sNum));
}

/**
 * 删除指定季度及其下属分集记录（当存在多个季度时允许清理误建季度）。
 */
export function deleteSeason(db, animeId, seasonNumber) {
  requireAnime(db, animeId);
  const sNum = Number(seasonNumber);
  if (!Number.isInteger(sNum) || sNum < 1 || sNum > 50) {
    throw new ValidationError('季度号需为 1–50 的整数', 'season_number');
  }
  const seasons = listSeasons(db, animeId);
  const target = seasons.find((s) => Number(s.season_number) === sNum);
  if (!target) throw new NotFoundError(`第 ${sNum} 季不存在`);

  return withTransaction(db, () => {
    try {
      db.prepare(
        'UPDATE media_files SET episode_id = NULL WHERE episode_id IN (SELECT id FROM episodes WHERE season_id = ?)'
      ).run(target.id);
    } catch {
      /* ignore if table not ready */
    }
    db.prepare(
      'DELETE FROM episode_watch_state WHERE episode_id IN (SELECT id FROM episodes WHERE season_id = ?)'
    ).run(target.id);
    db.prepare('DELETE FROM episodes WHERE season_id = ?').run(target.id);
    db.prepare('DELETE FROM seasons WHERE id = ?').run(target.id);

    return {
      deleted_season: sNum,
      seasons: listSeasons(db, animeId),
      progress: computeProgress(db, animeId)
    };
  });
}

/**
 * 新增 SP / OVA / 特别篇单集（is_special = 1，不挤占正片集号）。
 */
export function addSpecialEpisode(db, animeId, { key = '', title = '', seasonNumber = 1 } = {}) {
  requireAnime(db, animeId);
  const sNum = Number(seasonNumber) || 1;
  return withTransaction(db, () => {
    const season = ensureSeasonByNumber(db, animeId, sNum);
    const existing = listEpisodes(db, season.id);
    const specials = existing.filter((e) => Number(e.is_special) === 1);
    const nextIdx = specials.length + 1;
    const epKey = String(key || `SP${nextIdx}`).trim().slice(0, 20);
    if (existing.some((e) => e.episode_key === epKey)) {
      throw new ValidationError(`特别篇标识「${epKey}」已存在`, 'key');
    }
    const ep = createEpisode(db, season.id, {
      episode_number: nextIdx,
      episode_key: epKey,
      title: String(title ?? '').trim().slice(0, 200) || null,
      is_special: true,
      sort_order: 10000 + nextIdx
    });
    return {
      episode: ep,
      progress: computeProgress(db, animeId)
    };
  });
}

/**
 * 更新单集元数据（如分集标题、单集时长）。
 */
export function updateEpisodeMeta(db, episodeId, { title, duration_minutes } = {}) {
  const row = db
    .prepare(
      `SELECT e.id, e.episode_number, e.episode_key, s.anime_id
         FROM episodes e JOIN seasons s ON s.id = e.season_id
        WHERE e.id = ?`
    )
    .get(episodeId);
  if (!row) throw new NotFoundError('这一集不存在');

  const cleanTitle =
    title === undefined
      ? undefined
      : title === null || String(title).trim() === ''
        ? null
        : String(title).trim().slice(0, 200);

  let cleanDur = undefined;
  if (duration_minutes !== undefined) {
    if (duration_minutes === null || duration_minutes === '') {
      cleanDur = null;
    } else {
      const n = Number(duration_minutes);
      if (!Number.isInteger(n) || n < 1 || n > 600) {
        throw new ValidationError('单集时长需为 1–600 分钟的整数', 'duration_minutes');
      }
      cleanDur = n;
    }
  }

  return withTransaction(db, () => {
    const ts = new Date().toISOString();
    if (cleanTitle !== undefined) {
      db.prepare('UPDATE episodes SET title = ?, updated_at = ? WHERE id = ?').run(cleanTitle, ts, episodeId);
    }
    if (cleanDur !== undefined) {
      db.prepare('UPDATE episodes SET duration_minutes = ?, updated_at = ? WHERE id = ?').run(cleanDur, ts, episodeId);
    }
    const updated = db.prepare('SELECT * FROM episodes WHERE id = ?').get(episodeId);
    return {
      episode: updated,
      progress: computeProgress(db, row.anime_id)
    };
  });
}

/* ---------------- 标记 ---------------- */

/**
 * 标记单集。date 为 null 时一律取当天（D-001：不弹日期选择器）。
 * 重复标记同一集是幂等的，不会刷新 first_watched_at。
 */
export function markEpisode(db, episodeId, watched, date = null) {
  const row = db
    .prepare(
      `SELECT e.id, e.episode_number, e.episode_key, s.season_number, s.anime_id
         FROM episodes e JOIN seasons s ON s.id = e.season_id
        WHERE e.id = ?`
    )
    .get(episodeId);
  if (!row) throw new NotFoundError('这一集不存在');

  const value = parseWatchDate(date);

  return withTransaction(db, () => {
    setWatched(db, episodeId, Boolean(watched), value);
    const st = getWatchState(db, episodeId);
    recordWatchEvent(db, {
      animeId: row.anime_id,
      episodeId: row.id,
      seasonNumber: row.season_number,
      episodeNumber: row.episode_number,
      episodeKey: row.episode_key,
      eventType: watched ? 'watch' : 'unwatch',
      watchedDate: watched ? st?.first_watched_at ?? value : null,
      detail: watched
        ? `标记第 ${row.season_number || 1} 季 #${row.episode_key || row.episode_number} 已看`
        : `取消第 ${row.season_number || 1} 季 #${row.episode_key || row.episode_number} 已看`
    });
    return {
      episode: {
        id: row.id,
        episode_number: row.episode_number,
        is_watched: Boolean(watched)
      },
      state: st,
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
      `SELECT e.id, e.episode_number, e.episode_key, s.season_number, s.anime_id
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
    recordWatchEvent(db, {
      animeId: row.anime_id,
      episodeId: row.id,
      seasonNumber: row.season_number,
      episodeNumber: row.episode_number,
      episodeKey: row.episode_key,
      eventType: 'redate',
      watchedDate: value,
      detail: value
        ? `将第 ${row.season_number || 1} 季 #${row.episode_key || row.episode_number} 观看日期改为 ${value}`
        : `将第 ${row.season_number || 1} 季 #${row.episode_key || row.episode_number} 设为日期不详`
    });
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
      const st = getWatchState(db, target.id);
      recordWatchEvent(db, {
        animeId,
        episodeId: target.id,
        seasonNumber: season.season_number,
        episodeNumber: target.episode_number,
        episodeKey: target.episode_key,
        eventType: 'watch',
        watchedDate: st?.first_watched_at ?? null,
        detail: `快捷 +1 标记第 ${season.season_number || 1} 季 #${target.episode_number} 已看`
      });
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
    recordWatchEvent(db, {
      animeId,
      episodeId: last.id,
      seasonNumber: season.season_number,
      episodeNumber: last.episode_number,
      episodeKey: last.episode_key,
      eventType: 'unwatch',
      watchedDate: null,
      detail: `快捷 -1 撤销第 ${season.season_number || 1} 季 #${last.episode_number} 已看`
    });
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

    if (targets.length > 0) {
      recordWatchEvent(db, {
        animeId,
        seasonNumber: season.season_number,
        episodeNumber: b,
        eventType: 'batch_watch',
        watchedDate: value,
        detail: `区间补记第 ${a}–${b} 集（新增标记 ${targets.length} 集）`
      });
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

    if (targets.length > 0) {
      recordWatchEvent(db, {
        animeId,
        seasonNumber: season.season_number,
        episodeNumber: n,
        eventType: 'batch_watch',
        watchedDate: new Date().toISOString().slice(0, 10),
        detail: `看到第 ${n} 集（补标 ${targets.length} 集）`
      });
    }

    return { marked: targets.length, progress: computeProgress(db, animeId) };
  });
}

/* ---------------- 查询 ---------------- */

export function getEpisodesView(db, animeId) {
  const anime = requireAnime(db, animeId);

  let mediaRows = [];
  try {
    mediaRows = db
      .prepare(
        `SELECT id, episode_id, file_name, path, file_size_bytes, resolution, subtitle_info, version_label, availability_status
           FROM media_files
          WHERE anime_id = ?
          ORDER BY created_at ASC`
      )
      .all(animeId);
  } catch {
    mediaRows = [];
  }

  const mediaByEpisode = new Map();
  for (const m of mediaRows) {
    if (!m.episode_id) continue;
    if (!mediaByEpisode.has(m.episode_id)) mediaByEpisode.set(m.episode_id, []);
    mediaByEpisode.get(m.episode_id).push(m);
  }

  const seasons = listSeasons(db, animeId).map((s) => ({
    id: s.id,
    season_number: s.season_number,
    title: s.title,
    episodes: listEpisodes(db, s.id).map((e) => ({
      id: e.id,
      episode_number: e.episode_number,
      episode_key: e.episode_key,
      title: e.title,
      duration_minutes: e.duration_minutes ?? null,
      is_special: Number(e.is_special) === 1,
      is_watched: Number(e.is_watched) === 1,
      first_watched_at: e.first_watched_at,
      media_files: mediaByEpisode.get(e.id) ?? []
    }))
  }));

  return {
    anime_id: animeId,
    title: anime.canonical_title,
    default_episode_duration_minutes: anime.default_episode_duration_minutes,
    progress: computeProgress(db, animeId),
    media_files: mediaRows,
    seasons
  };
}

/* ---------------- P2: 分集标题自动拉取与同步 ---------------- */

const CURATED_EPISODE_TITLES = {
  葬送的芙莉莲: [
    '冒险的结束', '没必要是魔法', '杀人魔法', '灵魂长眠之地', '死者的幻影',
    '村子的英雄', '童话故事般的事物', '葬送的芙莉莲', '断头台阿乌拉', '强大的魔法使',
    '北侧诸国的冬天', '真正的勇者', '同族嫌恶', '连系年轻人的事物', '闻到了麻烦的味道',
    '长寿朋友', '保重身体', '一级魔法使选拔测验', '周密的计划', '必要的杀戮',
    '魔法的世界', '下次就是敌人了', '零落王墓攻略', '完美的复制体', '致命的破绽',
    '魔法的高度', '人类的时代', '再会之时将让人难为情'
  ],
  '孤独摇滚！': [
    '翻滚的孤独', '明天见', '飞驰而至', '跳跃的女孩们', '不会飞的鱼',
    '八景', '到你家去', '孤独摇滚', '江之岛扶梯', '黑夜之后',
    '十二进制的黄昏', '晨光降临于你'
  ],
  迷宫饭: [
    '水煮锅与杂烩粥', '烤蜥蜴与杂菜汤', '活动盔甲', '炖高丽菜与兽人', '零食与雪酪',
    '宫廷料理与盐水煮', '水栖马与杂炊', '覆盆子与烤肉', '触手与炖肉', '大青蛙与炸肉排',
    '炎龙Ⅰ', '炎龙Ⅱ', '炎龙Ⅲ', '海蛇', '树精与鸡尾酒',
    '大扫除与清酒', '鹰身女妖与奇美拉', '变形怪', '梦魇', '冰魔像与巴洛梅兹',
    '黄金乡', '狮鹫与使魔', '蘑菇火锅与感官互换', '饺子与培根蛋'
  ],
  药屋少女的呢喃: [
    '猫猫', '无精打采的药师', '幽灵骚动', '威吓', '暗中操作',
    '园游会', '里树妃与毒', '麦秆', '自尽抑或他杀', '蜂蜜',
    '化三为二', '宦官与妓女', '外廷谨制', '新的淑妃', '鱼脍',
    '铅', '微服出巡', '阿多妃', '祭祀', '曼陀罗花',
    '赎身作战', '蓝蔷薇', '凤仙花与酢浆草', '壬氏与猫猫'
  ],
  '败犬女主太多了！': [
    '专业青梅竹马八奈见杏菜的败北方式', '为你献上注定的败北', '在战斗之前就已落败', '当你凝视败犬女主时',
    '朝云千早令人小鹿乱撞', '没被甩过的人不懂败犬的痛', '幸福结局的另一侧', '有麻烦请找咨询商量',
    '老师以为你是天花板上的污渍，继续吧', '说告别还太早', '来聊聊结果责任吧', '我大概只是刚好陪在败犬女主身边的路人角色'
  ],
  胆大党: [
    '那不就是恋爱的开始吗', '那是外星人吧', '婆婆与老太婆相撞了', '狠狠踢飞高速婆婆',
    '蛋蛋跑哪去了', '危险的女人来了', '去温柔的世界吧', '总觉得心里毛毛的',
    '合体！塞尔星人！', '见过纳斯卡线条吗', '初恋的对象', '走吧，去被诅咒的房子'
  ],
  '无职转生 ～到了异世界就拿出真本事～': [
    '无职转生', '师父', '朋友', '紧急家庭会议', '大小姐与暴力',
    '罗亚的休假', '努力的前方', '转折点 1', '邂逅', '人命的价值与最初的工作',
    '孩童与战士', '拥有魔眼的少女', '擦肩而过', '天下没有白吃的午餐', '埃里斯的慢活日常',
    '亲子吵架', '重逢', '各自的旅途', '路线选择', '妹妹女仆的诞生之日',
    '转折点 2', '现实（梦）', '醒来，更进一步'
  ],
  '吹响吧！上低音号': [
    '欢迎来到高中吹奏乐部', '请多指教上低音号', '初次合奏', '歌唱的索尔费治',
    '回响的狂欢节', '闪烁的大号', '哭泣的萨克斯风', '祭典的三角铁',
    '拜托了选拔赛', '直率的短笛', '欢迎回来选拔赛', '我的上低音号', '再见大赛'
  ],
  奇巧计程车: [
    '古怪的司机', '漫漫长夜的度过方式', '借刀与装腔作势', '田中革命',
    '别叫我偶像', '想听你说句怎么回事', '不给糖就捣蛋', 'Bless you',
    '英雄的忧郁', '我们没有明天', '如果能回到那天', '不够格', '请问您要去哪儿？'
  ],
  金牌得主: [
    '冰上的天才', '徽章测试', '鲷鱼烧与虾仁炒饭', '名港杯初级女子组（前篇）',
    '名港杯初级女子组（后篇）', '湖畔之夜', '一级的考核', '西日本强敌',
    '狼与狐狸', '夜鹰纯的门徒', '冰面上的光与影', '向金牌起跳', '下一个赛场'
  ],
  小市民系列: [
    '羊角面包之谜', '为了你而做的热可可', '甜甜圈的死角', '激辣汤面的教训',
    '柏林果酱面包的秘密', '夏洛特蛋糕属于我', '奶昔与绑架（前篇）', '奶昔与绑架（中篇）',
    '奶昔与绑架（后篇）', '秋日限定栗子金团'
  ]
};

async function fetchBangumiEpisodeTitles(cfg, subjectId) {
  const base = (cfg?.bangumiApiBase || 'https://api.bgm.tv').replace(/\/+$/, '');
  const url = `${base}/v0/episodes?subject_id=${encodeURIComponent(subjectId)}&type=0&limit=100`;
  const proxy = await resolveProxy(cfg, base);
  const res = await requestJson(url, {
    proxy,
    timeout: 6000,
    headers: {
      'User-Agent': cfg?.userAgent || DEFAULT_UA,
      Accept: 'application/json'
    }
  });
  if (res.status < 200 || res.status >= 300) return [];
  const list = Array.isArray(res.json?.data) ? res.json.data : [];
  return list
    .map((ep) => ({
      ep: Number(ep.sort || ep.ep),
      title: String(ep.name_cn || ep.name || '').trim(),
      durationMinutes: ep.duration ? parseInt(String(ep.duration), 10) || null : null
    }))
    .filter((x) => Number.isInteger(x.ep) && x.ep > 0 && x.title);
}

/**
 * 自动同步指定作品的分集标题（优先从已绑定的 Bangumi / 弹弹Play 拉取，或使用内置精选中文剧集库补齐）。
 * 严格保护用户数据：仅填充尚未设置标题（title 为空）的分集，绝不覆盖用户已手动编辑过的单集标题。
 */
export async function syncEpisodeTitles(db, cfg, animeId, { seasonNumber = 1, overwrite = false } = {}) {
  const anime = requireAnime(db, animeId);
  const sNum = Number(seasonNumber) || 1;
  const seasons = listSeasons(db, animeId);
  const targetSeason = seasons.find((s) => Number(s.season_number) === sNum) ?? seasons[0];
  if (!targetSeason) {
    throw new ValidationError('当前还没有任何集数，请先设定集数后再同步分集标题', 'season_number');
  }

  let remoteEpisodes = [];
  let sourceUsed = 'curated';

  const externals = listExternals(db, animeId);
  const bgmExt = externals.find((e) => e.provider === 'bangumi');
  if (bgmExt?.external_id && Number(targetSeason.season_number) === 1) {
    try {
      const bgmList = await fetchBangumiEpisodeTitles(cfg, bgmExt.external_id);
      if (bgmList.length > 0) {
        remoteEpisodes = bgmList;
        sourceUsed = 'bangumi';
      }
    } catch {
      /* fallback */
    }
  }

  const ddpExt = externals.find((e) => e.provider === 'dandanplay');
  if (remoteEpisodes.length === 0 && ddpExt?.external_id && cfg?.dandanplayAppId && cfg?.dandanplayAppSecret) {
    try {
      const ddpMod = await import('../providers/dandanplay.js');
      const ddpDetail = await ddpMod.detail(ddpExt.external_id, {
        proxy: '',
        ua: cfg?.userAgent || DEFAULT_UA,
        appId: cfg.dandanplayAppId,
        appSecret: cfg.dandanplayAppSecret
      });
      if (Array.isArray(ddpDetail?.episodeList) && ddpDetail.episodeList.length > 0) {
        remoteEpisodes = ddpDetail.episodeList;
        sourceUsed = 'dandanplay';
      }
    } catch {
      /* fallback */
    }
  }

  if (remoteEpisodes.length === 0) {
    const cleanTitle = String(anime.canonical_title || '')
      .replace(/\s*第[一二三四1234][季期].*$/, '')
      .trim();
    const matchedKey = Object.keys(CURATED_EPISODE_TITLES).find(
      (k) => k === anime.canonical_title || k === cleanTitle || anime.canonical_title.includes(k)
    );
    if (matchedKey) {
      remoteEpisodes = CURATED_EPISODE_TITLES[matchedKey].map((t, idx) => ({
        ep: idx + 1,
        title: t,
        durationMinutes: null
      }));
      sourceUsed = 'curated';
    }
  }

  const byEpNum = new Map(remoteEpisodes.map((x) => [x.ep, x]));
  let updatedCount = 0;
  let skippedCount = 0;

  withTransaction(db, () => {
    const eps = listEpisodes(db, targetSeason.id).filter((e) => Number(e.is_special) !== 1);
    const ts = new Date().toISOString();

    for (const e of eps) {
      const epNum = Number(e.episode_number);
      const hit = byEpNum.get(epNum);
      if (!hit || !hit.title) continue;

      if (e.title && String(e.title).trim() !== '' && !overwrite) {
        skippedCount += 1;
        continue;
      }

      db.prepare('UPDATE episodes SET title = ?, updated_at = ? WHERE id = ?').run(
        hit.title,
        ts,
        e.id
      );
      updatedCount += 1;
    }
  });

  return {
    ok: true,
    season_number: targetSeason.season_number,
    source: sourceUsed,
    available_titles: remoteEpisodes.length,
    updated: updatedCount,
    skipped_existing: skippedCount,
    episodes_view: getEpisodesView(db, animeId)
  };
}


