<div align="center">

# Selenyx 科研工作台

**本地优先的证据链 AI 科研助手 —— AI 干活，人签字**

展翼丹顶鹤为记 —— 安静、专注、行稳致远。

`v0.03` &nbsp;·&nbsp; `React + TypeScript + Vite` &nbsp;·&nbsp; `Tauri 2 (Rust)` &nbsp;·&nbsp; `FastAPI + SQLite`

![新对话主页](docs/screenshots/v4/home.png)

</div>

---

## 这是什么

Selenyx 把科研工作流收进**一个完全在你本机运行**的工作区：AI 对话与 agent 任务、研究项目与八段流水线、文献管理与 PDF 阅读批注、证据卡裁决、统计工具、自动化。数据存于本机 SQLite 与本地存储——**不注册、不上云、离线可用**。

与一众"自动成稿"的科研 AI 不同，Selenyx 交付的不是一份报告，而是**一条证据链**：agent 负责跑断腿（检索/提取/起草/自批评），人负责落锤（接受/驳回证据）。**可信不是功能，是架构。**

> 功能真实性、原文可追溯、人工证据门，优先于装饰与功能数量。

## 签名功能

- **证据门即灵魂**：agent 写证据只能进「待裁决」；成稿 `[^e:id]` 标记经后端真实性校验——编造引用、跨项目引用、未接受证据一律打回，二次不过即 run 失败，没有"按无据放行"。
- **导出强制证据附录**：写笔记 / 导出成稿由后端权威生成「证据附录」（每条引用 → 证据卡 + 裁决 + 时间）；agent 自写的附录段整体替换，伪造不了出处。
- **成稿证据染色**：逐句标注支撑——🟩 已接受证据 / 🟨 候选 / 🟥 无据断言；头部覆盖率徽标量化可信度。
- **证据卡回跳 PDF 原文页**：裁决队列里一点，PDF 阅读器直接翻到证据所在页；同一 claim 的支持/反驳证据**并排对照**。
- **可重放的 run**：计划 → 每次工具调用 → 每次观察 → 批评意见 → 修订稿，全程留痕。
- **仙鹤伙伴**：桌面桌宠（趴主窗上沿），任务完成飞来报喜；有待裁决证据时头顶黄点静立；点它答「今天做了什么」。

## 界面

| 新对话（提交即进这场对话） | 项目（流水线 + 倒数日项目卡） |
|---|---|
| ![新对话](docs/screenshots/v4/home.png) | ![项目](docs/screenshots/v4/projects.png) |

| 知识库 · 文献 | 知识库 · 证据卡（J/K 裁决，矛盾并排） |
|---|---|
| ![文献库](docs/screenshots/v4/library.png) | ![证据卡](docs/screenshots/v4/evidence.png) |

| 工具（表格 · 图片文件 · 统计） | 自动化（cron + 退避重试） |
|---|---|
| ![工具](docs/screenshots/v4/tools.png) | ![自动化](docs/screenshots/v4/automations.png) |

| 专家·技能·连接器（三合一） | 设置弹窗（Ctrl+,，9 分区） |
|---|---|
| ![专家技能连接器](docs/screenshots/v4/extensions.png) | ![设置](docs/screenshots/v4/settings.png) |

侧栏六项定版：**新对话 → 项目 → 工具 → 自动化 → 知识库 → 专家·技能·连接器**。没有独立「助理」页——提交任务后同一工作壳直接进入这场对话。

默认**墨白**黑白极简主题（仅新装）；另有纸间豆绿、瑞士蓝、墨岩·新粗野，均支持日夜切换与三档密度——同一份 DOM，只换设计令牌，不重排信息架构。排印走 8pt 网格与固定字阶（11/12/13.5/16/20/26/32），动效 ≤300ms 且尊重 `prefers-reduced-motion`。

## 功能特性

- **Agent 任务**：研究目标交给本机 agent 自循环（规划 → 检索 → 执行 → 成稿）；SSE 流式步骤、运行中插话（steer）、计划先确认、秒级取消；可选「成稿前批评审查」。
- **token 预算硬闸**：`SELENYX_LLM_TOKEN_BUDGET` 给单次 run 设 token 上限，超闸即中止落审计，不会一次跑爆额度（默认 0 不限）。
- **专家流水线**：综述流水线 recipe（综述员起草 → 批评员审 → 修订 → 证据染色成稿）；内置 4 位专家人格，可单独对话，可被 agent 委托为子代理。
- **技能与记忆**：SKILL.md 技能包（`/技能名` 调用，注入指令并裁剪工具白名单）；全局 + 项目两层记忆，run 启动注入、结尾沉淀，永不外发。
- **文献库**：DOI / PMID / arXiv / BibTeX / RIS / CSL JSON 导入，本机 Zotero 只读导入（候选预览 → 去重 → 确认），重复项**合并**而非删除；zotero 风格引用键；PDF 阅读批注。
- **本地 RAG**：结构化解析（保留页码/偏移）→ 稀疏 + 稠密混合检索 → 重排 → 人工证据门；SQLite WAL + 外键加固；解析失败保留原文件并显示原因。
- **学术连接器**：OpenAlex / Crossref / PubMed / arXiv 真实探测（超时 + 缓存，诚实空结果，绝不编造）。
- **MCP 接入**：添加 stdio / SSE MCP server（最小客户端 initialize/tools-list/tools-call），工具以 `mcp:` 前缀进 agent 白名单；SSRF 防护（拒绝环回/私网/任意 header/重定向）。
- **自动化 2.0**：cron 表达式（零依赖自研解析）、失败指数退避重试 ×3、停机错过补偿（可关）、运行历史可跳任务详情。
- **工作区备份**：导出/导入 JSON 为非破坏合并——同 id 记录以本机为准，导入只补缺，不回滚本地工作。
- **统计工具 / 全学科资料 / 工具箱**：名词、数值、公式、标准规范均标注来源与适用范围。

## 安装

### 下载安装包（推荐）

到 [**Releases**](https://github.com/pyrelio88-afk/Selenyx/releases) 下载：

| 平台 | 文件 |
|---|---|
| Windows | `Selenyx_…_x64-setup.exe`（NSIS）/ `…_x64_en-US.msi` |
| macOS | `Selenyx_…_aarch64.dmg` |
| Linux | `.deb` / `.rpm` / `.AppImage` |

标准安装包**不含** AI 模型与大型离线安装器；OCR / 嵌入 / 重排模型按需单独安装、显示大小与许可证、可卸载，模型缺失不影响文献、笔记、统计与项目管理。

### 从源码运行

前置：Node ≥ 20、Python（[uv](https://docs.astral.sh/uv/)）；桌面构建另需 Rust。

```powershell
npm install
npm run dev:local   # 同时启动前端 + 本地后端（/api 代理）
```

仅前端（无 RAG/学术网关）：`npm run dev`。桌面应用：`npm run desktop:build`（含本机 FastAPI sidecar 打包，详见 [BUILD.md](BUILD.md)）。

### 配置 AI（BYOK）

设置弹窗（`Ctrl+,`）→ 模型：填入你的 OpenAI / OpenRouter / Anthropic / Google / 本地 Ollama 的 Key 与模型名。Key 只存本机，永不进可分发产物。

## 使用示例

**做一次可信综述**

1. 新对话主页点「文献综述」模板卡（自动挂载综述流水线）→「交给 Selenyx」
2. 同一对话壳内：计划确认 → 流式观看综述员起草、批评员审查、修订
3. 知识库 · 证据卡：J/K 批掉待裁决队列（矛盾证据并排对照，可回跳 PDF 原文页）
4. 成稿按句染色 + 头部覆盖率徽标 → 一键写入笔记 / 下载 .md（自动附后端权威证据附录）

**无人值守每日动态**

自动化 → 新建：cron `0 8 * * *` + 任务描述 → 到点自动跑，失败 1/2/4 分钟退避重试；运行历史可跳每次详情。

**接入你的 MCP 工具**

专家·技能·连接器 → 连接器 → 添加 MCP server（stdio 填可执行绝对路径 + 参数；SSE 填公网 URL）→ 探测 → agent 即可调用 `mcp:` 前缀工具。

## 验证

```powershell
npm run typecheck    # TypeScript
npm run lint         # ESLint
npm test             # 前端单元测试（192）
npm run backend:test # 后端 pytest（132）
npm run verify:local # 本地优先整体验证
```

另有 24 项 UI 穿透断言（`node scripts/uitest-clickthrough.cjs`，需先起 dev:local）。

## 技术栈与架构

- **前端**：React + TypeScript + Vite（单文件构建）+ Zustand；三栏工作台骨架（对象目录 — 主工作区 — 证据检查器）
- **桌面**：Tauri 2（Rust）；仙鹤桌宠为透明置顶窗
- **后端**：FastAPI + SQLModel/SQLite 本地 sidecar（127.0.0.1:8770，BYOK 密钥网关，WAL + 外键）
- **PDF / OCR**：pdf.js + anydoc

架构细节见 [ARCHITECTURE.md](ARCHITECTURE.md)；构建与体积基线见 [BUILD.md](BUILD.md)；本地 RAG 见 [docs/LOCAL-RAG-EMBEDDINGS.md](docs/LOCAL-RAG-EMBEDDINGS.md)；信息架构见 [docs/IA.md](docs/IA.md)。

## License

MIT
