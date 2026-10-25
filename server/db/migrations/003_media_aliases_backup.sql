-- 003_media_aliases_backup.sql
-- 阶段 6–9 数据模型补齐：
-- 0. 平滑升级 external_ids 表，扩展 provider CHECK 约束以支持 dandanplay（不篡改已发布的 002_external_ids.sql）
-- 1. 作品别名 (anime_aliases)
-- 2. 本地媒体根目录 (library_roots)
-- 3. 本地视频文件索引 (media_files)
-- 4. 资源站点配置 (resource_providers)

CREATE TABLE external_ids_v3 (
  id              TEXT PRIMARY KEY,
  anime_id        TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL CHECK (provider IN ('bilibili','bangumi','anilist','dandanplay')),
  external_id     TEXT NOT NULL,
  external_url    TEXT,
  last_fetched_at TEXT,
  last_error      TEXT,
  created_at      TEXT NOT NULL,
  UNIQUE (provider, external_id)
);

INSERT INTO external_ids_v3 (id, anime_id, provider, external_id, external_url, last_fetched_at, last_error, created_at)
SELECT id, anime_id, provider, external_id, external_url, last_fetched_at, last_error, created_at FROM external_ids;

DROP TABLE external_ids;

ALTER TABLE external_ids_v3 RENAME TO external_ids;

CREATE INDEX idx_external_anime  ON external_ids(anime_id);
CREATE INDEX idx_external_lookup ON external_ids(provider, external_id);

CREATE TABLE anime_aliases (
  id              TEXT PRIMARY KEY,
  anime_id        TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  alias           TEXT NOT NULL,
  language        TEXT,
  source_provider TEXT,
  created_at      TEXT NOT NULL,
  UNIQUE (anime_id, alias)
);

CREATE INDEX idx_aliases_anime ON anime_aliases(anime_id);
CREATE INDEX idx_aliases_lookup ON anime_aliases(alias);

CREATE TABLE library_roots (
  id              TEXT PRIMARY KEY,
  path            TEXT NOT NULL UNIQUE,
  display_name    TEXT,
  is_enabled      INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
  last_scanned_at TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE media_files (
  id                  TEXT PRIMARY KEY,
  anime_id            TEXT REFERENCES anime(id) ON DELETE SET NULL,
  episode_id          TEXT REFERENCES episodes(id) ON DELETE SET NULL,
  library_root_id     TEXT REFERENCES library_roots(id) ON DELETE SET NULL,
  path                TEXT NOT NULL UNIQUE,
  file_name           TEXT NOT NULL,
  file_size_bytes     INTEGER,
  modified_at         TEXT,
  resolution          TEXT,
  subtitle_info       TEXT,
  version_label       TEXT,
  parsed_title        TEXT,
  parsed_season       INTEGER,
  parsed_episode      REAL,
  is_special          INTEGER NOT NULL DEFAULT 0 CHECK (is_special IN (0,1)),
  candidate_json      TEXT,
  availability_status TEXT NOT NULL DEFAULT 'unmatched'
                      CHECK (availability_status IN ('available','missing','unmatched','needs_review')),
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE INDEX idx_media_files_anime   ON media_files(anime_id);
CREATE INDEX idx_media_files_episode ON media_files(episode_id);
CREATE INDEX idx_media_files_root    ON media_files(library_root_id);
CREATE INDEX idx_media_files_status  ON media_files(availability_status);

CREATE TABLE resource_providers (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  provider_type       TEXT NOT NULL DEFAULT 'search_url'
                      CHECK (provider_type IN ('search_url','rss','api')),
  base_url            TEXT,
  search_url_template TEXT NOT NULL,
  is_enabled          INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
  notes               TEXT,
  last_checked_at     TEXT,
  last_status         TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
