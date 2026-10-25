import { randomUUID } from 'node:crypto';

const now = () => new Date().toISOString();

/* ---------------- anime ---------------- */

export function createAnime(db, input) {
  if (!input?.canonical_title?.trim()) {
    throw new Error('canonical_title 不能为空');
  }
  const id = randomUUID();
  const ts = now();

  db.prepare(
    `INSERT INTO anime (
       id, canonical_title, sort_title, synopsis, release_year, anime_type,
       cover_path, default_episode_duration_minutes, metadata_status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.canonical_title.trim(),
    input.sort_title ?? null,
    input.synopsis ?? null,
    input.release_year ?? null,
    input.anime_type ?? null,
    input.cover_path ?? null,
    input.default_episode_duration_minutes ?? null,
    input.metadata_status ?? 'manual',
    ts,
    ts
  );

  return getAnime(db, id);
}

export function getAnime(db, id) {
  return db.prepare('SELECT * FROM anime WHERE id = ?').get(id) ?? null;
}

export function listAnime(db, { status, keyword, limit = 200 } = {}) {
  const clauses = ['a.deleted_at IS NULL'];
  const params = [];

  if (status) {
    clauses.push('s.status = ?');
    params.push(status);
  }
  if (keyword) {
    clauses.push('a.canonical_title LIKE ?');
    params.push(`%${keyword}%`);
  }
  params.push(limit);

  return db
    .prepare(
      `SELECT a.*, s.status, s.rating, s.is_favorite
       FROM anime a
       LEFT JOIN user_anime_state s ON s.anime_id = a.id
       WHERE ${clauses.join(' AND ')}
       ORDER BY a.updated_at DESC
       LIMIT ?`
    )
    .all(...params);
}

export function updateAnime(db, id, patch) {
  const allowed = [
    'canonical_title',
    'sort_title',
    'synopsis',
    'release_year',
    'anime_type',
    'cover_path',
    'default_episode_duration_minutes',
    'metadata_status'
  ];
  const fields = Object.keys(patch).filter((k) => allowed.includes(k));
  if (fields.length === 0) return getAnime(db, id);

  const setSql = fields.map((f) => `${f} = ?`).join(', ');
  db.prepare(`UPDATE anime SET ${setSql}, updated_at = ? WHERE id = ?`).run(
    ...fields.map((f) => patch[f]),
    now(),
    id
  );
  return getAnime(db, id);
}

/** 软删除：只写 deleted_at，不物理删除，观看记录一并保留 */
export function archiveAnime(db, id) {
  const ts = now();
  db.prepare('UPDATE anime SET deleted_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, id);
  return getAnime(db, id);
}

/* ---------------- user_anime_state ---------------- */

export function setUserState(db, animeId, { status, rating, is_favorite, notes }) {
  const ts = now();
  const existing = db.prepare('SELECT id FROM user_anime_state WHERE anime_id = ?').get(animeId);

  if (!existing) {
    db.prepare(
      `INSERT INTO user_anime_state (id, anime_id, status, rating, is_favorite, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      animeId,
      status,
      rating ?? null,
      is_favorite ? 1 : 0,
      notes ?? null,
      ts,
      ts
    );
  } else {
    db.prepare(
      `UPDATE user_anime_state
         SET status = ?, rating = ?, is_favorite = ?, notes = ?, updated_at = ?
       WHERE anime_id = ?`
    ).run(
      status,
      rating ?? null,
      is_favorite ? 1 : 0,
      notes ?? null,
      ts,
      animeId
    );
  }

  return db.prepare('SELECT * FROM user_anime_state WHERE anime_id = ?').get(animeId);
}

export function getUserState(db, animeId) {
  return db.prepare('SELECT * FROM user_anime_state WHERE anime_id = ?').get(animeId) ?? null;
}

/* ---------------- 外部来源关联 ---------------- */

export function findAnimeByExternal(db, provider, externalId) {
  const row = db
    .prepare('SELECT anime_id FROM external_ids WHERE provider = ? AND external_id = ?')
    .get(provider, String(externalId));
  return row ? row.anime_id : null;
}

export function linkExternal(db, animeId, provider, externalId, externalUrl = null) {
  const ts = now();
  db.prepare(
    `INSERT INTO external_ids (id, anime_id, provider, external_id, external_url, last_fetched_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider, external_id)
     DO UPDATE SET anime_id = excluded.anime_id, last_fetched_at = excluded.last_fetched_at`
  ).run(randomUUID(), animeId, provider, String(externalId), externalUrl, ts, ts);
}

export function listExternals(db, animeId) {
  return db
    .prepare('SELECT provider, external_id, external_url, last_fetched_at FROM external_ids WHERE anime_id = ?')
    .all(animeId);
}

/* ---------------- 作品别名 (anime_aliases) ---------------- */

export function listAliases(db, animeId) {
  return db
    .prepare('SELECT id, anime_id, alias, language, source_provider, created_at FROM anime_aliases WHERE anime_id = ? ORDER BY created_at ASC')
    .all(animeId);
}

export function addAlias(db, animeId, alias, { language = null, sourceProvider = 'manual' } = {}) {
  const clean = String(alias ?? '').trim();
  if (!clean) return null;
  const ts = now();
  db.prepare(
    `INSERT INTO anime_aliases (id, anime_id, alias, language, source_provider, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(anime_id, alias) DO NOTHING`
  ).run(randomUUID(), animeId, clean, language, sourceProvider, ts);
  return db.prepare('SELECT * FROM anime_aliases WHERE anime_id = ? AND alias = ?').get(animeId, clean) ?? null;
}

export function replaceAliases(db, animeId, aliases = [], sourceProvider = 'manual') {
  db.prepare('DELETE FROM anime_aliases WHERE anime_id = ?').run(animeId);
  for (const raw of aliases) {
    const clean = String(raw ?? '').trim();
    if (!clean) continue;
    addAlias(db, animeId, clean, { sourceProvider });
  }
  return listAliases(db, animeId);
}

/* ---------------- 字段来源与手工锁定 (anime_metadata_fields) ---------------- */

export const LOCKABLE_METADATA_FIELDS = [
  'canonical_title',
  'sort_title',
  'synopsis',
  'release_year',
  'anime_type',
  'cover_path',
  'default_episode_duration_minutes'
];

export function listMetadataFields(db, animeId) {
  try {
    return db
      .prepare(
        'SELECT field_key, source_provider, is_user_locked, updated_at FROM anime_metadata_fields WHERE anime_id = ? ORDER BY field_key ASC'
      )
      .all(animeId)
      .map((r) => ({
        ...r,
        is_user_locked: Boolean(r.is_user_locked)
      }));
  } catch {
    return [];
  }
}

export function getLockedFieldSet(db, animeId) {
  const rows = listMetadataFields(db, animeId);
  return new Set(rows.filter((r) => r.is_user_locked).map((r) => r.field_key));
}

export function setMetadataFieldLock(
  db,
  animeId,
  fieldKey,
  { isUserLocked = true, sourceProvider = 'manual' } = {}
) {
  if (!LOCKABLE_METADATA_FIELDS.includes(fieldKey)) return null;
  const ts = now();
  db.prepare(
    `INSERT INTO anime_metadata_fields (id, anime_id, field_key, source_provider, is_user_locked, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(anime_id, field_key)
     DO UPDATE SET source_provider = excluded.source_provider,
                   is_user_locked  = excluded.is_user_locked,
                   updated_at      = excluded.updated_at`
  ).run(randomUUID(), animeId, fieldKey, sourceProvider || 'manual', isUserLocked ? 1 : 0, ts);
  return listMetadataFields(db, animeId);
}

export function replaceLockedFields(db, animeId, lockedFields = [], sourceProvider = 'manual') {
  const targetSet = new Set(
    (Array.isArray(lockedFields) ? lockedFields : []).filter((k) =>
      LOCKABLE_METADATA_FIELDS.includes(k)
    )
  );
  for (const fieldKey of LOCKABLE_METADATA_FIELDS) {
    if (targetSet.has(fieldKey)) {
      setMetadataFieldLock(db, animeId, fieldKey, { isUserLocked: true, sourceProvider });
    } else {
      db.prepare('DELETE FROM anime_metadata_fields WHERE anime_id = ? AND field_key = ?').run(
        animeId,
        fieldKey
      );
    }
  }
  return listMetadataFields(db, animeId);
}

/* ---------------- 观看事件历史时间轴 (watch_events) ---------------- */

export function recordWatchEvent(
  db,
  {
    animeId,
    episodeId = null,
    seasonNumber = null,
    episodeNumber = null,
    episodeKey = null,
    eventType = 'watch',
    watchedDate = null,
    detail = null
  } = {}
) {
  if (!animeId) return null;
  try {
    const id = randomUUID();
    const ts = now();
    db.prepare(
      `INSERT INTO watch_events (
         id, anime_id, episode_id, season_number, episode_number, episode_key,
         event_type, watched_date, detail, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      animeId,
      episodeId,
      seasonNumber,
      episodeNumber,
      episodeKey,
      eventType,
      watchedDate,
      detail,
      ts
    );
    return id;
  } catch {
    return null;
  }
}

export function listWatchEvents(db, { animeId = null, limit = 30 } = {}) {
  try {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 30, 100));
    if (animeId) {
      return db
        .prepare(
          `SELECT we.*, a.canonical_title
             FROM watch_events we
             JOIN anime a ON a.id = we.anime_id
            WHERE we.anime_id = ?
            ORDER BY we.created_at DESC, we.rowid DESC
            LIMIT ?`
        )
        .all(animeId, safeLimit);
    }
    return db
      .prepare(
        `SELECT we.*, a.canonical_title
           FROM watch_events we
           JOIN anime a ON a.id = we.anime_id
          WHERE a.deleted_at IS NULL
          ORDER BY we.created_at DESC, we.rowid DESC
          LIMIT ?`
      )
      .all(safeLimit);
  } catch {
    return [];
  }
}


