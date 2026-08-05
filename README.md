# Selenyx 科研工作台

> 本地优先、BYOK、八段科研流水线 — 面向护理科研的端到端工作台

**Selenyx** 是一个本地优先（local-first）的科研工作台，将文献管理、PDF 标注、证据综合、统计分析和论文写作整合到一个可停靠的工作区中。你的数据永远留在你的机器上，除非你明确选择导出。

## 技术架构

Selenyx 采用 **多语言架构**（经 GitHub 同类开源项目调研验证）：

| 层 | 技术栈 | 语言 |
|---|---|---|
| **前端** | React 19 + TypeScript + Vite + Zustand | TypeScript |
| **后端** | FastAPI + SQLModel + async SQLite + Alembic | Python |
| **桌面** | Tauri v2（Windows / macOS / Linux） | Rust |
| **移动** | Tauri v2 Mobile（Android / iOS） | Rust |
| **扩展** | Chrome MV3（浏览器剪藏） | TypeScript |
| **存储** | per-project SQLite + 可读文件 | — |

### 为什么选这个架构

基于 GitHub 深度调研（60+ 同类开源项目），现代科研工作台收敛于 **TypeScript 前端 + Python 后端 + Tauri/Electron 桌面壳** 的多语言架构：

- **HydraLab**（github.com/M1Vj/HydraLab）— 与 Selenyx 愿景几乎同构的本地优先科研工作台，采用 React 19 + TypeScript + Python FastAPI + Tauri v2，已生产验证
- **Zettlr** — TypeScript/Electron，模块化架构，Pandoc 20+ 格式导出
- **Paperlib** — TypeScript，轻量文献管理器
- **openSCIs** — Next.js 15 + TypeScript + Prisma + SQLite
- **Perspicacité** — FastAPI + Next.js，6 种 RAG 模式

**纯 Java/JavaFX 在现代科研工具开源生态几乎缺席**（60+ 仓库中无一个使用）。

### 为什么不用单一语言

| 需求 | 最优语言 | 理由 |
|---|---|---|
| UI 交互 / 文献表格 / PDF.js / CodeMirror | TypeScript | React 生态 + 类型安全 + 现有 17k 行 JS 代码可增量迁移 |
| 学术 API 检索 / LLM 编排 / 统计计算 / PDF 解析 | Python | httpx 异步 + 学术库生态（scholarly, pymupdf, scipy）+ LLM SDK |
| 桌面壳 / 移动壳 / 文件系统 / keychain | Rust (Tauri) | 轻量（<10MB）+ 跨平台 + 原生能力 + 安全模型 |

## 八段科研流水线

```
① 问题 → ② 文献 → ③ 全文 → ④ 筛选 → ⑤ 精读 → ⑥ 证据 → ⑦ 综合 → ⑧ 写作
 PICO     检索     PDF入库   纳排标准   深度阅读   GRADE分级   推理链     论文+投稿
```

每阶段有明确的**入口条件 → 产出物 → 质检门**，构成可追溯的科研工作流。

## 功能矩阵

### 文献管理（Zotero 式）
- 30 种文献类型 × 57 字段
- BibTeX / RIS / CSV / CSL-JSON 导入导出
- DOI / PMID / arXiv 在线检索（Crossref / PubMed / OpenAlex）
- 三策略去重（DOI / PMID / 标题+年份）
- 加权搜索（标题×10 / DOI×6 / 作者×5 / 期刊×4 / 摘要×2）
- APA7 / Vancouver / GB-T7714 / AMA 四种引用格式

### 科研流水线
- PICO 结构化问题
- SBAR 课题管理
- 八段流水线阶段推进 + 质检门
- PRISMA 流程图

### 统计工具
- Z / t / χ² / F 分布表
- p 值计算器
- 70+ 统计方法库（含 R / Python / SPSS 代码示例）
- GRADE 证据分级
- CONSORT / STROBE / CASP / RoB 2.0 / NOS / AMSTAR 2 / JBI / PRISMA 2020 质量评价清单

### 临床数据
- NANDA-I 护理诊断（254 条 × 13 领域）
- 实验室检验值（110+ 项 × 15 分类，含危急值/护理要点/干扰因素）
- 护理科研术语表（383 条，中英对照）
- 期刊信息库（含影响因子/分区/版面费/审稿周期）

### AI 能力（BYOK）
- 支持 OpenAI / OpenRouter / Anthropic / Google / Ollama / 自定义端点
- Extractive retrieval（不编造引用，带页码/字符偏移定位）
- Agent 研究配方（文献综述 / 论文批评 / 想法生成 / 数据提取 / 质量评价）
- 审批门控 + append-only 审计日志
- MCP 工具支持（HTTP transport）
- 知识图谱（notes / sources / claims / tasks 关联）

### 多维表格
- 表格 / 看板 / 画廊 / 时间线 / 日历 五种视图
- 自定义字段（11 种类型）
- 筛选 / 排序 / 分组 / 公式

### 跨平台
- 桌面：Windows / macOS / Linux（Tauri v2）
- 移动：Android / iOS（Tauri v2 Mobile）
- Web：任意浏览器（Vite dev server）

## 项目结构

```
selenyx-next/
├── frontend/          # TypeScript + React 19 + Vite
│   └── src/
│       ├── types/     # 核心数据模型（前后端共享契约）
│       ├── stores/    # Zustand 状态管理
│       ├── services/  # API 服务层
│       ├── components/ # UI 组件
│       │   ├── layout/
│       │   └── views/  # 8 个主视图
│       ├── hooks/     # 自定义 Hooks
│       └── styles/    # 三主题 × 昼夜双模式 CSS
├── backend/           # Python + FastAPI + SQLModel
│   └── selenyx_backend/
│       ├── models/    # SQLModel 数据模型
│       ├── routers/   # API 路由（6 个域）
│       ├── services/  # 业务逻辑
│       └── data/      # 静态数据集
├── desktop/           # Tauri v2 桌面/移动壳 (Rust)
│   └── src/
│       ├── main.rs    # 入口
│       └── lib.rs     # 应用逻辑
├── shared/            # 共享类型/协议
└── docs/              # 文档
```

## 快速开始

### 前提条件
- Node.js ≥ 20 + pnpm ≥ 9
- Python ≥ 3.11 + uv
- Rust ≥ 1.77（桌面端可选）

### 开发模式

```bash
# 前端
pnpm install
pnpm dev          # http://127.0.0.1:5173

# 后端
cd backend
uv sync
uv run uvicorn selenyx_backend.main:app --reload --port 8770

# 桌面端（可选）
cd desktop
cargo tauri dev
```

## 隐私

Selenyx 将隐私视为架构属性，而非设置项：
- **本地优先**：所有数据存储在你的机器上
- **BYOK**：API 密钥仅存储在 OS keychain，永不上传
- **不编造**：extractive retrieval 引用原文段落，带精确定位
- **无遥测**：Selenyx 不发送任何关于你、你的项目或使用方式的数据

## License

MIT

---

*Selenyx = Selene（月神，学术之光）+ Nyx（夜神，深思之境）*
