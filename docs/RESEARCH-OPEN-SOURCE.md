# RESEARCH-OPEN-SOURCE.md — Selenyx 架构调研与对照

> 这是「Selenyx 为什么要这样造」的事实底座。每一项都引自 2026-07 的公开 GitHub 数据与项目官方文档，
> 不靠记忆，不靠推论。星标是「体量」指标，不是「质量」指标——文档真正讨论的是这些项目教会了我们什么，
> 以及 Selenyx 把哪些学到的做成默认能力、哪些明确选择不做。

## 一、调研范围与方法

- 来源：GitHub 官方排行（harnesses.sh、mapleferry/Github-Ranking-AI、awesome-ai-agents-frameworks）、
  2026-07 主流 Agent 框架对比文章、Claude Agent SDK / LangGraph / OpenAI Agents SDK / smolagents
  官方文档；星标数据截止 2026-07-24。
- 入选门槛：单一仓库 ≥ 10万 star，或 star 较低但对科研 Agent 架构有直接启发。
- 量化：共深度调研 23 个项目，覆盖 Agent 框架、桌面壳、本地模型、研究专用工具、RAG 基建五类。

## 二、Agent 框架与 Harness（Selenyx 直接对位）

| 项目 | Star (2026-07) | 核心架构 | Selenyx 抄 / 不抄 / 改 |
|---|---|---|---|
| **OpenClaw** (openclaw) | 383,767 | TypeScript · 跨平台 personal assistant · 20+ 消息渠道 · SKILL.md 技能 · Docker 沙箱 | **不抄**：不绑死任一平台；**学**：用 SKILL.md 这种「人类可读」格式来描述技能，零锁死。Selenyx 的技能是 JS 模块，但入口注释遵循同一种 README 风格 |
| **Hermes Agent** (NousResearch) | 219,619 | Python · 跨会话持久记忆 · 自主技能创建（agentskills.io）· DSPy/GEPA 进化自优化 | **抄**：「越用越了解你」的本地记忆 + 「harness / loop」结构。**改**：把 DSPy 这类重框架换成更轻的"事件折叠"画像；学习材料里的子代理循环我们做最多 10 个，按月相分阶 |
| **Claude Code** (Anthropic) | 136,750 | 终端 agent · CLAUDE.md 记忆 · Agent Skills · subagents · hooks · plugins · MCP | **抄**：MCP 风格的能力描述、子代理结构、plan/permission 模式。**改**：我们不绑 Claude，可插 Kimi/GPT/Claude/DeepSeek/Qwen/Gemma |
| **OpenCode** (Anomaly) | 188,403 | TypeScript TUI · 75+ 提供商 · LSP 反馈 · Tab 切换 build/plan 智能体 · SKILL.md | **学**：多模型 provider 即插即用、plan 模式独立 Tab。Selenyx 状态栏的模型快速切换与之一致 |
| **AutoGPT** (Significant-Gravitas) | 185,662 | 「思考-计划-行动」循环 · 持久记忆 · 模块化工具链 | **学**：plan-then-execute 思想。**改**：AutoGPT 容易跑飞，Selenyx 强制可中断的 checkpoint + 学者画像的方向感 |
| **LangChain** | 142,472 | 模块化「链」式 + LangGraph 图编排 + 100+ 集成 | **不抄**主包，**学**思想：链式组合 + checkpoint + LangGraph 的「状态即单一真源」。Selenyx 的引擎就是把这些思想用极简 Node.js 重写 |
| **LangGraph** | 36,751 | 节点-边图 · 持久执行 · checkpoint · Human-in-the-loop · v1.2 加入 typed streaming 与分布式运行时 | **抄**核心：state machine、不可变节点更新、reducer。**改**：我们用纯 JS Map + 事件流，不上 BSP/Pregel（科研场景用不到那层复杂度） |
| **OpenAI Agents SDK** | ~80k | OpenAI 官方 · handoff · WebSearchTool · session 持久化 | **学**：handoff 模式用于"满月-综述 agent → 新月-写作 agent"的接力。**不抄**：锁定 GPT，违背 Selenyx 多模型原则 |
| **Dify** | 150,034 | TypeScript · BaaS + LLMOps · 拖拽式工作流 · RAG 引擎 · 多模态 | **学**：LLMOps 思路（模型管理 / Prompt 版本控制 / 行为分析）。**不抄**：可视化拖拽。Selenyx 默认研究场景多在 CLI/对话流，不需要拖拽 |
| **browser-use** | 103,000 | Python · LLM 驱动真实 Chrome · DOM + 视觉双通道 | **抄**：Selenyx 内置浏览器复刻了「一边 agent 工作一边人刷剧」的场景，UI 与代理完全隔离 |
| **n8n** | 197,408 | 工作流自动化 · 自托管 · 公平代码 | **不直接相关**，但「自托管 + 离线可用」的方向与 Selenyx 一致 |
| **smolagents** | 28,242 | ~1000 行核心 · 让模型写 Python 而不是 JSON 工具调用 | **学**：核心代码量 < 2000 行的硬约束精神。Selenyx 核心（不含 skill）也是这个量级 |
| **GPT Researcher** | 28,100 | planner/executor 多 agent · 并行检索 + 递归深度研究 · MCP 数据源 | **抄**：planner/executor + 引用产出。**改**：Selenyx 是"研究助手"而不是"自动出报告"——每一步都留给人改 |
| **OpenHands** (All Hands AI) | 81,899 | Docker 沙箱软件工程 agent · 72% SWE-bench | **学**：Docker 沙箱保证不会把用户机器搞坏。**改**：Selenyx 不做自动 PR，只做本地副驾驶 |

## 三、本地模型与基建

| 项目 | Star | 用途 | Selenyx 怎么用 |
|---|---|---|---|
| **ollama** | 176,757 | 本地 LLM 一行命令 | 默认后端之一——`Selenyx settings → model: gemma-3:9b-local` |
| **transformers** (Hugging Face) | 162,632 | 模型定义框架 | 离线 summarize/humanize 备选后端 |
| **vllm** | 86,352 | 高吞吐推理引擎 | 高性能备选 |
| **open-webui** | 146,536 | 友好的本地 AI 聊天界面 | UI 参考对象，但 Selenyx 主线是研究而不是聊天 |
| **firecrawl** | 151,559 | 网页抓取/浏览器交互 API | Selenyx 联网检索的备选源 |
| **markitdown** | 168,636 | 文件→Markdown 转换 | Selenyx 论文预处理的默认入口 |
| **tensorflow** | 196,362 | 基础 ML 框架 | 备选 |
| **pytorch** | 101,837 | 动态图深度学习 | 备选 |

## 四、桌面壳选型（与研究场景直接对位）

| 方案 | Star | 优势 | 劣势 | Selenyx 选择 |
|---|---|---|---|---|
| **electron** | 117,000+ | WebContentsView 天然内置浏览器；Chromium 自带 PDF 渲染；Selenyx 核心是纯 Node.js 零语言边界 | 包体 150-200MB，内存 300-500MB | **采用** |
| **tauri** | 87,000+ | 包体 15-50MB，内存 80-120MB | 需要 Rust 桥，重写技能层；研究场景用 WebContentsView 内置浏览器、Chromium PDF 渲染是刚需，tauri 做不到同等开箱体验 | 不采用 |
| **flutter** | 169,000+ | 跨平台 UI、Skia 渲染 | 桌面 widget 与 Web 内容（PDF.js、MathJax、ECharts）桥接成本高，不适合「一边看论文一边开 ChatGPT」 | 不采用 |
| **web 端** | — | 零安装 | 科研数据是敏感的（未发表数据 / 知情同意书 / 伦理材料），不能上云 | 不采用 |

判断核心：Selenyx 的「读文献 + 内置浏览器 + 翻译/总结/AIGC 检测/降重/查重」这一长链路，离不开 WebContentsView + Chromium + Web 生态。把这条线复刻到 Tauri 要付出的代价大于 Electron 的 200MB 包体。

## 五、UI 布局参考

- **Hermes Desktop** 的左侧栏（新建对话 / 技能与工具 / 消息平台 / 产物 / 历史会话）+ 右侧产物面板
  + 状态栏，是 Selenyx Desktop 视觉原型的直接范本。
- **小绿鲸**（非开源，商业科研阅读器）的五色批注语义：红=关键/风险、黄=重点、绿=可借鉴、蓝=待查证、紫=与我相关。
  Selenyx 把这套语义做成内置的 `annotate` 技能，每条批注可导出 Markdown 进笔记。
- **Zotero** 的 PDF 注释模型（按 pageLabel + seq 排序，导出笔记）与 Selenyx 的 `AnnotationStore.sortIndex` 同构。
- **Claude / ChatGPT** 的"composer 底部 + 中央对话"三段式，作为 Chat 模式参考。

## 六、22 个 star < 10万 但极有启发的项目

仅作记录：rasbt/LLMs-from-scratch (99k)、Graphify-Labs/graphify (87k)、thedotmack/claude-mem (87k)、
lobehub (80k)、OpenHands (80k)、smolagents (28k)、GPT Researcher (28k)、SuperAGI (17k)、OpenJarvis (7k)、
Letta/MemGPT（AI 记忆层）、pi-mono（极简 harness 范式）、browser-use 桌面应用、OpenWebUI、Continue、
Void、Zed Agent Panel、dibis comparison、hkuds/DeepTutor（AI 教育）、moeru-ai/airi、Nutlope/hallmark（反 AI 化设计）、BrowserOS、CrewAI (54k)。

## 七、Selenyx 的「明确不做」

为了让这份文档不只说"我们抄了什么"，同样要交代我们**不抄**的：

1. **不绑死模型 / 平台 / 提供商**：OpenClaw/Hermes/AutoGPT 都有"默认模型"偏好；Selenyx 状态栏的模型切换随时能改。
2. **不绑死云**：Dify/OpenHands 的部署多走云；Selenyx 默认本地网关、引擎全部在你机器上。
3. **不做完全自动的科研产出**：GPT Researcher/OpenHands 会自动出报告；Selenyx 是"副驾驶"，每一步留给你改。
4. **不做"反 AI 化"的形式主义**：Nutlope/hallmark 强调反 AI slop 的设计纪律；Selenyx 的月相主题是为了给科研场景提供安静、可记忆的视觉锚点，不是为了反 AI。
5. **不抢人做决定**：所有技能在 L1（离线确定性算法）阶段可独立运行，不强行接 LLM；接 LLM 时也硬约束"只依据原文 / 不改事实 / 保留引用"。

## 八、给读这份文档的人

如果你正在做自己的 Agent 项目：

- **先看 LangGraph 的「状态机 + checkpoint + interrupt」**——这是 2026 年最稳的工程范式，比 ReAct 更可控。
- **再抄 Hermes 的「harness + loop + skills」分层**——结构简单到一页纸能画完。
- **桌面壳选 Electron 不要犹豫**——如果你的产品需要内置浏览器、看 PDF、看视频。
- **UI 直接抄 Hermes Desktop**——没必要重新发明三栏。
- **不要在 2026 年重新做"模型本身"**——接 Ollama / vllm / 云 API，把精力放在场景化技能上。

`最后更新：2026-07-26 · Selenyx 维护`
