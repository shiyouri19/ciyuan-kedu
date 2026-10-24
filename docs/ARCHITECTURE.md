# 技术架构与工程约定
版本：0.1

## 1. 技术栈

- 桌面壳：Tauri 2
- 前端：React + TypeScript + Vite
- 数据库：SQLite
- 前端测试：Vitest；UI 测试可按需要使用 Testing Library
- Rust 端测试：`cargo test`
- 版本控制：Git

具体 SQLite 插件、迁移方案和文件系统调用 API，由项目初始化阶段验证当前兼容版本后再锁定。不要未经确认就混用多个数据库访问方案。

## 2. 架构原则

1. UI 不直接访问数据库。
2. 业务规则放在 service/use-case 层，不散落在 React 组件里。
3. 数据访问集中在 repository 层。
4. 外部 API 通过 Provider/Adapter 隔离。
5. 本地文件系统与作品/观看数据分离。
6. 数据库迁移可重复测试；禁止只依赖启动时自动建表而没有版本管理。
7. 当前不做云同步，但实体使用稳定 ID，并为未来跨设备同步预留 `created_at`、`updated_at` 与可选 `deleted_at`。
8. 任何外部网络请求失败都不应使应用崩溃。

## 3. 推荐项目结构

```text
/
├─ docs/
│  ├─ PRD.md
│  ├─ ARCHITECTURE.md
│  ├─ DATA_MODEL.md
│  ├─ ACCEPTANCE.md
│  └─ AI_TASKS.md
├─ src/
│  ├─ app/
│  ├─ pages/
│  ├─ components/
│  ├─ features/
│  │  ├─ library/
│  │  ├─ anime-detail/
│  │  ├─ watch-records/
│  │  ├─ statistics/
│  │  ├─ metadata/
│  │  ├─ local-media/
│  │  ├─ resources/
│  │  └─ backup/
│  ├─ services/
│  ├─ repositories/
│  ├─ types/
│  ├─ hooks/
│  └─ tests/
├─ src-tauri/
│  ├─ src/
│  │  ├─ commands/
│  │  ├─ services/
│  │  ├─ database/
│  │  ├─ migrations/
│  │  ├─ metadata/
│  │  ├─ media/
│  │  └─ lib.rs
│  └─ Cargo.toml
├─ package.json
└─ README.md
```

如果某个功能完全适合放在前端实现，可以保留在 TypeScript；涉及文件系统权限、启动外部程序和需要受控访问的本机操作，应经 Tauri command 暴露给前端。不要把所有业务逻辑都塞进单个 Rust 文件或单个 React 页面。

## 4. 分层职责

### UI 层
负责页面展示、表单校验提示、交互状态、确认对话框与空/错误状态。不得直接拼 SQL 或直接调用外部 API。

### Feature/Use-case 层
例如：
- `markEpisodeWatched`
- `bulkMarkEpisodesWatched`
- `correctFirstWatchedDate`
- `calculateStatistics`
- `importMetadata`
- `scanMediaRoot`
- `openMediaFile`
- `createBackup`
- `restoreBackup`

### Repository 层
封装 CRUD、查询、事务和数据映射。Repository 不负责弹窗、导航或 UI 通知。

### Provider 层
统一外部元数据源接口，例如：
- `search(query)`
- `getDetails(externalId)`
- `normalize(rawData)`
- `healthCheck()`（如服务支持）

每个 Provider 独立处理 API 字段、限流、错误码和数据格式。

### 本机能力层
负责选择目录、扫描文件、检查路径、打开外部播放器、导入/导出文件和备份数据库。对文件操作给出明确错误，不应默默失败。

## 5. 主要数据流

### 手动标记观看
UI → WatchRecord use case → 数据校验 → 数据库事务 → 刷新详情/统计。

### 外部元数据导入
UI → Metadata service → Provider → 归一化 DTO → 字段冲突处理 → Repository 写入。

### 本地媒体扫描
UI → Tauri command → 文件扫描与解析 → 候选结果 → 用户确认 → Repository 保存关联。

### 资源搜索
UI → Resource provider 配置 → URL 模板编码 → 展示预览/打开浏览器。后续 RSS/API 适配器走相同的 provider 边界。

## 6. 元数据合并策略

必须区分以下两类字段：

- 外部作品字段：标题、别名、年份、类型、简介、封面、外部 ID 等。
- 用户个人字段：观看状态、每集观看记录、评分、标签、备注、收藏、用户手工锁定的标题/时长等。

外部同步只能更新允许更新的作品字段。个人字段不得由外部 Provider 写入。

建议记录字段来源，例如 `source_provider`、`source_external_id`、`last_fetched_at`，并允许用户对重要字段选择“手工锁定”。合并时：
1. 手工锁定字段优先。
2. 本地用户编辑字段优先于自动拉取字段。
3. 其余字段可依据 Provider 优先级和更新时间决定。
4. 冲突应可查看，不要静默丢弃用户修改。

## 7. 未来同步预留（当前不实现）

- 使用稳定 UUID/ULID 或其他全局唯一 ID；不要把自增数据库主键作为未来跨设备唯一身份的唯一依据。
- 重要实体包含 `created_at`、`updated_at`，需要软删除的实体可包含 `deleted_at`。
- 观看状态与观看事件分离：当前可用单集状态表；如果未来要精确同步历史操作，再增加 append-only event/change log。
- Repository 接口不应假设数据库永远只存在一份。
- 不添加账号、云端 API、同步队列、冲突解决界面或远程数据库，除非后续明确立项。

## 8. 错误处理与安全

- 外部 API 超时、限流、断网和格式变化均应转换为可理解的错误。
- 数据库写入使用事务；失败时不保留半完成状态。
- 对用户输入和外部数据做校验。
- SQL 使用参数化语句。
- 只打开经过用户选择/已登记的本地文件路径；对外部 URL 做协议白名单检查，避免执行任意命令。
- 运行外部播放器时使用安全的参数传递方式，不通过 shell 拼接命令。
- 备份恢复前校验文件、版本和完整性。
- 日志避免输出不必要的个人信息。
