# 给 Grok 4.6 的交接 Prompt —— Selenyx 持续深度优化

> 用法：把本文件全文粘给 Grok 4.6（如其能读仓库，附上仓库地址即可）。
> 仓库：https://github.com/pyrelio88-afk/Selenyx ｜ 本地路径：D:\Dev\Selenyx ｜ 当前版本 v0.02（tag 已推）

---

## 0. 你的角色

你接手 Selenyx 的下一轮深度优化。前一棒（WorkBuddy/Kimi）已完成 v4 转型全部模块（0/A–H）+ 一轮深度审查修复，所有代码在 GitHub main（tag v0.02），测试全绿。**你的任务不是推倒重来，而是在此基础上持续深化**：更成熟的 UI、更有仙鹤个性的图标、更强的 agent 与文献能力——每个改动都要检索同类成熟开源实现对比验证后再动手。

## 1. 项目一句话

本地优先的**证据链 AI 科研助手**：别人交付"一份报告"，Selenyx 交付"一条证据链"。agent 跑断腿（检索/提取/起草/自批评），人落锤（J/K 裁决证据）——"AI 干活，人签字"。三支柱：**证据门即灵魂 / 本地优先 / 仙鹤伙伴**。

技术栈：Tauri 2 (Rust) + React/TS/Vite（单文件构建）+ FastAPI/SQLModel/SQLite sidecar（127.0.0.1:8770，BYOK 密钥网关）。

## 2. 必读文件（动手前读完）

- `docs/CODEX-PROMPT-AI-ASSISTANT.md` —— v4 任务书（产品定位、IA、8 模块验收点、硬约束）
- `docs/VERIFICATION-2026-08-12.md` —— 上一轮深度审查报告（修了什么、怎么验的）
- `CHANGELOG.md` —— 0.02 全量变更
- `ARCHITECTURE.md` / `BUILD.md` —— 架构与构建/体积基线
- 关键代码地图：`backend/selenyx_backend/services/agent/{loop,core,registry}.py`（agent 内核）、`services/{scheduler,cronparse,connectors,citations,rag}.py`、`frontend/src/components/{layout,assistant,views,library,pet}`、`frontend/src/stores/appStore.ts`、`desktop/src/pet.rs`（桌宠）

## 3. 硬性约束（违反即返工）

1. 不换技术栈、不引重型 agent 框架（纯 asyncio）；新依赖必须给体积与理由
2. **证据门不可绕过**：agent 写证据只能 pending；`[^e:id]` 染色标记必须经后端真实性校验（含无项目 run）；任何"为 demo 好看"绕过证据门 = 返工
3. 本地优先：数据/密钥/记忆不出本机，唯一出口是用户配置的 LLM 网关与学术连接器
4. 测试门槛必须保持并扩大：后端 pytest（现 112）/ 前端 vitest（现 155）/ tsc / eslint 全绿；新核心逻辑带测试
5. 体积：`index.html` 现 9.78MB（gzip 2.02MB），单轮涨幅 ≤10%
6. 分模块 conventional commits；README/CHANGELOG 同步
7. 不编造文献/假 DOI/假 star 数；不宣称不存在的 API 能力

## 4. 本机工作规则（实测过的坑，照做省几小时）

```powershell
npm run dev:local        # 前端 5173 + 后端 8770 一起起
npm run backend:test     # pytest（112）；前端 npx vitest run（155，进程可能不退出属正常）
npm run typecheck && npm run lint
node scripts/uitest-clickthrough.cjs   # 27 项 UI 穿透断言（需先起 dev:local）
```

- **本机 git push 无凭据**：用 `git push "https://x-access-token:$(gh auth token)@github.com/pyrelio88-afk/Selenyx.git" main:main`（gh 已认证 pyrelio88-afk）；推送后用 `gh api repos/pyrelio88-afk/Selenyx/branches/main --jq .commit.sha` 核对
- **本机 tauri build 被 Smart App Control 拦**（os error 4551）：Rust 改动用 `rustfmt --check` 验语法 + 对照 vendored 源码核对 API，真编译走 GitHub CI
- vite build 前先 `rm -rf frontend/dist`；PyInstaller 不用 `--clean`
- pytest 要用 `backend/.venv/Scripts/python.exe -m pytest`（uv trampoline 在此机有路径问题）
- ErrorBoundary 崩溃后侧栏导航仍"看起来正常"——UI 验证必须截屏看主区，不能只看 active 类

## 5. 本轮任务池（按优先级）

### T1 UI 成熟度深化（最高优先）
现状是"排印精良的学术笔记本"（墨白 mono、1px 细线、零阴影、朱砂点睛）。把它推向 Linear/Raycast 级的成熟度：
- 全界面键盘可达性审计与补齐（焦点环、focus-visible、快捷键表与设置·快捷键分区对齐）
- 空状态/加载态/失败态三态系统审查：每个视图都要有诚实的三态（参考 OpenMausBot 的"不可用即置灰并附原因"，不转圈不报错）
- 微交互：200ms 内功能性动效（`prefers-reduced-motion` 必须尊重）；卡片 hover、tab 切换、裁决反馈
- 移动端/窄窗口虽非目标平台，但 60px 折叠侧栏与弹窗在 800px 宽度下不得破版
- 对照成熟设计系统逐个视图走查（见参考清单 D 组）

### T2 图标体系：更有鹤的个性
现 6 个导航图标已融入鹤翅/祥云（`Icon.tsx` 的 wingChat/cloudFolder/wingBook/cloudNodes/wingClock/cloudMenu）。继续：
- 统一笔触语言：主线稿 + 一处点睛（参考品牌鹤的朱冠——每个图标只允许一处 `var(--cinnabar)` 细节，如鹤顶、云心）
- 把容器页内 tab 图标、流水线 8 段图标、工具箱图标也纳入同一套鹤/云意象体系
- 做 `artifacts/icon-preview` 预览页迭代（已有 scripts/screenshot-icon-preview.cjs 可复用），18px 与 72px 双尺寸验收
- 风格参照：lucide/tabler 的描边一致性 + 工笔画鹤的曲线韵律（颈的 S 弯、翅的分层、冠的一点朱）

### T3 agent 与证据能力深化
- run 时间线回放（可重放 run 的 UI 已完成留痕，补"逐步骤回放"交互）
- 证据卡与 PDF 页码回跳的真实链路验证（rag.py 已保留页码/偏移，验收端到端）
- 综述流水线 recipe 的产出质量：对比 paper-qa 的 Context 模型与 gpt-researcher 的 Planner→Execution→Publisher，评估是否引入"证据聚类去重"步骤

### T4 文献库对标 Zotero 收尾
- 集合（collections）拖拽归类交互；标签体系与 Zotero 对齐
- 导入去重的 UI 呈现（现后端 dedup 已按 Zotero duplicates.js 移植，前端呈现可更透明：展示"为什么判重"）

### T5 探索性（先做调研报告再决定做不做）
- sqlite-vec 替换哈希向量回退的可行性（体积 vs 检索质量）
- MCP resources/prompts 支持（现仅 tools）

## 6. 开源参考清单（检索这些仓库，对比验证后再动手）

**A. 研究型 agent / 深度研究**
- https://github.com/Future-House/paper-qa —— 证据 Context 模型、used_contexts 回算、幻觉引用处理（本项目 citations.py 已借鉴其思路但改为拒绝打回）
- https://github.com/assafelovic/gpt-researcher —— Planner→Execution→Publisher 三段式
- https://github.com/huggingface/smolagents —— typed step 内存、final_answer_checks、错误分类
- https://github.com/langchain-ai/open_deep_research —— LangGraph 研究流
- https://github.com/dzhng/deep-research —— breadth×depth 递归 + learnings 回灌
- https://github.com/LearningCircuit/local-deep-research —— 本地优先研究 agent（SQLCipher）
- https://github.com/stanford-oval/storm —— 大纲先行、多视角提问的研究写作

**B. 本地优先桌面 AI / 聊天 UX**
- https://github.com/milind-soni/OpenMausBot —— agent-as-contact、单一 SSE 流+单 reducer、内联审批卡、不可用即置灰附原因、密钥 write-only（上一轮已深读，继续挖它的反馈态细节）
- https://github.com/khoj-ai/khoj —— 本地优先 AI copilot
- https://github.com/open-webui/open-webui —— 聊天界面工程化
- https://github.com/Mintplex-Labs/anything-llm —— 桌面 LLM 工作区
- https://github.com/logseq/logseq —— 本地优先知识工具 UI

**C. 文献管理**
- https://github.com/zotero/zotero —— duplicates.js 多通路判重（本项目 dedup.py 已移植）
- https://github.com/retorquere/zotero-better-bibtex —— 引用键生成（citekeys.py 已借鉴）
- https://github.com/JabRef/jabref ｜ https://github.com/Zettlr/Zettlr —— 元数据核验与编辑器体验
- https://github.com/zotero/translators ｜ https://github.com/citation-style-language/styles —— 导入兼容与 GB/T 7714 等样式

**D. UI 设计成熟度参照（OSS 里设计最讲究的一批）**
- https://github.com/twentyhq/twenty —— Linear 级界面工艺
- https://github.com/outline/outline —— 知识库 UI
- https://github.com/appflowy-io/AppFlowy —— 本地优先 Notion 替代品
- https://github.com/shadcn-ui/ui —— 组件工艺与可访问性范式
- https://github.com/lucide-icons/lucide ｜ https://github.com/tabler/tabler-icons —— 图标描边一致性基准（我们的图标是自定义鹤/云意象，但对齐它们的网格与端点规则）

**E. 基础设施**
- https://github.com/modelcontextprotocol/python-sdk ｜ …/typescript-sdk ｜ …/servers —— MCP 官方 SDK 与参考 server（我们的 connectors.py 是刻意最小实现，对照它验证协议覆盖面）
- https://github.com/pallets-eco/croniter —— cron 语义基准（cronparse.py 的对照物）
- https://github.com/asg017/sqlite-vec ｜ https://github.com/qdrant/fastembed —— SQLite 向量检索与本地嵌入（T5 评估对象）
- https://github.com/docling-project/docling —— PDF 结构化解析（对照 anydoc 链路）
- https://github.com/tauri-apps/plugins-workspace —— 桌面能力插件

## 7. 完成定义（DoD）

1. 上述门槛全绿 + 新逻辑测试
2. `node scripts/uitest-clickthrough.cjs` 全过（改了视图就先扩充它）
3. 每模块独立 commit、CHANGELOG 更新
4. 推送 main 并用 gh api 核对 sha 一致
5. 产出一份 docs/VERIFICATION-<日期>.md 风格的验证报告：发现什么、改了什么、怎么验的

**最终标准和上一棒一致：给一个真实研究者用一天，他能说出"这玩意的稿子我敢信"——每个论断三秒内能看到出处和裁决记录。**
