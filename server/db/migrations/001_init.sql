-- 001_init.sql
-- 阶段 1 首批表：anime / user_anime_state / seasons / episodes / episode_watch_state / tags / anime_tags / app_settings
-- 约定：主键为 TEXT(UUID)，时间戳为 ISO 8601 UTC 字符串，全部外键开启。

CREATE TABLE anime (
  id                                TEXT PRIMARY KEY,
  canonical_title                   TEXT NOT NULL,
  sort_title                        TEXT,
  synopsis                          TEXT,
  release_year                      INTEGER,
  anime_type                        TEXT,
  cover_path                        TEXT,
  default_episode_duration_minutes  INTEGER,
  metadata_status                   TEXT NOT NULL DEFAULT 'manual'
                                    CHECK (metadata_status IN ('manual','partial','synced')),
  created_at                        TEXT NOT NULL,
  updated_at                        TEXT NOT NULL,
  deleted_at                        TEXT
);

CREATE TABLE user_anime_state (
  id          TEXT PRIMARY KEY,
  anime_id    TEXT NOT NULL UNIQUE REFERENCES anime(id) ON DELETE CASCADE,
  status      TEXT NOT NULL
              CHECK (status IN ('want','watching','completed','paused','dropped')),
  rating      INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 10)),
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0,1)),
  notes       TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE seasons (
  id            TEXT PRIMARY KEY,
  anime_id      TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  season_number INTEGER,
  title         TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE episodes (
  id               TEXT PRIMARY KEY,
  season_id        TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  episode_number   REAL,
  episode_key      TEXT NOT NULL,
  title            TEXT,
  duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  is_special       INTEGER NOT NULL DEFAULT 0 CHECK (is_special IN (0,1)),
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  UNIQUE (season_id, episode_key)
);

CREATE TABLE episode_watch_state (
  id               TEXT PRIMARY KEY,
  episode_id       TEXT NOT NULL UNIQUE REFERENCES episodes(id) ON DELETE CASCADE,
  is_watched       INTEGER NOT NULL DEFAULT 0 CHECK (is_watched IN (0,1)),
  first_watched_at TEXT,
  recorded_at      TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  note             TEXT
);

CREATE TABLE tags (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  color      TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE anime_tags (
  anime_id TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  tag_id   TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (anime_id, tag_id)
);

CREATE TABLE app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_anime_title      ON anime(canonical_title);
CREATE INDEX idx_anime_updated    ON anime(updated_at);
CREATE INDEX idx_seasons_anime    ON seasons(anime_id, sort_order);
CREATE INDEX idx_episodes_season  ON episodes(season_id, sort_order);
CREATE INDEX idx_watch_watched    ON episode_watch_state(is_watched);
CREATE INDEX idx_anime_tags_tag   ON anime_tags(tag_id);
