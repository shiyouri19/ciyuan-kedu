# 数据模型设计
版本：0.1

这是第一版逻辑模型。具体 SQL 类型、索引、外键和迁移文件由实现阶段落实，并配套测试。字段名可在实现前统一，但语义必须保持。

## 1. 通用约定

- 所有核心实体使用稳定的全局唯一 `id`（建议 UUID）。
- 时间戳统一使用 ISO 8601 UTC，或明确采用一种一致格式；展示时转换为本地时间。
- “首次观看日期”是用户表达的观看日期，可只有日期精度；它不等于记录创建时间。
- 所有关键关联都应有外键约束。
- 对批量观看状态修改使用事务。
- 需要恢复的数据不应依赖外部 API 才能重建。

## 2. 核心表

### `anime`
作品主体资料。
- `id`：主键，UUID。
- `canonical_title`：主标题。
- `sort_title`：排序标题，可空。
- `synopsis`：简介，可空。
- `release_year`：年份，可空。
- `anime_type`：TV、电影、OVA、ONA、特别篇、其他。
- `cover_path`：本地缓存封面路径，可空。
- `default_episode_duration_minutes`：默认标准单集时长，可空。
- `metadata_status`：manual、partial、synced 等状态。
- `created_at`、`updated_at`、可选 `deleted_at`。

### `anime_aliases`
作品别名。
- `id`
- `anime_id`
- `alias`
- `language`（可空）
- `source_provider`（可空）

### `external_ids`
外部资料源关联。
- `id`
- `anime_id`
- `provider`：bangumi、anilist 等。
- `external_id`
- `external_url`（可空）
- `last_fetched_at`（可空）
- `last_error`（可空）
- 对 `(provider, external_id)` 建唯一约束。

### `anime_metadata_fields`（可选实现）
记录字段来源与手工锁定信息。
- `id`
- `anime_id`
- `field_key`
- `source_provider`（manual 或 Provider 名称）
- `is_user_locked`
- `updated_at`

如果首版实现过重，可先为关键字段保存来源标记，并在后续迁移中细化；但不得允许外部同步覆盖个人字段。

### `seasons`
季/分季信息。
- `id`
- `anime_id`
- `season_number`（可空，支持特殊季）
- `title`（可空）
- `sort_order`
- `created_at`、`updated_at`

### `episodes`
集信息。
- `id`
- `season_id`
- `episode_number`：用于展示/排序的数值，可空。
- `episode_key`：稳定的字符串标识，支持 `SP1`、`OVA1` 等特殊集。
- `title`（可空）
- `duration_minutes`（可空）
- `is_special`
- `sort_order`
- `created_at`、`updated_at`
- 对同一季的 `episode_key` 建唯一约束。

### `episode_watch_state`
每集当前观看状态。
- `id`
- `episode_id`：唯一关联一集。
- `is_watched`
- `first_watched_at`：用户指定的首次观看日期，可空。
- `recorded_at`：首次创建这条状态的时间。
- `updated_at`
- `note`（可空）

约束与行为：
- `is_watched = false` 时，`first_watched_at` 默认清空；如果未来需要保留历史操作，应单独增加观看事件表。
- 重复标记已看不产生重复统计。
- 取消已看后，用户可以重新标记并指定日期。
- 若用户需要记录每次重看，未来增加 `watch_events`；当前不把重看计入观看时长。

### `user_anime_state`
每部作品的个人状态。
- `id`
- `anime_id`：唯一关联一部作品。
- `status`：want、watching、completed、paused、dropped。
- `rating`：可空，产品需定义统一评分范围，例如 1–10。
- `is_favorite`
- `notes`（可空）
- `created_at`、`updated_at`

### `tags`
- `id`
- `name`
- `color`（可空）
- `created_at`

### `anime_tags`
- `anime_id`
- `tag_id`
- 复合主键 `(anime_id, tag_id)`。

### `library_roots`
用户登记的媒体根目录。
- `id`
- `path`
- `display_name`（可空）
- `is_enabled`
- `last_scanned_at`（可空）
- `created_at`、`updated_at`

### `media_files`
本地文件记录。
- `id`
- `episode_id`（可空，待匹配时允许为空）
- `library_root_id`（可空）
- `path`
- `file_name`
- `file_size_bytes`（可空）
- `modified_at`（可空）
- `resolution`（可空）
- `subtitle_info`（可空）
- `version_label`（可空）
- `availability_status`：available、missing、unmatched、needs_review。
- `created_at`、`updated_at`

对路径的唯一性策略需考虑大小写、符号链接和文件移动；不要仅凭文件名作为永久身份。

### `resource_providers`
用户配置的资源站点。
- `id`
- `name`
- `provider_type`：search_url、rss、api。
- `base_url`
- `search_url_template`
- `is_enabled`
- `notes`（可空）
- `last_checked_at`（可空）
- `last_status`（可空）
- `created_at`、`updated_at`

### `resource_items`（P2）
缓存的资源结果，仅在实现站内 RSS/API 时需要。
- `id`
- `provider_id`
- `anime_id`（可空）
- `title`
- `resource_url`
- `published_at`（可空）
- `resolution`（可空）
- `subtitle_info`（可空）
- `cached_at`

### `app_settings`
- `key`
- `value`
- `updated_at`

仅存普通应用设置；不要将秘密令牌以明文写入普通设置表。

## 3. 统计规则

### 集数
已看集数 = `episode_watch_state.is_watched = true` 的不同 episode 数量。

### 累计标准时长
对所有已看集：
- 优先使用 `episodes.duration_minutes`。
- 如果为空，可使用 `anime.default_episode_duration_minutes`。
- 若仍为空，不计入时长，但该集仍计入已看集数。
- 不得把未知时长默认为 24 分钟等未经确认的常量。

### 年度/季度
按 `first_watched_at` 的日期归类：
- 有日期：归入对应年、季度。
- 无日期：归入“日期不详”。
- 日期的时区和精度需在 UI 中清楚表达。
- 今天补录、但指定为往年观看的集数，应计入指定的历史日期。

### 状态与观看记录
`user_anime_state.status` 与单集观看记录分开保存。两者可能暂时不一致；可以给出“所有集已看但状态仍为在看”等提示，但不能未经确认自动覆盖用户选择。

## 4. 删除策略

- 删除作品前确认影响范围。
- 默认优先提供归档/软删除。
- 删除本地文件关联不能删除作品、集数观看状态或个人评分。
- 删除季/集时，如果有关联观看记录，应提示用户并使用事务处理。
- 对重要的批量操作提供撤销或备份保障。

## 5. 未来扩展

当前不实现同步。未来可按需求增加：
- `watch_events`：观看/撤销/改日期的操作历史。
- `sync_outbox`：待同步变更。
- `sync_conflicts`：跨设备冲突。
- 用户身份、远程存储和同步协议。

这些表不要在第一阶段提前实现，除非实际功能已明确需要。
