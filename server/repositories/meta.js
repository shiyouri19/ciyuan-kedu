import { randomUUID } from 'node:crypto';

const now = () => new Date().toISOString();

/* ---------------- tags ---------------- */

export function createTag(db, name, color = null) {
  if (!name?.trim()) throw new Error('标签名不能为空');
  const id = randomUUID();
  db.prepare('INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)').run(
    id,
    name.trim(),
    color,
    now()
  );
  return db.prepare('SELECT * FROM tags WHERE id = ?').get(id);
}

export function listTags(db) {
  return db.prepare('SELECT * FROM tags ORDER BY name').all();
}

export function getOrCreateTag(db, name) {
  const found = db.prepare('SELECT * FROM tags WHERE name = ?').get(name.trim());
  return found ?? createTag(db, name);
}

export function attachTag(db, animeId, tagId) {
  db.prepare('INSERT OR IGNORE INTO anime_tags (anime_id, tag_id) VALUES (?, ?)').run(animeId, tagId);
}

export function detachTag(db, animeId, tagId) {
  db.prepare('DELETE FROM anime_tags WHERE anime_id = ? AND tag_id = ?').run(animeId, tagId);
}

export function listTagsOfAnime(db, animeId) {
  return db
    .prepare(
      `SELECT t.* FROM tags t
       JOIN anime_tags at ON at.tag_id = t.id
       WHERE at.anime_id = ?
       ORDER BY t.name`
    )
    .all(animeId);
}

/* ---------------- settings ---------------- */

export function getSetting(db, key, fallback = null) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(db, key, value) {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, String(value), now());
}
