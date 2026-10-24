-- 002_external_ids.sql
-- 外部数据源关联表。字段命名遵循 docs/DATA_MODEL.md 的 `external_ids` 定义。
-- 一部作品可以同时拥有多个来源的 ID；同一来源下的外部 ID 全局唯一，避免重复导入。

CREATE TABLE external_ids (
  id              TEXT PRIMARY KEY,
  anime_id        TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL CHECK (provider IN ('bangumi','anilist')),
  external_id     TEXT NOT NULL,
  external_url    TEXT,
  last_fetched_at TEXT,
  last_error      TEXT,
  created_at      TEXT NOT NULL,
  UNIQUE (provider, external_id)
);

CREATE INDEX idx_external_anime  ON external_ids(anime_id);
CREATE INDEX idx_external_lookup ON external_ids(provider, external_id);
