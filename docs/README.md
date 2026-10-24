# Windows 番剧管理软件：项目文档包

本文件夹是供 AI 编程助手按阶段实施的项目基线。建议先阅读 `PRD.md`，再阅读 `ARCHITECTURE.md`、`DATA_MODEL.md` 和 `ACCEPTANCE.md`，最后按 `AI_TASKS.md` 逐个任务实施。

## 文档目录

- `PRD.md`：产品目标、范围、用户流程、功能需求与非目标。
- `ARCHITECTURE.md`：推荐技术栈、模块边界、数据流、工程约定。
- `DATA_MODEL.md`：SQLite 核心表、字段建议、数据完整性与未来同步预留。
- `ACCEPTANCE.md`：可验证的验收标准与测试清单。
- `AI_TASKS.md`：适合 AI 编程助手逐阶段执行的任务书与提示词模板。
- `AGENT_RULES.md`：AI 编程助手的工作流程、禁止事项、调试重试上限和停止条件。
- `REFERENCE_RESEARCH.md`：PotatoVN 与 The-Order 的产品参考研究记录模板。

## 项目基线

- 平台：Windows 优先，第一阶段单机、本地优先。
- 技术栈：Tauri 2 + React + TypeScript + Vite + SQLite。
- 手机端、账号体系、云同步：不在当前版本实现。
- 本地视频：调用 Windows 默认关联播放器，不内置播放器。
- 观看统计：按已看集数与标准单集时长计算，不追踪实际播放时长。
- 观看记录：支持手动标记单集、多集和整季；首次观看日期与记录创建/修改时间分开。
- 外部元数据：Bangumi、AniList 等通过独立 Provider 接入；外部数据不能覆盖用户自己的观看状态、评分、标签、备注等。

## 使用规则

1. 开始任何编码任务前，先遵守 `AGENT_RULES.md`。
2. 一次只执行 `AI_TASKS.md` 中一个阶段。
3. 每个阶段完成后运行构建、测试和验收清单。
4. 未经用户确认，不要大规模改写已完成模块或引入新的框架。
4. 不要把临时数据、缓存数据或外部资料当成用户的个人数据。
5. 每完成一个阶段，更新 README、变更记录和测试结果，并建议创建 Git commit。
