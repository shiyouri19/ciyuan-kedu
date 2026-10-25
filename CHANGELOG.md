# 次元刻度 (ciyuan-kedu) 版本演进与开发过程全记录 (CHANGELOG)

本文件完整记录「次元刻度 · 个人动画观看账本」从初始基础骨架（`v0.1.0`）到当前桌面独立窗口体验版（`v0.8.0`，涵盖 **Stages 0–16 及 P2 进阶扩展**）的每一次版本迭代、架构决策、合规红线修复、关键改动文件与自动化验收结果。

---

## 版本总览速查表

| 版本号 | 对应开发阶段 | 核心里程碑与解决问题摘要 | 数据库架构版本 | 自动化测试通过数 |
| :--- | :--- | :--- | :---: | :---: |
| **v0.8.0** | **Stage 16** | 修复新番导览封面加载（图床白名单扩展+三级回退）、新增新番卡片点击详情预览抽屉、新增显式「批量选择」开关按钮、新增 Windows 无黑框独立桌面应用窗口启动器（`.vbs` + 桌面快捷方式 + 后台安全退出） | `user_version = 4` (16 表) | **142 / 142** |
| **v0.7.1** | **Stage 15.1** | 移除批处理中引起解析闪退的自动下载括号块，恢复纯净直接的本机 Node.js 启动逻辑（CRLF 编码） | `user_version = 4` (16 表) | **142 / 142** |
| **v0.7.0** | **Stage 15** | 彻底移除 `AniList` 外文源（仅保留 `Bangumi` + `弹弹Play`）、新增 `inspectBangumiBroadcastState` 过滤未放送/1号占位空壳/PV词条、Bangumi 季度扩展至 4 页（200 部）+ 当季 `/calendar` 交叉补全、实现繁简/季号/副标题跨源深度去重与双源 ID 绑定 | `user_version = 4` (16 表) | **142 / 142** |
| **v0.6.0** | **Stage 14** | 修复 Windows 启动脚本、实现 Win 本地端与云端时间戳感知双向合并同步 (`POST /api/sync`)、新增可选访问口令守卫 (`ACCESS_TOKEN`)、新增移动端 PWA 独立应用支持与 `Dockerfile` / `docker-compose.yml` | `user_version = 4` (16 表) | **141 / 141** |
| **v0.5.0** | **Stage 13** | 实现弹弹Play 5 大功能组配额守卫与 90% 自动熔断保护、季度目录按评分排序 (`score_desc`/`score_asc`)、`★ 特别收藏` 全链路筛选、年度 365 天追番打卡热力图与最长连续追番统计 | `user_version = 4` (16 表) | **140 / 140** |
| **v0.4.0** | **Stages 6–12 & P2 合规融合** | 融合多季/SP管理、本地文件名防踩坑扫描、安全调用默认播放器、资源发现模板与站内 RSS 字幕组分栏、16 表全量物理备份恢复；修复 `002` 迁移历史不可变红线、`D-002` 禁伪造 24 分钟时长、`FR-02` 禁静默改状态 | `user_version = 4` (16 表) | **139 / 139** |
| **v0.3.0** | **Stage 5 & B-002/003** | 多源元数据检索与封面同源代理缓存、季度新番导览初版、HTML5 Canvas 年度总结海报与九宫格喜好表导出 | `user_version = 2` (9 表) | **92 / 92** |
| **v0.1.0 – v0.2.0** | **Stages 0–4** | 零第三方依赖 Node.js (`node:sqlite` + `node:http`) 核心架构落地、作品 CRUD、状态流转、软归档、分集 `+1/-1` 缺口推进、按首次观看日期的年度/季度/月度统计 | `user_version = 2` (9 表) | **89 / 89** |

---

## 各版本详细改动记录

### [v0.8.0] - 2026-10-25 · Stage 16：新番封面三级容错、新番详情预览抽屉、显式批量选择模式与桌面无黑框独立窗口启动器

#### 1. 背景与解决的问题
- **问题 1（新番导览几乎无封面）**：此前 `server/services/coverService.js` 的图床安全白名单仅放行了 `lain.bgm.tv` 与 B 站图床，导致弹弹Play封面图床（`*.dandanplay.net`）、Bangumi v0 官方封面重定向接口（`api.bgm.tv/v0/subjects/{id}/image`）以及 `//lain.bgm.tv` 协议相对地址被 `/api/cover` 拒绝（返回 400）；同时部分条目在 Bangumi 搜索接口中缺少 `images` 字段或 `/r/400/` 动态缩略图节点超时。
- **问题 2（点击新番卡片无法查看作品详情）**：此前在新番导览中点击未入库卡片直接触发勾选，无法查看该番剧的完整剧情简介、分集列表、原名、开播日期与外部资源链接。
- **问题 3（缺少显式的「批量选择」按钮）**：用户希望默认点击卡片看详情，需要批量入库时通过专门的「批量选择」按钮开启多选模式。
- **问题 4（每次通过 `.bat` 启动都会弹出并常驻命令行黑框）**：希望提供更贴近日常桌面软件的无黑框、独立窗口启动体验。

#### 2. 具体改动内容
- **封面加载全链路修复 (`server/services/coverService.js`, `server/providers/bangumi.js`, `web/app.js`)**：
  1. 扩展图床白名单支持 `img.dandanplay.net`、`*.dandanplay.net`、`*.dandanplay.com`、`bgm.tv`、`*.bgm.tv`、`*.chii.in` 等域名，并新增 `normalizeCoverUrl` 自动补全 `//` 协议头。
  2. 在 `bangumi.js` 的 `pickCover` 中增加 `api.bgm.tv/v0/subjects/{id}/image?type=common` 兜底地址。
  3. 后端 `fetchCover` 增加**三级自动回退**：当 `/r/400/` 缩放图失败时自动回退至原图 URL；当代理端口不通时自动回退至本机直连拉取。
  4. 前端 `paintCover` 增加 `onerror` 自动降级链：`/api/cover` 代理地址 → `no-referrer` 远程缩略图 → `no-referrer` 远程原图。
- **新番导览「作品详情预览」抽屉 (`web/app.js` - `openSeasonalItemDetail`)**：
  1. 在新番导览（含按季度目录与每日放送周历）中，默认点击任意未入库番剧卡片（或卡片底部的「详情」按钮）即滑出右侧详情预览抽屉；若作品已在库中则直接打开账本详情抽屉。
  2. 打开预览抽屉时自动异步调用 `GET /api/external/:source/:id` 补全高清封面、中日文原名、开播日、每周放送日、总集数、评分、分类标签、完整剧情简介、分集标题列表以及蜜柑计划/动漫花园/Bangumi 原站快捷链接。
  3. 抽屉顶部内置「`+ 加入「在看」`」「`+ 加入「想看」`」「`+ 加入「已看完」`」按钮，入库后无缝切换为个人账本集数管理面板。
- **新番导览显式「批量选择」模式 (`web/app.js` - `state.seasonalBatchMode`)**：
  1. 新番导览工具栏右侧新增 **「批量选择」** 开关按钮。
  2. 开启后卡片右上角显示勾选徽章，点击卡片进行多选/取消勾选，并展开「全选本页未入库」「加入「想看」(N)」「加入「在看」(N)」及「退出批量选择」按钮；批量提交成功后自动退出批量选择模式。
- **Windows 无黑框独立桌面窗口启动器 (`次元刻度(桌面无黑框模式).vbs`, `创建桌面快捷方式.vbs`, `停止后台服务.bat`, `server/index.js`, `server/http.js`)**：
  1. `server/index.js` 新增 `--app-window` 参数支持，优先调用 `msedge --app="http://127.0.0.1:7345"`（或 Chrome `--app`）以无地址栏、无标签栏的独立桌面软件窗口启动。
  2. 新增 `次元刻度(桌面无黑框模式).vbs`（采用 UTF-16LE BOM 编码确保中文 Windows WScript 100% 兼容）：使用 `WindowStyle = 0` 完全隐藏命令行黑框后台运行；若检测到 `7345` 端口已在运行，则直接秒开独立桌面窗口，不重复启动进程。
  3. 新增 `创建桌面快捷方式.vbs`：双击一次即可在 Windows 桌面生成「次元刻度」快捷方式图标。
  4. 新增 `POST /api/shutdown` 接口、设置面板左下角「**退出后台服务**」按钮与 `停止后台服务.bat` 脚本，方便随时安全关闭后台进程。

#### 3. 关键改动文件
- `server/services/coverService.js`
- `server/providers/bangumi.js`
- `server/index.js`
- `server/http.js`
- `web/app.js`
- `次元刻度(桌面无黑框模式).vbs`、`创建桌面快捷方式.vbs`、`停止后台服务.bat`
- `tests/seasonal_and_media.test.js`

---

### [v0.7.0 – v0.7.1] - 2026-10-25 · Stage 15：移除 AniList 外文源、未放送/占位空壳词条精准过滤、Bangumi 4页全量拉取与双源深度去重

#### 1. 背景与解决的问题
- **问题 1（季度目录混入当季未放送番剧）**：部分站点在番剧开播前数月甚至一年就先行创建了词条（或将未定日期暂填为 `01-01 / 04-01 / 07-01 / 10-01`），且旧版逻辑无条件将内置兜底目录（含 2026 续作预告占位项）追加到在线结果中，导致当季目录出现未放送番剧。
- **问题 2（AniList 外文标题导致重复卡片）**：AniList 返回纯罗马音/英文标题，极易与 Bangumi 的中文词条重复展示。
- **问题 3（单看 Bangumi 季度数据不全 & 跨源重名）**：Bangumi 原先仅拉取 2 页（100 条），且与弹弹Play合并时因繁简字体、季度后缀（`第二季` vs `第2期`）差异导致同番重复。
- **问题 4（`v0.7.1` 启动器修复）**：移除批处理 `if (...)` 括号块内嵌套的 `node -e` 自动下载逻辑，解决已安装 Node.js 用户的 `.bat` 闪退问题。

#### 2. 具体改动内容
- **移除 `anilist` 数据源 (`server/config.js`, `server/services/searchService.js`, `server/services/seasonalService.js`, `web/app.js`, `web/index.html`)**：
  - 将默认启用源收敛为 `['dandanplay', 'bangumi']`，自动清洗存量 `config.json` 中的 `anilist` 项；数据库 `external_ids` 表保留历史枚举兼容。
- **未放送与占位空壳词条核验器 (`server/providers/bangumi.js` - `inspectBangumiBroadcastState`)**：
  - 自动拦截开播日期晚于今日（`airDate > todayIso`）的未来词条，并将 Bangumi 搜索的 `air_date` 上限截断至今日。
  - 自动拦截开播日填为 `01-01 / 04-01 / 07-01 / 10-01` 且 `0 集 + 0 评分` 的提前建档占位空壳词条。
  - 自动拦截 `PV / CM / MV / 宣传片` 及 `放送時期未定 / 制作决定` 空壳词条。
  - 修复 `seasonalService.js`：仅当在线源全部失败（`collected.length === 0`）时才启用离线兜底目录，且新番导览新增「**仅看已开播正片（默认）/ 含未开播预告**」筛选开关。
- **Bangumi 4 页并发拉取 + 当季周历补全 (`server/providers/bangumi.js`, `server/services/seasonalService.js`)**：
  - 将 Bangumi 季度拉取扩展至最多 **4 页并发拉取（上限 200 部）**；若查询当前正在连载的季度，额外结合 `/calendar` 每日放送表交叉补全。
- **Bangumi + 弹弹Play 跨源深度去重与双源 ID 绑定 (`buildAnimeDedupKeys`, `mergeSeasonalItems`)**：
  - 内置日文汉字/港台繁体转简体字表（`JP2CN`）、季度后缀归一器（`第二季 / 第2季 / 第2期 / Season 2 / 2nd Season / S2 / Ⅱ` → `::s2`）及副标题破折号剥离器。
  - 合并时互补双方简介、集数、标签、评分与放送星期（`airDay`），批量入库时在 `external_ids` 表同步写入 `bangumi` 与 `dandanplay` 双源 ID。

---

### [v0.6.0] - 2026-10-25 · Stage 14：跨端时间戳感知双向云同步、移动端 PWA 与容器化部署准备

#### 1. 具体改动内容
- **时间戳感知双向合并同步 (`POST /api/sync` & `conflictStrategy: 'sync'`)**：
  - 在 `animeService.js` 的 `importLibraryData` 中新增 `'sync'` 策略：比较本地与远端的 `state.updated_at` 与 `anime.updated_at`，自动保留最新修改的追番状态、评分、收藏与备注；单集观看记录取并集（任意一端看过即点亮已看，并保留最早的 `first_watched_at`）；标签与别名取并集。
  - 在「设置 → 云端服务器接口配置」新增 **「⇄ 一键与云端双向同步 (Win本地 ↔ 云端)」** 按钮，让 Win 端既能保持连接本机（使用本地视频扫描与调用系统播放器），又能一键与云端/手机端互通进度。
- **可选云端访问口令守卫 (`ACCESS_TOKEN`)**：
  - `server/http.js` 支持通过环境变量 `ACCESS_TOKEN` 或 `config.json` 的 `accessToken` 开启 API 鉴权，前端支持配置并持久化 `X-Access-Token`。
- **移动端 PWA 支持 (`web/manifest.json`, `web/sw.js`, `web/icon.svg`)**：
  - 支持手机浏览器「添加到主屏幕」以独立全屏 App 形态运行，并針對手机触屏优化顶栏、抽屉宽度与卡片布局。
- **容器化配置文件 (`Dockerfile`, `docker-compose.yml`)**：
  - 提供基于 `node:22-alpine` 的零依赖轻量镜像配置，挂载 `/app/data` 持久化卷。

---

### [v0.5.0] - 2026-10-25 · Stage 13：弹弹Play 5 组配额守卫与熔断、季度评分排序、特别收藏与年度 365 天打卡热力图

#### 1. 具体改动内容
- **弹弹Play 5 大功能组配额守卫 (`server/providers/dandanplay.js`)**：
  - 严格对齐弹弹Play开放平台官方限额：搜索（日 100 / 月 2400）、番剧详情（日 200 / 月 4800）、获取弹幕（日 100 / 月 2400）、发送弹幕（日 10 / 月 240）、文件识别（日 200 / 月 4800）。
  - 实现持久化配额账本（`dandanplay-quota.json`）、多级响应缓存（搜索/季番 24h、详情 7 天、文件匹配 30 天）、**默认 90% 安全保护线自动熔断**与智能省流模式（优先调用免配额的 Bangumi）。
- **季度新番导览按评分排序 (`seasonalService.js`)**：
  - 支持 `default`（综合热度）、`score_desc`（评分高→低 ★）、`score_asc`（评分低→高）、`title_asc`（番名 A→Z）。
- **「★ 特别收藏」全链路筛选 (`animeService.js`, `web/app.js`)**：
  - 支持在卡片右上角、详情抽屉与主页批量管理中一键切换星标收藏，顶部导航栏新增独立的「★ 收藏」筛选标签页（`GET /api/anime?favorite=1`）。
- **年度 365 天追番打卡热力图 (`statsService.js`, `web/app.js`)**：
  - 统计页新增全年 53 周 × 7 天追番打卡热力矩阵（支持悬停查看每日观看集数与日期），并新增全年活跃打卡天数、最长连续追番天数（Max Streak）与全库作品完结率卡片。

---

### [v0.4.0] - 2026-10-25 · Stages 6–12 & P2 深度融合与架构合规修复

#### 1. 合规红线与遗留 Bug 修复
- **修复 SQLite 16 表全量物理备份与恢复 (`server/services/backupService.js`)**：
  - 修复 `verifyBackupFile` 对 `user_version = 4` 的校验支持；在 `restoreDatabaseBackup` 中补齐 `app_settings`、`anime_metadata_fields`、`resource_items`、`watch_events`，实现 **16 张表全量原子恢复**，恢复前自动创建 `pre-restore` 快照。
- **修复数据库迁移历史不可变红线 (`002_external_ids.sql` → `003` → `004`)**：
  - 保持 `002_external_ids.sql` 原始定义不变，在 `003_media_aliases_backup.sql` 中通过安全表重建扩展 `dandanplay` provider 约束，确保旧版 v2 数据库 100% 平滑升级至 v4。
- **严格落实 `D-002`（禁伪造 24 分钟默认时长）与 `FR-02`（禁静默篡改作品状态）**：
  - 移除批量入库、本地扫描同步与表单中的 `24` 分钟硬编码默认值，未知时长保持 `null`；卡片点击 `+1` 到最后一集时弹出应用内确认框询问是否标为「已看完」，详情抽屉提供一致性提示条而非后台静默改状态。

#### 2. Stages 6–12 & P2 核心业务能力落地
- **Stage 6–7 本地视频防踩坑扫描与安全播放器调用 (`server/services/mediaParser.js`)**：
  - 实现字幕组文件名清洗管线：拦截 `NCOP/NCED/PV/CM` 特典误判为第 1 集，保护 `86 -Eighty Six-` 等数字番名，过滤分辨率/编码/年份黑名单，支持剧场版负样本自动降权与跨季 `S02+` 待确认队列保护（`needs_review`）。
  - 支持常驻媒体根目录管理（`library_roots`）、同一集多分辨率版本关联（`media_files`）、文件移动自动重定位与文件缺失保留观看记录。
  - 通过参数数组安全调用系统默认播放器打开本地视频（绝不拼接 shell，且打开视频绝不自动标已看）。
- **Stage 8–12 & P2 进阶扩展**：
  - **多季度与 SP/OVA 管理**：支持开启任意季号、往前补加缺失季、删除误加季、添加不计入正片分母的 SP/OVA 特别篇、同步单集标题（保留手写标题）。
  - **手工编辑字段锁 (`anime_metadata_fields`)**：手动修改标题/简介/封面后自动上锁，防止被外部源「补全资料」覆盖。
  - **资源发现中心与站内 RSS 字幕组分栏 (`resourceService.js`)**：支持自定义 `{keyword}` 外链跳转模板，以及拉取公开动漫 RSS 源并按字幕组自动分栏聚合与复制磁力链。
  - **弹弹Play本地视频指纹匹配 (`POST /api/media/dandan-match`)** 与 **账本主页批量管理 (`POST /api/anime/batch-action`)**。

---

### [v0.1.0 – v0.3.0] - 2026-10-24 · Stages 0–5：零依赖核心底座、分集进度、观看统计与海报生成

- **Stage 0–1**：确立纯 Node.js 22+ 原生 `node:sqlite` + `node:http` + 原生 ESM 前端的零第三方依赖底座，建立带事务保护的自动迁移机制与核心仓储层。
- **Stage 2–3**：实现番剧增删改查、五种状态流转（想看/在看/已看完/暂停/弃番）、1–10 分评价、标签管理、软归档与恢复、分集 `+1/-1` 缺口优先推进、区间批量补记与首次观看日期修正。
- **Stage 4–5 & B-002**：实现按 `first_watched_at` 归类的年度/季度/月度统计报表、未知时长诚实披露、封面同源代理缓存（`/api/cover`），以及纯前端 Canvas 年度总结海报与九宫格生涯喜好表生成。
