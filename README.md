# 次元刻度

个人动画观看账本。Windows 优先、本地优先：断网、没有本地视频、外部数据源全挂，核心功能依然可用。

仓库：<https://github.com/shiyouri19/ciyuan-kedu>

当前状态：**阶段 0–3 完成**；**搜索联想**（原属阶段 5 的一部分）已提前实现。
统计页、本地文件扫描**尚未实现**。

已能日常使用的闭环：搜番 → 自动建季度集数 → 列表上点 `+1` 记一集 → 详情里逐集调整。

---

## 技术栈与偏离说明

| 项目 | 选型 |
|---|---|
| 运行时 | Node.js ≥ 22（零第三方依赖，无 `node_modules`） |
| 数据库 | `node:sqlite`（Node 内置，无需编译） |
| HTTP | `node:http` 手写路由 |
| 前端 | 原生 HTML + CSS + JS，无框架无构建 |
| 测试 | `node:test` + `node:assert` |

**关于技术选型：**

项目最初按 Tauri 2 + React + TypeScript + Vite 规划。实际落地时开发机没有 Rust/cargo，补齐工具链需额外下载约 1.5–2 GB、耗时约 30–60 分钟，因此改用 Node 方案。

受影响的部分仅限「外壳」和「前端框架」。以下工程约定与选型无关，将来若要切回 Tauri 可直接迁移：

- 分层职责（UI / use-case / repository / provider / 本机能力）
- 版本化迁移机制与迁移测试要求
- 数据模型（表、字段、约束、软删除、时间戳约定）
- 数据保护规则（外部数据不得覆盖个人字段、文件丢失不影响记录等）
- 验收清单与提交约定

如需要切回 Tauri，需要先安装 Rust 工具链，然后由 `package.json` 的 `type: module` 迁移到 Vite 工程结构。数据层代码和全部测试用例可原样复用。

---

## 依赖

只需要 Node.js 22 或以上。没有 `npm install` 这一步。

```
git clone https://github.com/shiyouri19/ciyuan-kedu.git
cd ciyuan-kedu
node --version   # 需要 v22+
```

若本机没有独立安装的 Node，把 `node.exe` 放在项目根目录，`start.bat` 会优先使用它。

---

## 启动

```bat
start.bat
```

或手动：

```bash
node --disable-warning=ExperimentalWarning server/index.js
```

启动后访问 `http://127.0.0.1:7345`。端口被占用时自动递增（7346、7347……），控制台会打印实际地址。

服务**只监听 127.0.0.1**，不对局域网开放。

## 测试

```bash
node --disable-warning=ExperimentalWarning --test
```

或 `npm test`。当前 83 个用例，覆盖：

- **迁移**：首次应用、幂等重复执行、失败回滚、外键约束、跨进程持久化
- **作品**：创建/更新/软删除、标题必填与长度、年份与类型与评分越界、状态 CHECK 约束
- **业务规则**：更新资料不重置个人状态、改状态保留评分、标签覆盖式设置且不串作品、事务回滚
- **列表**：关键词搜索、状态筛选、排序白名单（非法字段拒绝）、归档作品不进列表
- **归档**：影响评估不改数据、归档后评分备注标签保留、可恢复、重复恢复幂等
- **集数**：同季 `episode_key` 唯一、跨季可重复
- **观看状态**：重复标记不重复计数、不漂移日期、取消清空日期、显式修正日期、批量幂等
- **季集管理**：建集/扩集幂等、缩集只删未观看的、已观看的集在缩集时保留
- **进度**：`+1` 补最小未看集（跳看后仍正确）、`-1` 撤销最后已看集、`看到第 N 集` 只补不删、缺口检测
- **统计**：未知时长计入集数不计入时长、集级时长优先于作品默认值
- **接口**：新建 201 / 校验 400 带字段 / 坏 JSON 400 / 404 / 405 / 路径穿越拒绝 / 归档恢复全流程

---

## 数据存放

```
E:\次元刻度\
├── ledger.db              主数据库
├── ledger.db-wal          WAL 日志（正常关闭后为 0）
├── backup\                备份目录
├── exports\               导出目录
├── cache\covers\          封面缓存（可删）
├── cache\api\             接口缓存（可删）
└── logs\                  日志（可删）
```

路径由 `config.json` 的 `dataDir` 决定，改完重启生效。

**备份注意**：程序启动时会执行 `PRAGMA wal_checkpoint(TRUNCATE)`，把 WAL 回写主库。因此正常退出后只拷贝 `ledger.db` 就是完整的。若在运行中直接拷贝，需要连同 `ledger.db-wal` 一起拷。

---

## 目录结构

```
server/
├── index.js                 入口：读配置 → 开库 → 建服务 → 监听
├── config.js                配置加载（config.json，缺失时用默认值）
├── http.js                  路由、请求体解析、静态文件、统一错误响应
├── errors.js                ValidationError / NotFoundError / ConflictError
├── net.js                   代理隧道（手写 CONNECT）+ 超时控制
├── db/
│   ├── index.js             开库、迁移调度、事务包装、checkpoint
│   ├── migrate.js           版本化迁移执行器（PRAGMA user_version）
│   └── migrations/
│       ├── 001_init.sql     首批 8 张表
│       └── 002_external_ids.sql  多源外部 ID 关联
├── providers/               外部数据源适配，输出统一 DTO
│   ├── bangumi.js
│   └── anilist.js
├── repositories/            只做数据访问，不含业务规则
│   ├── anime.js             作品 + 个人状态 + 外部 ID
│   ├── episode.js           季 + 集 + 观看状态 + 统计
│   └── meta.js              标签 + 设置
└── services/                业务规则与校验，事务边界在这一层
    ├── animeService.js      录入、更新、改状态、标签、归档评估、列表筛选排序
    ├── episodeService.js    建集、改集数、+1/-1、看到第 N 集、进度推导
    ├── searchService.js     双源搜索与缓存、探测
    └── coverService.js      封面转发与落盘缓存
web/
├── index.html               列表 / 详情抽屉 / 表单
├── style.css
└── app.js
tests/
├── migrate.test.js
├── repositories.test.js
├── service.test.js
├── episode.test.js
├── api.test.js
└── http.test.js
tools/
└── uiprobe.mjs              CDP 驱动无头浏览器截图，用于界面验收
```

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查，含架构版本与作品数 |
| GET | `/api/meta` | 状态 / 类型 / 排序字段白名单 |
| GET | `/api/anime` | 列表，支持 `keyword` `status` `sortBy` `order` `archived=1` |
| POST | `/api/anime` | 新建作品（可同时带状态、评分、标签） |
| GET | `/api/anime/:id` | 详情（含状态、标签、季/集/已看计数） |
| PATCH | `/api/anime/:id` | 更新作品资料字段 |
| POST | `/api/anime/:id/status` | 改状态 / 评分 / 收藏 / 备注 |
| PUT | `/api/anime/:id/tags` | 覆盖式设置标签 |
| GET | `/api/anime/:id/archive-check` | 归档影响评估 |
| POST | `/api/anime/:id/archive` | 软归档 |
| POST | `/api/anime/:id/restore` | 恢复归档 |
| GET | `/api/anime/:id/episodes` | 季集列表与进度（含 `has_gap` 跳看标记、时长统计） |
| PUT | `/api/anime/:id/episodes` | 设定总集数，自动建集；缩集时不删已观看的集 |
| POST | `/api/anime/:id/progress` | `action: next / prev / set`，推进或设置进度 |
| POST | `/api/episodes/:id/watch` | 单集标记，`{ watched, date? }`；不传日期即当天 |
| GET | `/api/tags` | 全部标签 |
| GET | `/api/search?keyword=` | 双源搜索联想（Bangumi 优先，AniList 补充） |
| GET | `/api/source-status` | 两个数据源当前是否可达、走哪个代理 |
| GET | `/api/cover?u=` | 封面代理，落本地缓存；只允许白名单图床 |

错误统一为 `{ "error": { "code", "message", "field"? } }`，`field` 用于前端定位表单字段。

## 数据源与网络

| 项目 | 说明 |
|---|---|
| 元数据主源 | AniList（拉详情、集数、年份、封面） |
| 搜索优先 | **Bangumi** —— 实测中文检索明显更好（「芙莉莲」这种简称也能命中），但需代理 |
| 代理 | 手写 `https.Agent` 做 CONNECT 隧道；探测顺序为 设置 > 常见本地端口 > 环境变量 > 直连 |
| 缓存 | 搜索结果内存缓存 10 分钟；封面落盘 `cache/covers/`，经同源 `/api/cover` 提供 |

> Node 的 `fetch` 不读取 `HTTP_PROXY`，若不显式实现代理，在需要代理的网络里只会得到 `fetch failed`，且看不出原因。

### 直连实测（不开代理时能用到什么）

| 目标 | 直连结果 | 说明 |
|---|---|---|
| `api.bgm.tv`（Bangumi 官方 API） | **超时，域名被墙** | 中文搜索的数据来源 |
| `bgm-w.magiconch.com`（anime-grid 自建中转） | **200，5.3s，可直连** | 中转绕开了被墙的域名 |
| `lab.magiconch.com` | 200，1.1s | 同上 |
| `graphql.anilist.co` | 可达 599ms | 但中文关键词检索很差 |
| Dandanplay / MAL | 可达但 403 | 需申请凭据 |
| TMDB / Kitsu | 超时 | 不可达 |

**关键结论：被墙的是 `api.bgm.tv` 这一个域名，不是「访问 Bangumi 的所有方式」。**

所以有代理或无代理都能用，三条路任选：

1. **开代理**（最省事）。程序会自动探测 `proxyProbe` 里的端口。
2. **配置 `bangumiApiBase` 指向一个没被墙的中转**（不想开代理时用）。例如自建一个反向代理：
   `"bangumiApiBase": "https://你的中转域名"` —— 中转只需要把请求原样转发到 `https://api.bgm.tv`。
   anime-grid 用的就是这条路：它自己架了 `bgm-w.magiconch.com`。
3. **只搜日文原名或罗马字**（AniList 直连可用）。`葬送のフリーレン` / `Frieren` 都能命中，中文名不行。

### 自动标签

选中一条搜索结果后，程序会再拉一次详情，用 **Bangumi 标签权重的前 3 名**自动填入标签框。

原始标签按标记人数排序，但排最前的常是导演、作曲家、动画公司、作品名本身（粉丝标记得多），
因此做了三层清洗：infobox 反查（提取人名/公司，含复合值拆分与日/繁→简归一）、通用噪声规则（年份/平台/国家/改编来源）、公司名兜底表。

已知局限：约两成条目会漏掉一两个人名，原因是 Bangumi 数据本身缺 infobox 字段（如某些老条目没有「音乐」），
或日文原名与中文译名无法字面匹配（`菅野よう子` vs `菅野洋子`）。标签是普通输入框，可随时手改。

**实测对比（中文关键词检索）**：AniList 对「芙莉莲」「葬送的芙莉莲」均零命中；Bangumi 两个都能命中。因此搜索以 Bangumi 优先，AniList 仅在搜日文名/英文名或 Bangumi 不可用时兜底。

---

## 数据库版本

当前 `user_version = 2`，包含：

`anime` · `user_anime_state` · `seasons` · `episodes` · `episode_watch_state` · `tags` · `anime_tags` · `app_settings` · `external_ids`

新增迁移的方式：在 `server/db/migrations/` 下按 `NNN_描述.sql` 命名添加文件，不要修改已应用的迁移。迁移由 `PRAGMA user_version` 驱动，重复执行是幂等的。

---

## 已知未实现

- **键盘快捷键**（`+` / `-` 记集）、批量标记
- 多季拆分（目前只建一个「本篇」季，SP/OVA 字段已留）
- 修改某集的观看日期（后端 `correctFirstWatchedAt` 已就绪，界面未开放）
- 统计页（年度/季度、时长汇总）
- 本地文件扫描与文件名匹配（对应「扫描本机视频自动入库」）
- 播放器调用与进度上报
- 备份 / 恢复的用户操作入口（底层 checkpoint 已就绪）
- 单文件可执行打包

## 数据保护约定（实现时必须遵守）

- 外部元数据不得覆盖个人观看状态、观看日期、评分、标签、备注
- 删除/移动本地文件不影响作品与观看记录
- 打开视频不自动标记已看
- 统计时长使用标准单集时长，未知时长不计入且不伪造
- 统计按 `first_watched_at` 归类，不按记录创建时间
