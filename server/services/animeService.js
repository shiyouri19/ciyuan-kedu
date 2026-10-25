import { withTransaction } from '../db/index.js';
import {
  createAnime,
  getAnime,
  updateAnime,
  archiveAnime,
  setUserState,
  getUserState,
  findAnimeByExternal,
  linkExternal,
  listExternals,
  listAliases,
  addAlias,
  replaceAliases,
  listMetadataFields,
  getLockedFieldSet,
  setMetadataFieldLock,
  replaceLockedFields,
  listWatchEvents,
  LOCKABLE_METADATA_FIELDS
} from '../repositories/anime.js';
import { getOrCreateTag, attachTag, detachTag, listTagsOfAnime } from '../repositories/meta.js';
import {
  ensureEpisodes,
  parseEpisodeCount,
  getEpisodesView,
  markEpisode,
  setWatchedDate,
  addSpecialEpisode,
  updateEpisodeMeta
} from './episodeService.js';
import { ValidationError, NotFoundError, ConflictError } from '../errors.js';

/** 作品类型白名单，与 DATA_MODEL 一致 */
export const ANIME_TYPES = ['TV', 'movie', 'OVA', 'ONA', 'special', 'other'];
/** 个人状态白名单 */
export const STATUSES = ['want', 'watching', 'completed', 'paused', 'dropped'];
/** 排序字段白名单：只允许这些，避免拼接 SQL */
export const SORT_FIELDS = ['updated_at', 'canonical_title', 'release_year', 'rating'];

const MAX_TITLE = 200;
const MAX_NOTES = 5000;

/* ---------------- 字段校验 ---------------- */

function parseTitle(value) {
  const t = typeof value === 'string' ? value.trim() : '';
  if (!t) throw new ValidationError('标题不能为空', 'canonical_title');
  if (t.length > MAX_TITLE) throw new ValidationError(`标题不能超过 ${MAX_TITLE} 字`, 'canonical_title');
  return t;
}

function parseYear(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1900 || n > 2100) {
    throw new ValidationError('年份需为 1900–2100 之间的整数', 'release_year');
  }
  return n;
}

function parseType(value) {
  if (value === null || value === undefined || value === '') return null;
  if (!ANIME_TYPES.includes(value)) {
    throw new ValidationError(`作品类型需为 ${ANIME_TYPES.join(' / ')} 之一`, 'anime_type');
  }
  return value;
}

function parseDuration(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0 || n > 600) {
    throw new ValidationError('单集时长需为 1–600 分钟的整数', 'default_episode_duration_minutes');
  }
  return n;
}

function parseStatus(value) {
  if (!STATUSES.includes(value)) {
    throw new ValidationError(`状态需为 ${STATUSES.join(' / ')} 之一`, 'status');
  }
  return value;
}

function parseRating(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 10) {
    throw new ValidationError('评分需为 1–10 的整数', 'rating');
  }
  return n;
}

function parseNotes(value) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value);
  if (s.length > MAX_NOTES) throw new ValidationError(`备注不能超过 ${MAX_NOTES} 字`, 'notes');
  return s;
}

function parseText(value, max = 500) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (s.length > max) throw new ValidationError(`文本长度不能超过 ${max} 字`);
  return s;
}

function parseCoverUrl(value) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim();
  if (s.length > 600) throw new ValidationError('封面地址过长', 'cover_url');
  if (s.startsWith('/api/cover')) {
    throw new ValidationError('封面需存原始图片地址，不能是本地代理地址', 'cover_url');
  }
  let u;
  try {
    u = new URL(s);
  } catch {
    throw new ValidationError('封面地址不是合法 URL', 'cover_url');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new ValidationError('封面地址必须是 http(s)', 'cover_url');
  }
  return s;
}

export function parseTags(value) {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new ValidationError('标签需为字符串数组', 'tags');
  const out = [];
  for (const raw of value) {
    const name = String(raw ?? '').trim();
    if (!name) continue;
    if (name.length > 20) throw new ValidationError('单个标签不能超过 20 字', 'tags');
    if (!out.includes(name)) out.push(name);
  }
  if (out.length > 20) throw new ValidationError('标签数量不能超过 20 个', 'tags');
  return out;
}

export const PROVIDERS = ['bilibili', 'bangumi', 'anilist', 'dandanplay'];

function parseProvider(value) {
  if (value === null || value === undefined || value === '') return null;
  const p = String(value).trim().toLowerCase();
  if (!PROVIDERS.includes(p)) {
    throw new ValidationError(`数据源需为 ${PROVIDERS.join(' / ')} 之一`, 'source');
  }
  return p;
}

function parseExternalId(value) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim();
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(s)) {
    throw new ValidationError('外部 ID 格式不正确', 'external_id');
  }
  return s;
}

/* ---------------- 查询 ---------------- */

function requireAnime(db, id) {
  const anime = getAnime(db, id);
  if (!anime) throw new NotFoundError('作品不存在或已被删除');
  return anime;
}

/**
 * 番剧库列表。支持关键词、状态、标签、排序。
 */
export function searchLibrary(
  db,
  { keyword = '', status = '', tag = '', sortBy = 'updated_at', order = 'desc', archived = false, favorite = false } = {}
) {
  if (sortBy && !SORT_FIELDS.includes(sortBy)) {
    throw new ValidationError(`排序字段需为 ${SORT_FIELDS.join(' / ')} 之一`, 'sortBy');
  }
  if (order !== 'asc' && order !== 'desc') {
    throw new ValidationError('排序方向需为 asc 或 desc', 'order');
  }
  const safeStatus = status && STATUSES.includes(status) ? status : '';
  const kw = String(keyword ?? '').trim().slice(0, 100);
  const safeTag = String(tag ?? '').trim().slice(0, 30);

  return listWithSort(db, {
    keyword: kw,
    status: safeStatus,
    tag: safeTag,
    sortBy,
    order,
    archived: Boolean(archived),
    favorite: Boolean(favorite)
  });
}

function listWithSort(db, { keyword, status, tag, sortBy, order, archived, favorite }) {
  const columnMap = {
    updated_at: 'COALESCE(s.updated_at, a.updated_at)',
    canonical_title: 'a.canonical_title',
    release_year: 'a.release_year',
    rating: 's.rating'
  };
  const column = columnMap[sortBy] ?? columnMap.updated_at;
  const dir = order === 'asc' ? 'ASC' : 'DESC';

  const clauses = [archived ? 'a.deleted_at IS NOT NULL' : 'a.deleted_at IS NULL'];
  const params = [];
  if (status) {
    clauses.push('s.status = ?');
    params.push(status);
  }
  if (favorite) {
    clauses.push('s.is_favorite = 1');
  }
  if (keyword) {
    clauses.push(
      '(a.canonical_title LIKE ? OR a.sort_title LIKE ? OR EXISTS (SELECT 1 FROM anime_aliases al WHERE al.anime_id = a.id AND al.alias LIKE ?))'
    );
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (tag) {
    clauses.push(
      'EXISTS (SELECT 1 FROM anime_tags at JOIN tags t ON t.id = at.tag_id WHERE at.anime_id = a.id AND t.name = ?)'
    );
    params.push(tag);
  }

  return db
    .prepare(
      `SELECT a.id, a.canonical_title, a.sort_title, a.synopsis, a.release_year,
              a.anime_type, a.cover_path, a.default_episode_duration_minutes,
              a.metadata_status, a.created_at, a.updated_at,
              s.status, s.rating, s.is_favorite,
              (SELECT COUNT(*) FROM tags t JOIN anime_tags at ON at.tag_id = t.id WHERE at.anime_id = a.id) AS tag_count,
              (SELECT GROUP_CONCAT(t.name, ',') FROM tags t JOIN anime_tags at ON at.tag_id = t.id WHERE at.anime_id = a.id) AS tag_names,
              (SELECT COUNT(*) FROM episodes e
                 JOIN seasons se ON se.id = e.season_id
                WHERE se.anime_id = a.id AND e.is_special = 0) AS episode_total,
              (SELECT COUNT(*) FROM episode_watch_state w
                 JOIN episodes e ON e.id = w.episode_id
                 JOIN seasons se ON se.id = e.season_id
                WHERE se.anime_id = a.id AND w.is_watched = 1 AND e.is_special = 0) AS episode_watched,
              (SELECT MAX(e.episode_number) FROM episode_watch_state w
                 JOIN episodes e ON e.id = w.episode_id
                 JOIN seasons se ON se.id = e.season_id
                WHERE se.anime_id = a.id AND w.is_watched = 1 AND e.is_special = 0) AS episode_current
       FROM anime a
       LEFT JOIN user_anime_state s ON s.anime_id = a.id
       WHERE ${clauses.join(' AND ')}
       ORDER BY ${column} ${dir}, a.id`
    )
    .all(...params);
}

export function getAnimeDetail(db, id) {
  const anime = requireAnime(db, id);
  const state = getUserState(db, id);
  const tags = listTagsOfAnime(db, id);
  const aliases = listAliases(db, id);

  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM seasons WHERE anime_id = ?) AS season_count,
         (SELECT COUNT(*) FROM episodes e JOIN seasons s ON s.id = e.season_id WHERE s.anime_id = ?) AS episode_count,
         (SELECT COUNT(*) FROM episode_watch_state w
            JOIN episodes e ON e.id = w.episode_id
            JOIN seasons s ON s.id = e.season_id
          WHERE s.anime_id = ? AND w.is_watched = 1) AS watched_count,
         (SELECT COUNT(*) FROM episodes e JOIN seasons s ON s.id = e.season_id WHERE s.anime_id = ? AND e.is_special = 0) AS main_episode_count,
         (SELECT COUNT(*) FROM episode_watch_state w
            JOIN episodes e ON e.id = w.episode_id
            JOIN seasons s ON s.id = e.season_id
          WHERE s.anime_id = ? AND w.is_watched = 1 AND e.is_special = 0) AS main_watched_count`
    )
    .get(id, id, id, id, id);

  const mainTotal = Number(counts?.main_episode_count ?? 0);
  const mainWatched = Number(counts?.main_watched_count ?? 0);
  const curStatus = state?.status || 'want';

  // FR-02 & DATA_MODEL 3.4：状态与单集记录不一致时给出提示，但不擅自覆盖
  let consistency_hint = null;
  if (mainTotal > 0 && mainWatched >= mainTotal && curStatus !== 'completed') {
    consistency_hint = {
      code: 'all_watched_not_completed',
      message: `全部 ${mainTotal} 集正片均已标为已看，但当前状态仍为「${curStatus}」`,
      suggested_status: 'completed'
    };
  } else if (mainWatched > 0 && mainWatched < mainTotal && curStatus === 'want') {
    consistency_hint = {
      code: 'watched_but_want',
      message: `已记录观看 ${mainWatched} 集，但当前状态仍为「想看」`,
      suggested_status: 'watching'
    };
  }

  return {
    anime,
    state,
    tags,
    aliases,
    externals: listExternals(db, id),
    metadata_fields: listMetadataFields(db, id),
    locked_fields: [...getLockedFieldSet(db, id)],
    watch_events: listWatchEvents(db, { animeId: id, limit: 15 }),
    consistency_hint,
    season_count: Number(counts?.season_count ?? 0),
    episode_count: Number(counts?.episode_count ?? 0),
    watched_count: Number(counts?.watched_count ?? 0)
  };
}

export function parseAliases(value) {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new ValidationError('别名需为字符串数组', 'aliases');
  const out = [];
  for (const raw of value) {
    const alias = String(raw ?? '').trim();
    if (!alias) continue;
    if (alias.length > MAX_TITLE) throw new ValidationError(`单个别名不能超过 ${MAX_TITLE} 字`, 'aliases');
    if (!out.includes(alias)) out.push(alias);
  }
  if (out.length > 30) throw new ValidationError('别名数量不能超过 30 个', 'aliases');
  return out;
}

/* ---------------- 写入 ---------------- */

export function createAnimeEntry(db, input = {}) {
  const title = parseTitle(input.canonical_title);
  const sortTitle = parseText(input.sort_title);
  const year = parseYear(input.release_year);
  const type = parseType(input.anime_type);
  const duration = parseDuration(input.default_episode_duration_minutes);
  const status = input.status ? parseStatus(input.status) : 'want';
  const rating = parseRating(input.rating);
  const notes = parseNotes(input.notes);
  const tags = parseTags(input.tags);
  const aliases = parseAliases(input.aliases);
  const coverUrl = parseCoverUrl(input.cover_url);
  const provider = parseProvider(input.source);
  const externalId = parseExternalId(input.external_id);
  const episodes =
    input.episodes === null || input.episodes === undefined || input.episodes === ''
      ? null
      : parseEpisodeCount(input.episodes);

  if (provider && !externalId) throw new ValidationError('指定数据源时必须同时提供外部 ID', 'external_id');
  if (externalId && !provider) throw new ValidationError('提供外部 ID 时必须指定数据源', 'source');
  if (provider && externalId && findAnimeByExternal(db, provider, externalId)) {
    throw new ConflictError('这部作品已经在库里了，不用重复添加');
  }

  return withTransaction(db, () => {
    const anime = createAnime(db, {
      canonical_title: title,
      sort_title: sortTitle,
      synopsis: parseText(input.synopsis, 4000),
      release_year: year,
      anime_type: type,
      cover_path: coverUrl,
      default_episode_duration_minutes: duration
    });

    setUserState(db, anime.id, {
      status,
      rating,
      is_favorite: Boolean(input.is_favorite),
      notes
    });

    for (const name of tags) {
      const tag = getOrCreateTag(db, name);
      attachTag(db, anime.id, tag.id);
    }

    const aliasSet = new Set(aliases);
    if (sortTitle && sortTitle !== title) aliasSet.add(sortTitle);
    for (const al of aliasSet) {
      addAlias(db, anime.id, al, { sourceProvider: provider || 'manual' });
    }

    if (provider && externalId) {
      linkExternal(db, anime.id, provider, externalId);
    }

    if (episodes) {
      ensureEpisodes(db, anime.id, episodes);
    }

    return getAnimeDetail(db, anime.id);
  });
}

/**
 * 批量入库（B-003 季度新番导览多选一键加入账本）。
 * 自动跳过库内已存在的同源 ID 或同名作品，返回新建与跳过数量。
 * 严格遵守 D-002：若未知时长则保持 null，绝不硬编码为 24 分钟。
 */
export function batchCreateAnimeEntries(db, { items = [], status = 'want' } = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ValidationError('请至少勾选一部番剧', 'items');
  }
  if (items.length > 50) {
    throw new ValidationError('单次批量入库最多支持 50 部作品', 'items');
  }
  const safeStatus = parseStatus(status || 'want');

  const created = [];
  let skipped = 0;

  withTransaction(db, () => {
    for (const raw of items) {
      const title = String(raw?.canonical_title || raw?.title || '').trim();
      if (!title) {
        skipped += 1;
        continue;
      }

      const provider =
        raw?.source && PROVIDERS.includes(String(raw.source).toLowerCase())
          ? String(raw.source).toLowerCase()
          : null;
      const extId =
        raw?.external_id || raw?.externalId ? String(raw.external_id || raw.externalId).trim() : null;

      if (provider && extId && findAnimeByExternal(db, provider, extId)) {
        skipped += 1;
        continue;
      }

      const byTitle = db
        .prepare('SELECT id FROM anime WHERE canonical_title = ? AND deleted_at IS NULL')
        .get(title);
      if (byTitle) {
        skipped += 1;
        continue;
      }

      const rawCover = raw?.cover_url || raw?.remoteCoverUrl || raw?.coverUrl || null;
      const validCover = rawCover && /^https?:\/\//i.test(rawCover) ? rawCover : null;

      const entry = createAnimeEntry(db, {
        canonical_title: title,
        sort_title: raw?.titleNative || raw?.sort_title || null,
        synopsis: raw?.synopsis || raw?.summary || null,
        release_year: raw?.release_year || raw?.year || null,
        anime_type: raw?.anime_type || 'TV',
        default_episode_duration_minutes: raw?.default_episode_duration_minutes
          ? Number(raw.default_episode_duration_minutes)
          : null,
        status: safeStatus,
        tags: Array.isArray(raw?.tags) ? raw.tags : [],
        cover_url: validCover,
        episodes: raw?.episodes && Number(raw.episodes) > 0 ? Number(raw.episodes) : null,
        source: provider,
        external_id: provider ? extId : null
      });
      if (raw?.sourceExternalIds && typeof raw.sourceExternalIds === 'object') {
        for (const [srcKey, srcExtId] of Object.entries(raw.sourceExternalIds)) {
          if (PROVIDERS.includes(srcKey) && srcExtId) {
            linkExternal(db, entry.anime.id, srcKey, String(srcExtId));
          }
        }
      }
      created.push(entry);
    }
  });

  return {
    ok: true,
    status: safeStatus,
    created: created.length,
    skipped,
    items: created
  };
}

/**
 * Stage 12：账本主页批量管理操作（批量修改状态 / 批量追加标签 / 批量移出列表归档）。
 * 严格保护个人观看记录、单集进度与手工锁定字段。
 */
export function batchUpdateAnimeEntries(
  db,
  { ids = [], action = '', status = '', tags = [] } = {}
) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ValidationError('请至少选择一部作品', 'ids');
  }
  const cleanIds = [...new Set(ids.map((x) => String(x || '').trim()).filter(Boolean))];
  if (cleanIds.length === 0) {
    throw new ValidationError('请至少选择一部作品', 'ids');
  }
  if (cleanIds.length > 100) {
    throw new ValidationError('单次批量操作最多支持 100 部作品', 'ids');
  }

  const act = String(action || '').trim().toLowerCase();
  if (!['status', 'add_tags', 'archive', 'favorite', 'unfavorite'].includes(act)) {
    throw new ValidationError('action 需为 status / add_tags / archive / favorite / unfavorite', 'action');
  }

  let targetStatus = null;
  let targetTags = [];
  if (act === 'status') {
    targetStatus = parseStatus(status);
  } else if (act === 'add_tags') {
    targetTags = parseTags(tags);
    if (targetTags.length === 0) {
      throw new ValidationError('请至少填写一个要追加的标签', 'tags');
    }
  }

  let updated = 0;
  let skipped = 0;

  withTransaction(db, () => {
    for (const id of cleanIds) {
      const anime = getAnime(db, id);
      if (!anime || anime.deleted_at) {
        skipped += 1;
        continue;
      }
      if (act === 'status') {
        changeStatus(db, id, { status: targetStatus });
        updated += 1;
      } else if (act === 'favorite') {
        changeStatus(db, id, { is_favorite: true });
        updated += 1;
      } else if (act === 'unfavorite') {
        changeStatus(db, id, { is_favorite: false });
        updated += 1;
      } else if (act === 'add_tags') {
        for (const tName of targetTags) {
          const tagObj = getOrCreateTag(db, tName);
          attachTag(db, id, tagObj.id);
        }
        updated += 1;
      } else if (act === 'archive') {
        archiveAnime(db, id);
        updated += 1;
      }
    }
  });

  return {
    ok: true,
    action: act,
    updated,
    skipped
  };
}

export function updateAnimeEntry(db, id, patch = {}) {
  const existing = requireAnime(db, id);

  const fields = {};
  if ('canonical_title' in patch) fields.canonical_title = parseTitle(patch.canonical_title);
  if ('sort_title' in patch) fields.sort_title = parseText(patch.sort_title);
  if ('synopsis' in patch) fields.synopsis = parseText(patch.synopsis, 4000);
  if ('release_year' in patch) fields.release_year = parseYear(patch.release_year);
  if ('anime_type' in patch) fields.anime_type = parseType(patch.anime_type);
  if ('default_episode_duration_minutes' in patch) {
    fields.default_episode_duration_minutes = parseDuration(patch.default_episode_duration_minutes);
  }
  if ('cover_url' in patch) fields.cover_path = parseCoverUrl(patch.cover_url);

  if (Object.keys(fields).length === 0 && !('locked_fields' in patch)) {
    throw new ValidationError('没有可更新的字段');
  }

  return withTransaction(db, () => {
    if (Object.keys(fields).length > 0) {
      updateAnime(db, id, fields);
      // 用户手工修改过的字段自动记录为 manual 并锁定（除非显式传 auto_lock: false）
      if (patch.auto_lock !== false) {
        for (const [k, v] of Object.entries(fields)) {
          if (LOCKABLE_METADATA_FIELDS.includes(k) && v !== existing[k]) {
            setMetadataFieldLock(db, id, k, { isUserLocked: true, sourceProvider: 'manual' });
          }
        }
      }
    }
    if (Array.isArray(patch.locked_fields)) {
      replaceLockedFields(db, id, patch.locked_fields, 'manual');
    }
    return getAnimeDetail(db, id);
  });
}

export function setFieldLocks(db, id, lockedFields = []) {
  requireAnime(db, id);
  if (!Array.isArray(lockedFields)) {
    throw new ValidationError('locked_fields 需为字段名数组', 'locked_fields');
  }
  for (const k of lockedFields) {
    if (!LOCKABLE_METADATA_FIELDS.includes(k)) {
      throw new ValidationError(`不支持锁定的字段：${k}`, 'locked_fields');
    }
  }
  return withTransaction(db, () => {
    const rows = replaceLockedFields(db, id, lockedFields, 'manual');
    return {
      anime_id: id,
      locked_fields: rows.filter((r) => r.is_user_locked).map((r) => r.field_key),
      metadata_fields: rows
    };
  });
}

export function changeStatus(db, id, patch = {}) {
  const anime = requireAnime(db, id);
  const current = getUserState(db, id);
  const nextStatus =
    patch.status !== undefined && patch.status !== null && patch.status !== ''
      ? parseStatus(patch.status)
      : current?.status || 'want';

  return setUserState(db, anime.id, {
    status: nextStatus,
    rating: 'rating' in patch ? parseRating(patch.rating) : current?.rating ?? null,
    is_favorite: 'is_favorite' in patch ? Boolean(patch.is_favorite) : Boolean(current?.is_favorite),
    notes: 'notes' in patch ? parseNotes(patch.notes) : current?.notes ?? null
  });
}

export function setTags(db, id, names) {
  requireAnime(db, id);
  const tags = parseTags(names);

  return withTransaction(db, () => {
    const existing = listTagsOfAnime(db, id);
    for (const t of existing) detachTag(db, id, t.id);
    for (const name of tags) {
      const tag = getOrCreateTag(db, name);
      attachTag(db, id, tag.id);
    }
    return listTagsOfAnime(db, id);
  });
}

export function setAliases(db, id, aliases) {
  requireAnime(db, id);
  const cleanList = parseAliases(aliases);
  return withTransaction(db, () => replaceAliases(db, id, cleanList, 'manual'));
}

export function assessArchive(db, id) {
  const anime = requireAnime(db, id);
  const watched = db
    .prepare(
      `SELECT COUNT(*) AS c FROM episode_watch_state w
         JOIN episodes e ON e.id = w.episode_id
         JOIN seasons s ON s.id = e.season_id
       WHERE s.anime_id = ? AND w.is_watched = 1`
    )
    .get(id);

  return {
    anime_id: id,
    title: anime.canonical_title,
    watched_episodes: Number(watched?.c ?? 0),
    will_delete_watch_history: false,
    will_delete_local_files: false,
    reversible: true,
    message: '移出列表不会删除任何数据：个人状态、评分、备注、标签和观看记录都会保留，随时可以恢复。'
  };
}

export function archiveAnimeEntry(db, id) {
  requireAnime(db, id);
  archiveAnime(db, id);
  return { ok: true, anime_id: id };
}

export function restoreAnimeEntry(db, id) {
  const anime = getAnime(db, id);
  if (!anime) throw new NotFoundError('作品不存在');
  if (!anime.deleted_at) return { ok: true, anime_id: id, restored: false };

  db.prepare('UPDATE anime SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    id
  );
  return { ok: true, anime_id: id, restored: true };
}

export function assessDelete(db, id) {
  const anime = requireAnime(db, id);

  const row = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM episodes e
            JOIN seasons s ON s.id = e.season_id
           WHERE s.anime_id = ?) AS episodes,
         (SELECT COUNT(*) FROM episode_watch_state w
            JOIN episodes e ON e.id = w.episode_id
            JOIN seasons s ON s.id = e.season_id
           WHERE s.anime_id = ? AND w.is_watched = 1) AS watched,
         (SELECT COUNT(*) FROM anime_tags WHERE anime_id = ?) AS tags`
    )
    .get(id, id, id);

  return {
    anime_id: id,
    title: anime.canonical_title,
    archived: Boolean(anime.deleted_at),
    episodes: Number(row?.episodes ?? 0),
    watched: Number(row?.watched ?? 0),
    tags: Number(row?.tags ?? 0),
    reversible: false
  };
}

export function deleteAnimeEntry(db, id) {
  const info = assessDelete(db, id);
  return withTransaction(db, () => {
    db.prepare('DELETE FROM anime WHERE id = ?').run(id);
    return { ok: true, deleted: true, ...info };
  });
}

/* ---------------- 跨服务器导出与导入备份 ---------------- */

export function exportLibraryData(db) {
  const allRows = db.prepare('SELECT id FROM anime ORDER BY created_at ASC').all();
  const items = allRows.map((row) => {
    const detail = getAnimeDetail(db, row.id);
    const epView = getEpisodesView(db, row.id);
    return {
      anime: detail.anime,
      state: detail.state,
      tags: detail.tags.map((t) => t.name),
      aliases: (detail.aliases || []).map((a) => a.alias),
      externals: detail.externals,
      seasons: epView.seasons
    };
  });

  return {
    app: '次元刻度',
    exportVersion: 2,
    exportedAt: new Date().toISOString(),
    count: items.length,
    items
  };
}

/**
 * 导入个人数据备份（Stage 9 完整实现）：
 * - 支持多季（seasons）、特别篇（SP/OVA）、单集标题与时长、别名（aliases）、外部 ID。
 * - 支持冲突策略 conflictStrategy:
 *   - 'skip'（默认）：遇到同名或同外部 ID 的作品直接跳过并记录在 conflicts 列表中，绝不改动本地记录。
 *   - 'merge'：遇到重复作品时，仅补齐缺失的封面/简介/别名/标签及尚未标记已看的集数，绝不覆盖用户已有的评分、状态和观看日期。
 */
export function importLibraryData(db, payload) {
  if (!payload || !Array.isArray(payload.items)) {
    throw new ValidationError('导入数据格式不正确，缺少 items 数组');
  }

  const rawStrategy = String(payload.conflictStrategy || 'skip').trim().toLowerCase();
  const strategy = rawStrategy === 'sync' ? 'sync' : rawStrategy === 'merge' ? 'merge' : 'skip';
  let imported = 0;
  let merged = 0;
  let skipped = 0;
  const conflicts = [];

  const syncSeasonsIntoAnime = (animeId, seasonsList, { syncMode = false } = {}) => {
    if (!Array.isArray(seasonsList) || seasonsList.length === 0) return;

    for (const sObj of seasonsList) {
      const sNum = Number(sObj?.season_number) || 1;
      const epList = Array.isArray(sObj?.episodes) ? sObj.episodes : [];
      const regularEps = epList.filter((e) => !e.is_special);
      const specialEps = epList.filter((e) => e.is_special);

      if (regularEps.length > 0) {
        const maxNum = regularEps.reduce((m, e) => Math.max(m, Number(e.episode_number) || 0), regularEps.length);
        ensureEpisodes(db, animeId, maxNum, sNum);
      }

      for (const sp of specialEps) {
        try {
          addSpecialEpisode(db, animeId, {
            seasonNumber: sNum,
            key: sp.episode_key || '',
            title: sp.title || '',
            durationMinutes: sp.duration_minutes ?? null
          });
        } catch {
          /* 已存在同 key 特别篇时忽略 */
        }
      }

      const freshEpView = getEpisodesView(db, animeId);
      const targetSeason = freshEpView.seasons.find((s) => Number(s.season_number) === sNum) ?? freshEpView.seasons[0];
      if (!targetSeason) continue;

      const byKey = new Map(targetSeason.episodes.map((e) => [String(e.episode_key), e]));
      const byNum = new Map(
        targetSeason.episodes.filter((e) => !e.is_special).map((e) => [Number(e.episode_number), e])
      );

      for (const oldEp of epList) {
        const target = oldEp.is_special
          ? byKey.get(String(oldEp.episode_key))
          : byNum.get(Number(oldEp.episode_number)) || byKey.get(String(oldEp.episode_key));
        if (!target) continue;

        if (oldEp.title || oldEp.duration_minutes) {
          try {
            updateEpisodeMeta(db, target.id, {
              title: oldEp.title ?? undefined,
              duration_minutes: oldEp.duration_minutes ?? undefined
            });
          } catch {
            /* ignore meta error */
          }
        }

        // 在目标集尚未标记已看时补记；若为 sync 双向同步模式且远端有明确更早观看日期则补齐日期
        if (oldEp.is_watched && !target.is_watched) {
          markEpisode(db, target.id, true, oldEp.first_watched_at || null);
          if (!oldEp.first_watched_at) {
            setWatchedDate(db, target.id, null);
          }
          if (oldEp.note) {
            db.prepare('UPDATE episode_watch_state SET note = ? WHERE episode_id = ?').run(
              String(oldEp.note),
              target.id
            );
          }
        } else if (syncMode && oldEp.is_watched && target.is_watched && oldEp.first_watched_at) {
          if (!target.first_watched_at || String(oldEp.first_watched_at) < String(target.first_watched_at)) {
            setWatchedDate(db, target.id, oldEp.first_watched_at);
          }
        }
      }
    }
  };

  withTransaction(db, () => {
    for (const entry of payload.items) {
      const a = entry?.anime;
      const title = String(a?.canonical_title ?? '').trim();
      if (!title) {
        skipped += 1;
        continue;
      }

      const extList = Array.isArray(entry.externals) ? entry.externals : [];
      const firstExt = extList.find((x) => x?.provider && PROVIDERS.includes(x.provider) && x?.external_id) || null;

      let existingId = null;
      let conflictReason = null;

      if (firstExt) {
        const byExt = findAnimeByExternal(db, firstExt.provider, String(firstExt.external_id));
        if (byExt) {
          existingId = byExt;
          conflictReason = `外部数据源重复 (${firstExt.provider}:${firstExt.external_id})`;
        }
      }

      if (!existingId) {
        const byTitle = db
          .prepare('SELECT id FROM anime WHERE canonical_title = ?')
          .get(title);
        if (byTitle) {
          existingId = byTitle.id;
          conflictReason = '同名作品已存在';
        }
      }

      if (existingId) {
        conflicts.push({
          title,
          anime_id: existingId,
          reason: conflictReason,
          action: strategy
        });

        if (strategy === 'skip') {
          skipped += 1;
          continue;
        }

        // merge 与 sync 策略
        const curDetail = getAnimeDetail(db, existingId);
        const lockedSet = new Set(curDetail.locked_fields || []);
        const incomingNewerAnime =
          strategy === 'sync' &&
          a?.updated_at &&
          (!curDetail.anime.updated_at || String(a.updated_at) > String(curDetail.anime.updated_at));

        const patch = {};
        if ((!curDetail.anime.synopsis || (incomingNewerAnime && !lockedSet.has('synopsis'))) && a.synopsis) {
          patch.synopsis = a.synopsis;
        }
        if ((!curDetail.anime.release_year || (incomingNewerAnime && !lockedSet.has('release_year'))) && a.release_year) {
          patch.release_year = a.release_year;
        }
        if (
          (!curDetail.anime.cover_path || (incomingNewerAnime && !lockedSet.has('cover_path'))) &&
          a.cover_path &&
          /^https?:\/\//.test(a.cover_path)
        ) {
          patch.cover_url = a.cover_path;
        }
        if (
          (!curDetail.anime.default_episode_duration_minutes ||
            (incomingNewerAnime && !lockedSet.has('default_episode_duration_minutes'))) &&
          a.default_episode_duration_minutes
        ) {
          patch.default_episode_duration_minutes = a.default_episode_duration_minutes;
        }
        if (Object.keys(patch).length > 0) {
          updateAnimeEntry(db, existingId, { ...patch, auto_lock: false });
        }

        // sync 双向同步策略下：按 state.updated_at 比较两端个人状态（谁更新用谁的）
        if (strategy === 'sync' && entry.state) {
          const localUpdatedAt = curDetail.state?.updated_at ? String(curDetail.state.updated_at) : '';
          const remoteUpdatedAt = entry.state?.updated_at ? String(entry.state.updated_at) : '';
          if (!localUpdatedAt || (remoteUpdatedAt && remoteUpdatedAt > localUpdatedAt)) {
            changeStatus(db, existingId, {
              status: entry.state.status || curDetail.state?.status || 'want',
              rating: entry.state.rating !== undefined ? entry.state.rating : curDetail.state?.rating ?? null,
              is_favorite:
                entry.state.is_favorite !== undefined
                  ? Boolean(entry.state.is_favorite)
                  : Boolean(curDetail.state?.is_favorite),
              notes: entry.state.notes !== undefined ? entry.state.notes : curDetail.state?.notes ?? null
            });
            if (remoteUpdatedAt) {
              db.prepare('UPDATE user_anime_state SET updated_at = ? WHERE anime_id = ?').run(
                remoteUpdatedAt,
                existingId
              );
            }
          }
        }

        if (Array.isArray(entry.aliases)) {
          for (const al of entry.aliases) addAlias(db, existingId, al, { sourceProvider: 'import' });
        }
        if (Array.isArray(entry.tags) && entry.tags.length > 0) {
          const mergedTags = [...new Set([...curDetail.tags.map((t) => t.name), ...entry.tags])].slice(0, 20);
          setTags(db, existingId, mergedTags);
        }
        for (const ext of extList) {
          if (ext?.provider && PROVIDERS.includes(ext.provider) && ext?.external_id) {
            if (!findAnimeByExternal(db, ext.provider, String(ext.external_id))) {
              linkExternal(db, existingId, ext.provider, String(ext.external_id));
            }
          }
        }

        syncSeasonsIntoAnime(existingId, entry.seasons, { syncMode: strategy === 'sync' });
        merged += 1;
        continue;
      }

      const created = createAnimeEntry(db, {
        canonical_title: title,
        sort_title: a.sort_title,
        synopsis: a.synopsis,
        release_year: a.release_year,
        anime_type: a.anime_type,
        cover_url: a.cover_path && /^https?:\/\//.test(a.cover_path) ? a.cover_path : null,
        default_episode_duration_minutes: a.default_episode_duration_minutes,
        status: entry.state?.status || 'want',
        rating: entry.state?.rating ?? null,
        is_favorite: Boolean(entry.state?.is_favorite),
        notes: entry.state?.notes ?? null,
        tags: Array.isArray(entry.tags) ? entry.tags : [],
        aliases: Array.isArray(entry.aliases) ? entry.aliases : [],
        source: firstExt ? firstExt.provider : null,
        external_id: firstExt ? String(firstExt.external_id) : null
      });

      for (const ext of extList.slice(1)) {
        if (ext?.provider && PROVIDERS.includes(ext.provider) && ext?.external_id) {
          if (!findAnimeByExternal(db, ext.provider, String(ext.external_id))) {
            linkExternal(db, created.anime.id, ext.provider, String(ext.external_id));
          }
        }
      }

      if (a.deleted_at) {
        db.prepare('UPDATE anime SET deleted_at = ?, updated_at = ? WHERE id = ?').run(
          String(a.deleted_at),
          String(a.updated_at || a.deleted_at),
          created.anime.id
        );
      }

      syncSeasonsIntoAnime(created.anime.id, entry.seasons);
      imported += 1;
    }
  });

  return { ok: true, strategy, imported, merged, skipped, conflicts };
}
