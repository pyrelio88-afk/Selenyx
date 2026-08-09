<div align="center">

# Selenyx 科研工作台

**本地优先 · 三栏工作台 · 八段证据门科研流水线**

展翼丹顶鹤为记 —— 安静、专注、行稳致远。

`React + TypeScript + Vite` &nbsp;·&nbsp; `Tauri 2 (Rust)` &nbsp;·&nbsp; `FastAPI + SQLite`

</div>

---

## 这是什么

Selenyx 把科研工作流收进**一个完全在你本机运行**的工作区：文献管理、PDF 阅读与批注、研究项目与八段流水线、统计工具、全学科资料、AI 辅助。数据存于本机 SQLite 与浏览器本地存储——**不注册、不上云、离线可用**。

> 功能真实性、原文可追溯、人工证据门，优先于装饰与功能数量。

## 界面

| 总览（主线课题 + 证据健康 + 番茄钟） | 总览 · 内嵌 AI 助手（新建任务入口） |
|---|---|
| ![总览](docs/screenshots/v2/overview.png) | ![AI 助手](docs/screenshots/v2/overview-assistant.png) |

| 任务（agent 自循环：规划→执行→成稿） | 专家（角色化 subagent 人格） |
|---|---|
| ![任务](docs/screenshots/v2/tasks.png) | ![专家](docs/screenshots/v2/experts.png) |

| 文献库（检索 + 行内导出/删除） | 设置（主题 / 密度 / 仙鹤桌宠开关） |
|---|---|
| ![文献库](docs/screenshots/v2/references.png) | ![设置](docs/screenshots/v2/settings.png) |

默认**墨白**黑白极简主题（仅新装）；另有纸间豆绿、瑞士蓝、墨岩·新粗野，均支持日夜切换与三档密度——同一份 DOM，只换设计令牌，不重排信息架构。仙鹤桌宠在桌面端是透明置顶小窗（随机踱步/飞行），网页端降级为应用内右下角漂浮。

## 核心特性

- **三栏工作台**：适合研究的页面统一为「对象/目录 — 主工作区 — 上下文/证据检查器」。文献库、科研流水线、AI 助手、阅读笔记皆为三栏，可拖拽调宽、键盘可达（方向键）、宽度本地记忆。
- **八段证据门流水线**：立题 → 检索 → 评级 → 设计 → 数据 → 分析 → 写作 → 传播。每段有入口条件、质量门与人工确认；**只有人工接受的证据**才能进入写作与严格 AI 回答，引用可回跳原文。
- **文献库**：DOI / PMID / arXiv / BibTeX / RIS / CSL JSON 导入，本机 Zotero 只读导入（候选预览 → 去重 → 确认），重复项**合并**而非删除（保留标签/集合/笔记），PDF 阅读与批注，行内一键导出 / 删除。
- **本地 RAG**：结构化解析（保留页码/区域/字符偏移）→ 稀疏 + 稠密检索 → 重排 → 人工证据门；解析失败保留原文件并显示原因。
- **学术连接器**：OpenAlex / Crossref / PubMed / arXiv（限流 + 诚实空结果，绝不编造）。
- **AI 助手**：项目级会话隔离，BYOK / 本地后端网关；「仅依据已接受证据」开启后，无证据必拒答。
- **Agent 任务**：把研究目标交给本机 agent 自循环（规划 → 检索 → 执行 → 成稿），步骤全程落库可审计；可选「成稿前批评审查」；定时自动化（每日/间隔）驱动无人值守任务。
- **专家与连接器**：角色化专家人格（文献综述员/论文批评员/统计顾问/写作教练）可在对话启用、也可被 agent 委托为子代理；连接器页汇总本机能力状态。
- **统计工具 / 全学科资料 / 工具箱**：名词、数值、公式、标准规范均标注来源与适用范围。

## 下载安装包

| 平台 | 文件 |
|---|---|
| Windows | `Selenyx_…_x64-setup.exe`（NSIS）/ `Selenyx_…_x64_en-US.msi` |
| macOS | `Selenyx_…_aarch64.dmg` |
| Linux | `.deb` / `.rpm` / `.AppImage` |

到 [**Releases**](https://github.com/pyrelio88-afk/Selenyx/releases) 下载最新版。标准安装包**不含** AI 模型与大型离线安装器；OCR / 嵌入 / 重排 / 生成模型按需单独安装、显示大小与许可证、可卸载，模型缺失不影响文献、笔记、统计与项目管理。

## 快速开始（开发）

前置：Node ≥ 20、Python（[uv](https://docs.astral.sh/uv/)）、桌面构建需 Rust。

```powershell
npm install
npm run dev:local   # 同时启动前端 + 本地后端（/api 代理）
```

仅前端（无 RAG/学术网关）：`npm run dev`

桌面应用：`npm run desktop:build`（含本机 FastAPI sidecar 打包，详见 [BUILD.md](BUILD.md)）。

## 验证

```powershell
npm run typecheck    # TypeScript
npm run lint         # ESLint
npm test             # 前端单元测试
npm run backend:test # 后端 pytest
npm run verify:local # 本地优先整体验证
```

## 技术栈

- **前端**：React + TypeScript + Vite（单文件构建）+ Zustand
- **桌面**：Tauri 2（Rust）
- **后端**：FastAPI + SQLite（本地 sidecar）
- **PDF / OCR**：pdf.js + anydoc

## 文档

- 架构：[ARCHITECTURE.md](ARCHITECTURE.md)
- 构建：[BUILD.md](BUILD.md)
- 本地 RAG / 嵌入：[docs/LOCAL-RAG-EMBEDDINGS.md](docs/LOCAL-RAG-EMBEDDINGS.md)
- 需求账本：[docs/REQUIREMENTS-LEDGER.md](docs/REQUIREMENTS-LEDGER.md)

## License

MIT
