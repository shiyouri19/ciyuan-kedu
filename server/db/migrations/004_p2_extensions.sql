-- 004_p2_extensions.sql
-- 阶段 10 (P2) 数据模型完整闭环：
-- 1. anime_metadata_fields：字段来源与手工锁定信息（保护用户手工修改不被外部 Provider 覆盖）
-- 2. resource_items：站内 RSS/API 缓存的资源列表结果（支持离线查看与分辨率/字幕组解析）
-- 3. watch_events：观看/撤销/改日期的操作历史时间轴

CREATE TABLE anime_metadata_fields (
  id              TEXT PRIMARY KEY,
  anime_id        TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  field_key       TEXT NOT NULL CHECK (field_key IN (
                    'canonical_title', 'sort_title', 'synopsis',
                    'release_year', 'anime_type', 'cover_path',
                    'default_episode_duration_minutes'
                  )),
  source_provider TEXT NOT NULL DEFAULT 'manual',
  is_user_locked  INTEGER NOT NULL DEFAULT 1 CHECK (is_user_locked IN (0, 1)),
  updated_at      TEXT NOT NULL,
  UNIQUE (anime_id, field_key)
);

CREATE INDEX idx_meta_fields_anime ON anime_metadata_fields(anime_id);

CREATE TABLE resource_items (
  id              TEXT PRIMARY KEY,
  provider_id     TEXT REFERENCES resource_providers(id) ON DELETE SET NULL,
  provider_name   TEXT,
  anime_id        TEXT REFERENCES anime(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  resource_url    TEXT NOT NULL,
  magnet_url      TEXT,
  file_size       TEXT,
  published_at    TEXT,
  resolution      TEXT,
  subtitle_info   TEXT,
  fansub          TEXT,
  episode_number  REAL,
  cached_at       TEXT NOT NULL,
  UNIQUE (anime_id, resource_url)
);

CREATE INDEX idx_resource_items_anime ON resource_items(anime_id, published_at DESC);

CREATE TABLE watch_events (
  id              TEXT PRIMARY KEY,
  anime_id        TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  episode_id      TEXT REFERENCES episodes(id) ON DELETE SET NULL,
  season_number   INTEGER,
  episode_number  INTEGER,
  episode_key     TEXT,
  event_type      TEXT NOT NULL CHECK (event_type IN ('watch', 'unwatch', 'redate', 'batch_watch')),
  watched_date    TEXT,
  detail          TEXT,
  created_at      TEXT NOT NULL
);

CREATE INDEX idx_watch_events_anime ON watch_events(anime_id, created_at DESC);
CREATE INDEX idx_watch_events_time  ON watch_events(created_at DESC);
