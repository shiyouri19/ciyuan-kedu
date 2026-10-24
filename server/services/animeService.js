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
  listExternals
} from '../repositories/anime.js';
import { getOrCreateTag, attachTag, detachTag, listTagsOfAnime } from '../repositories/meta.js';
import { ensureEpisodes, parseEpisodeCount } from './episodeService.js';
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

/**
 * 封面地址。存的是远程 URL（不是本地文件），由 /api/cover 代理加载并落盘缓存。
 * 只接受 http(s)，避免 javascript: 之类的协议混进来。
 */
function parseCoverUrl(value) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim();
  if (s.length > 600) throw new ValidationError('封面地址过长', 'cover_url');
  // 防御：本地代理地址不能入库，否则 /api/cover 会套娃，越套越长
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

/** 标签：接受字符串数组，去空白、去重、限制长度 */
export function parseTags(value) {  if (value === null || value === undefined) return [];
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

const PROVIDERS = ['bangumi', 'anilist'];

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
 * 番剧库列表。支持关键词、状态、排序。
 * 排序字段和方向都走白名单，不接受任意字符串。
 */
export function searchLibrary(db, { keyword = '', status = '', sortBy = 'updated_at', order = 'desc', archived = false } = {}) {
  if (sortBy && !SORT_FIELDS.includes(sortBy)) {
    throw new ValidationError(`排序字段需为 ${SORT_FIELDS.join(' / ')} 之一`, 'sortBy');
  }
  if (order !== 'asc' && order !== 'desc') {
    throw new ValidationError('排序方向需为 asc 或 desc', 'order');
  }
  const safeStatus = status && STATUSES.includes(status) ? status : '';
  const kw = String(keyword ?? '').trim().slice(0, 100);

  return listWithSort(db, { keyword: kw, status: safeStatus, sortBy, order, archived: Boolean(archived) });
}

/** 排序需要拼列名，因此这里用白名单映射，不直接使用外部输入 */
function listWithSort(db, { keyword, status, sortBy, order, archived }) {
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
  if (keyword) {
    clauses.push('a.canonical_title LIKE ?');
    params.push(`%${keyword}%`);
  }

  return db
    .prepare(
      `SELECT a.id, a.canonical_title, a.sort_title, a.synopsis, a.release_year,
              a.anime_type, a.cover_path, a.default_episode_duration_minutes,
              a.metadata_status, a.created_at, a.updated_at,
              s.status, s.rating, s.is_favorite,
              (SELECT COUNT(*) FROM tags t JOIN anime_tags at ON at.tag_id = t.id WHERE at.anime_id = a.id) AS tag_count,
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

/** 详情：作品 + 个人状态 + 标签 + 季集计数（集数只读展示，不涉及标记） */
export function getAnimeDetail(db, id) {
  const anime = requireAnime(db, id);
  const state = getUserState(db, id);
  const tags = listTagsOfAnime(db, id);

  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM seasons WHERE anime_id = ?) AS season_count,
         (SELECT COUNT(*) FROM episodes e JOIN seasons s ON s.id = e.season_id WHERE s.anime_id = ?) AS episode_count,
         (SELECT COUNT(*) FROM episode_watch_state w
            JOIN episodes e ON e.id = w.episode_id
            JOIN seasons s ON s.id = e.season_id
          WHERE s.anime_id = ? AND w.is_watched = 1) AS watched_count`
    )
    .get(id, id, id);

  return {
    anime,
    state,
    tags,
    externals: listExternals(db, id),
    season_count: Number(counts?.season_count ?? 0),
    episode_count: Number(counts?.episode_count ?? 0),
    watched_count: Number(counts?.watched_count ?? 0)
  };
}

/* ---------------- 写入 ---------------- */

/**
 * 手动新建作品。作品字段、个人状态、标签在同一个事务里写入，
 * 避免出现「作品建好了但状态没写进去」的半成品。
 */
export function createAnimeEntry(db, input = {}) {
  const title = parseTitle(input.canonical_title);
  const year = parseYear(input.release_year);
  const type = parseType(input.anime_type);
  const duration = parseDuration(input.default_episode_duration_minutes);
  const status = input.status ? parseStatus(input.status) : 'want';
  const rating = parseRating(input.rating);
  const notes = parseNotes(input.notes);
  const tags = parseTags(input.tags);
  const coverUrl = parseCoverUrl(input.cover_url);
  const provider = parseProvider(input.source);
  const externalId = parseExternalId(input.external_id);
  // 录入时可以直接带集数（搜索选中后从数据源带过来），省掉「建完再设集数」这一步
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
      sort_title: parseText(input.sort_title),
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

    if (provider && externalId) {
      linkExternal(db, anime.id, provider, externalId);
    }

    if (episodes) {
      ensureEpisodes(db, anime.id, episodes);
    }

    return getAnimeDetail(db, anime.id);
  });
}

/** 只允许更新「作品资料」字段。个人状态走 changeStatus，标签走 setTags。 */
export function updateAnimeEntry(db, id, patch = {}) {
  requireAnime(db, id);

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

  if (Object.keys(fields).length === 0) {
    throw new ValidationError('没有可更新的字段');
  }

  updateAnime(db, id, fields);
  return getAnimeDetail(db, id);
}

/** 修改个人状态。评分、收藏、备注可以一起传，也可以单独传（未传则保留原值）。 */
export function changeStatus(db, id, patch = {}) {
  const anime = requireAnime(db, id);
  const nextStatus = parseStatus(patch.status);
  const current = getUserState(db, id);

  return setUserState(db, anime.id, {
    status: nextStatus,
    rating: 'rating' in patch ? parseRating(patch.rating) : current?.rating ?? null,
    is_favorite: 'is_favorite' in patch ? Boolean(patch.is_favorite) : Boolean(current?.is_favorite),
    notes: 'notes' in patch ? parseNotes(patch.notes) : current?.notes ?? null
  });
}

/** 覆盖式设置标签：先清空再写入，整体在一个事务里 */
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

/**
 * 归档前的影响评估，用于给用户「明确确认和影响说明」。
 * 阶段 2 还没有本地文件与集数管理，但字段提前留好，后续阶段不用改接口。
 */
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

/** 软归档。不删除任何记录，也不触碰本地文件。 */
export function archiveAnimeEntry(db, id) {
  requireAnime(db, id);
  archiveAnime(db, id);
  return { ok: true, anime_id: id };
}

/** 恢复归档（软删除的可逆性） */
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

/**
 * 彻底删除前的盘点：会连带删掉多少东西。
 * 这个操作不可逆，所以前端必须先展示这些数字再让用户确认。
 */
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

/**
 * 彻底删除：物理删除作品及其季、集、观看记录（外键全部 CASCADE）。
 *
 * 这是整个项目唯一不可逆的操作。只想让作品从列表消失请用 archiveAnimeEntry，
 * 那个随时能恢复。这里删掉的观看记录是真的没了。
 *
 * 调用方必须先让用户确认，并展示 assessDelete 给出的影响数字。
 */
export function deleteAnimeEntry(db, id) {
  const info = assessDelete(db, id);
  return withTransaction(db, () => {
    db.prepare('DELETE FROM anime WHERE id = ?').run(id);
    return { ok: true, deleted: true, ...info };
  });
}
