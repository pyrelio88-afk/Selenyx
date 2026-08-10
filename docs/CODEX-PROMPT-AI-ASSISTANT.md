# Codex 任务：把 Selenyx 做成真正可用、且有自己个性的桌面 AI 科研助手 v4

> 给 Codex 的完整任务书。请先通读全文与「现状盘点」中列出的文件，再动手。v4 相对 v3 的变化：**侧边栏与设置的布局修正**——设置从侧边栏/更多里拿掉，收进左下角用户区弹出的「设置弹窗」（WorkBuddy/ClawsGO/Codex 三家一致范式）；侧边栏导航下方加动态区（进行中任务）。

---

## 0. 产品定位与独特个性（本轮最重要的部分）

### 0.1 赛道认知（2026 年调研结论）

科研 AI 助手赛道已分层：Elicit（结构化综述）、Consensus（证据答案+consensus meter）、Scite（引用语境：支持/反对/提及）、NotebookLM（只用你给的材料）、Paperguide（Plan→Search→Screen→Extract→Generate 透明工作流）、ClawsGO（云端长程 agent 集群，广告语"每个结论都有出处"）、OpenScience/Open Science Desktop（开源本地工作台）。

**共同软肋**：全部是"自动成稿、事后自证"——Retraction Watch 2026 年 5 月分析：每 277 篇 PubMed 论文就有 1 篇引用了不存在的文献。引用透明已成卖点，但没人把**人工判断**做成核心机制。

### 0.2 Selenyx 的定位（一句话）

**别人交付"一份报告"，Selenyx 交付"一条证据链"。** Selenyx 是唯一把「人工证据门」做成 agent 工作流核心的科研助手：agent 负责跑断腿（检索/提取/起草/自批评），人负责落锤（接受/驳回证据）——可信不是功能，是架构。

三个不可动摇的个性支柱：
1. **证据门即灵魂**：agent 写的每个论断必须挂在证据上；证据必须经人接受才进成稿。这不是限制，是卖点——"AI 干活，人签字"。
2. **本地优先**：未发表的手稿、数据、密钥永不出本机（唯一出口是用户自己配的 LLM 网关）。对手都是云端，这是硬差异。
3. **仙鹤伙伴**：桌宠不是皮肤，是"研究伙伴"人格的化身——让孤独的科研长跑有个陪伴者（情感差异化，所有对手都没有）。

### 0.3 签名功能（Signature Features，对外能讲、对手没有）

1. **证据卡是一等公民**：agent 每次检索/阅读产出的不是文本，是结构化证据卡（论断 claim / 原文摘录 / 页码 / 来源文献 / 置信说明），进入「待裁决」队列。用户像批奏折一样一键接受/驳回（键盘快捷键 J/K）。
2. **成稿证据染色**：agent 交出的综述/提纲里，每个句子按支撑强度染色——🟩 有已接受证据 / 🟨 仅有候选证据 / 🟥 无据断言（要求 agent 自检标出）。看一眼就知道这稿子哪里能信。灵感来自 Scite 的引用语境，但用在"自己的稿子"上。
3. **证据覆盖率**：每篇成稿头部一个指标徽标：`证据覆盖率 87%（13/15 论断有据，其中 11 条人工已接受）`——把可信度量化成数字。
4. **可重放的 run**：每次任务完整留痕（计划→每次工具调用→每次观察→批评意见→修订稿），时间线可回放。研究过程可审计，这是"科研级"和"聊天级"的分水岭。
5. **仙鹤伙伴**：任务完成飞来报喜；点它可以问"今天做了什么"（汇总今日 run）；它是证据门的吉祥物——证据待裁决时它会站着等（头顶 🟡 点）。

### 0.4 设计基调

墨白 mono 主题为默认脸：大量留白、1px 细线、零阴影、朱砂红（#c7483b）只做点睛（鹤顶、证据门待办角标）。整体气质：**像一本排印精良的学术笔记本，不像 SaaS 仪表盘**。

## 1. 项目现状（先读这些，别猜）

技术栈：Tauri 2 (Rust) + React/TS/Vite（**单文件构建** viteSingleFile + inlineDynamicImports）+ FastAPI/SQLModel/SQLite sidecar（127.0.0.1:8770，BYOK 密钥网关）。包管理：npm workspaces（frontend/）+ uv（backend/）。

已完成（P1–P8 + 一轮迭代，全部已提交 main）：

- IA 重构第一版（已被否决，按本文第 2 节重排）；黑白 mono 主题；证据链（EvidenceItem 表：claim/excerpt/review=pending|accepted|rejected，已有！签名功能直接建在它上面）；RAG 混合检索（rag.py，保留页码/偏移）。
- agent 自循环 `backend/selenyx_backend/services/agent/loop.py`（375 行）：JSON 动作协议（plan/tool/final）、5 个只读工具、max 12 步、audit_log 每步增量落库、plan-first、finalize 批评审查门（review opt-in）、观察折叠。
- subagent（专家人格子循环，禁嵌套）+ 4 位内置专家（reviewer/critic/methodologist/writer）；自动化调度（interval/daily + in-flight 守卫）；registry（取消/占用）。
- 前端：TasksView 步骤时间线、Experts/Automations/Connectors 卡片页、仙鹤桌宠（透明置顶窗 + FloatingCrane 降级 + 开关）、SettingsView（现为整页 + 左侧 tab，**本轮改为弹窗范式**，见 2.3）。
- 测试基线：后端 55 pytest / 前端 130 vitest / typecheck / lint 全绿。**门槛必须保持并扩大。**

关键文件地图：

```
backend/selenyx_backend/
  main.py / routers/{agent,experts,automations,connectors,ai,evidence}.py
  services/agent/{loop,subagents,registry}.py / scheduler.py / rag.py
frontend/src/
  components/views/{TasksView,ExpertsView,AutomationsView,ConnectorsView,AIChatView,SettingsView,...}.tsx
  components/views/AIChatView.tsx   # 1119 行巨石，待拆
  components/layout/{Sidebar,MobileShell}.tsx  # 侧边栏，本轮重构
  services/{agent,extensions,api,nativeRuntime}.ts / stores/appStore.ts
desktop/src/pet.rs                  # 桌宠窗口 + 走位状态机
```

## 2. 信息架构（v4 定稿）

### 2.1 侧边栏三段式结构（自上而下）

**A. 顶部品牌区**：仙鹤 logo + Selenyx 字样 + 版本号；右侧折叠/搜索图标（WorkBuddy 同款布局）。

**B. 主导航区**（固定 7 项一级项，不展开子项）：

| 顺序 | 项 | 内容 |
|---|---|---|
| 1 | **新建任务** | 主页。ClawsGO 式：时段问候语 + 任务模板卡（文献综述/证据梳理/论文提纲/数据解读，点击填入输入框）+ 底部任务输入框（`/`技能、`@`专家、选择归入项目）。提交即创建 run 并跳任务详情 |
| 2 | **助理** | AI 对话（会话列表 + 对话区） |
| 3 | **项目** | 项目列表 + 详情（项目任务、八段流水线、关联文献/笔记/证据门待办数） |
| 4 | **知识库** | 单入口，页内 tab：文献 / 文档·笔记 / **证据卡**（新，见模块 A）/ 表格 / 临床数据 / 图片·文件。左侧栏不展开 |
| 5 | **专家·技能·连接器** | 三合一页面，页内 tab |
| 6 | **自动化** | 定时任务 + 运行历史 |
| 7 | **更多** | 统计工具、工具箱、数据备份导出、快捷键说明、关于。（旧"总览"页废弃，番茄钟等小部件挪到这里） |

**C. 导航下动态区**（WorkBuddy 范式）：
- **任务（n）**：进行中的 run 实时列表（名称 + 相对时间 + 状态点），点击进任务详情；无进行中时收起。
- **项目（n）**：最近/置顶项目快捷入口（可折叠）。

**D. 底部用户区**（设置从这里进，**不进导航也不进"更多"**）：
- 左下角：用户头像/名片区（本地应用无账号体系 → 显示可编辑的昵称 + 仙鹤头像，或读取系统用户名）。
- 点击弹出浮层（WorkBuddy/ClawsGO/Codex 一致）：
  - **显示宠物** 开关（Codex 同款，桌宠总开关也在这里放一份）
  - **外观**：浅色/深色 快速切换（segmented control）
  - **设置**（Ctrl+,）→ 打开设置弹窗（见 2.3）
  - **检查更新**、**帮助与反馈**、**关于**

### 2.2 「任务」不做侧边栏一级项
新建任务即入口；进行中任务在动态区实时可见；历史从项目详情/自动化运行历史进入。旧 localStorage 的 currentView 废弃值迁移兜底（落到新建任务）。

### 2.3 设置 = 弹窗，不是页面（WorkBuddy 范式）
- 触发：用户区浮层「设置」或 Ctrl+,；**模态弹窗**（遮罩 + 居中面板 + 右上角 ×），左轨 + 右内容。
- 左轨分区（按 Selenyx 实际裁剪）：
  1. **通用**：显示语言（预留，先中文）/ 字体大小滑杆 / 开机自启 / 后端服务状态（健康检测+重启）
  2. **外观**：四套主题卡 + 浅色/深色 + 三档密度（现 SettingsView 外观 tab 内容平移）
  3. **个性化**：回复风格语调 / 自定义指令（注入所有对话与 agent run 的 system 后缀，≤1500 字）
  4. **记忆**：生成对话记忆开关 / 全局记忆查看·编辑·清空 / 项目记忆列表 / 导出（模块 F 的记忆管理放这里，不做设置页卡片）
  5. **模型**：BYOK 配置（provider/Key/BaseURL/模型 表单，现 AI tab 平移）+ Ollama 官网引导 + 用量统计（tokenBudget）
  6. **助理**：仙鹤桌宠开关与行为（完成通知/待裁决提醒）、自定义专家快捷入口
  7. **数据管理**：工作区备份导出 / 导入 / 已归档任务 / 数据目录位置（打开文件夹）
  8. **快捷键**：表格列出（J/K 裁决、Ctrl+,、Ctrl+N 新任务、Esc 停止生成、Ctrl+B 侧栏……）
  9. **关于**：版本号 / 检查更新 / 官网与文档链接 / 开源许可
- 现有 SettingsView 的内容全部平移进弹窗对应分区；路由式 settings 视图删除。

## 3. 需求详述（按模块，含验收点）

### 模块 0：IA 重排（侧边栏三段式 + 设置弹窗 + 新建任务主页，最先做）
按第 2 节落地。验收：侧边栏无设置项、底部有用户区；浮层含显示宠物/外观/设置/检查更新；Ctrl+, 打开设置弹窗且 9 个分区内容正确；导航下动态区列出进行中 run；主页像 ClawsGO 一样"一句话开始干活"；知识库 6 个 tab 正确渲染；mono 主题下气质对齐 0.4（学术笔记本而非仪表盘）。

### 模块 A：证据卡一等公民（签名功能 1，最高价值）
1. 后端：`save_evidence` agent 工具（claim/excerpt/source/page → EvidenceItem review=pending）；`list_pending_evidence` 工具与 `GET /api/evidence/pending` 路由。
2. 知识库新增「证据卡」tab：待裁决队列（卡片流：论断加粗 + 原文摘录 + 来源 + 页码回跳 PDF），接受 ✓ / 驳回 ✗（键盘 J/K/方向键，批量模式）；已接受/已驳回分 tab 可查可撤销。
3. 项目详情与主页显示「待裁决 n」朱砂角标；桌宠头顶黄点同步（模块 G）。
4. 验收：跑一个综述 run → 证据卡队列出现 5+ 张卡 → J/K 快速裁决 → 裁决结果落库且 run 时间线可见。

### 模块 B：agent 读写闭环 + 工件（成稿不再消失）
1. 新工具：`write_note`（成稿写入知识库·文档）、`list_notes`/`read_note`（读上下文）、`export_artifact`（落 artifacts/runs/{runId}/ 文件）。写工具全部落 audit。
2. AgentRun 加 artifacts_json；任务详情「产出」区：成稿渲染 + 下载 .md / 复制 / 写入笔记。
3. 验收：run 结束后产出区可见可下载，一键写入笔记后知识库·文档可见。

### 模块 C：证据染色 + 覆盖率（签名功能 2/3）
1. 写作类 run 的 final 输出协议扩展：agent 按句标注支撑标记 `[^e:evidenceId]`（已接受证据）或 `[^none]`（无据）；后端校验这些标记引用的 evidenceId 真实存在且属于该项目（**防 agent 编造引用标记**）。
2. 前端产出区渲染染色：绿/黄/红三色背景 + hover 显示证据卡摘要 + 点击回跳证据。
3. 成稿头部自动计算覆盖率徽标（有据论断占比 + 人工接受占比）。
4. 验收：一篇成稿里能看到三色句子；hover 有证据卡；`[^e:xxx]` 指向不存在的证据时后端拒绝并打回修订。

### 模块 D：流式 + 干预 + plan 确认（任务体验现代化）
1. 恢复 SSE（`GET /runs/{id}/events`）：每订阅者独立队列或 broadcast；run 结束清理 registry；前端 EventSource 优先、轮询兜底。事件类型对齐 go-claw：thought/tool_call/tool_result/plan/review/final/error。
2. `POST /runs/{id}/steer`：运行中追加用户指示，loop 下一步顶部消费，时间线显示为用户插话。
3. plan 确认模式（开关）：plan 产出 → `waiting_confirm` → 前端「按计划执行/调整」→ 继续。
4. 取消即时化：LLM 调用包可取消 task，秒级停。
5. 侧边栏动态区「任务（n）」实时反映进行中 run（这里复用轮询即可）。
6. 验收：运行中步骤 1s 内出现在时间线；steer 后下一步可见方向调整；取消 2s 内停；动态区任务数实时增减。

### 模块 E：多专家流水线 + 专家页活化
1. 内置「综述流水线」recipe：规划 → 综述员起草 → 批评员审 → 修订 → 证据染色成稿；新建任务页模板卡一键启动。
2. 专家 tab：卡片加「对话」（专家人格会话）；专家详情（被委托记录、工具边界）。
3. subagent 事件在时间线折叠为可展开分组（专家名+步数+结论摘要）。
4. 验收：流水线 run 时间线可见三段角色交接；能跟批评员单独对话。

### 模块 F：技能 + 记忆（agent 的"经验"）
1. 技能：SKILL.md 包（frontmatter: name/description/allowed_tools + 指令正文），用户级 ~/.selenyx/skills/ + 项目级；`POST /runs` 支持 skill 参数（注入 system + 裁剪工具白名单）；技能 tab 真实管理（启用/查看/新建）；输入框 `/技能名`。
2. 记忆：全局 ~/.selenyx/memory/MEMORY.md + 项目级；`read_memory`（run 启动注入摘要）+ `write_memory`（run 结尾追加）；管理界面在设置弹窗「记忆」分区（查看/编辑/清空/导出）；**记忆永不外发，只进 prompt**。
3. 验收：第一次 run 写入"该项目聚焦老年谵妄"→ 第二次 run 开头能引用此记忆；设置·记忆里能看到这条并可删除。

### 模块 G：自动化 2.0 + 仙鹤伙伴
1. 自动化：cron 表达式（自写最小解析或 croniter，给体积说明）、运行历史（关联 run 可跳详情）、失败指数退避重试 ×3、停机错过补偿（可关）。
2. 仙鹤：run 完成/失败飞一圈 + 气泡；有待裁决证据时头顶黄点静立；点击气泡答"今天做了什么"（今日 run 汇总）；可拖拽换位；右键菜单（隐藏/打开主窗/今日任务数）。总开关在三处同步：用户浮层「显示宠物」+ 设置弹窗「助理」分区 + 桌宠右键「隐藏」。
3. 验收：cron 到点触发；run 完成时桌宠有动画 + 气泡；三处开关状态一致。

### 模块 H：连接器可配 + AIChatView 拆分
1. 连接器：学术检索真实探测（超时+缓存）；MCP server 添加（stdio/sse，最小 client：initialize/tools-list/tools-call，工具带 mcp: 前缀进白名单）。
2. 拆 AIChatView → `components/assistant/`（SessionList/MessageList/Composer/StreamController）；助理页与新建任务页共用 Composer；助理会话可「转为任务」；run 产出回贴来源会话。

## 4. 硬性约束（违反即返工）

1. 不换技术栈、不引重型 agent 框架（纯 asyncio）；新依赖给体积与理由。
2. 本地优先：数据/密钥/记忆不出本机；唯一出口是用户配置的 LLM 网关与学术连接器。
3. **证据门不可绕过**：agent 写证据只能 pending；证据染色标记必须经后端真实性校验；任何"为了让 demo 好看"而绕过证据门的行为 = 返工。
4. 测试门槛：pytest / typecheck / lint / vitest 全绿；新核心逻辑带测试（证据校验、染色标记校验、steer、plan 确认、cron、记忆、MCP 各 ≥1）。
5. 体积：index.html 现 9.72MB/gzip 2.0MB、sidecar 21.4MB，本轮涨幅 ≤10%。
6. 既有功能零回归；三栏骨架继续复用。
7. 本机构建限制：vite build 前删 frontend/dist；PyInstaller 不用 --clean；tauri build 走 GitHub CI。
8. 分模块 commit（conventional commits）；README/CHANGELOG 同步。

## 5. 实施顺序（每步独立可交付）

1. 模块 0（IA 三段式 + 设置弹窗 + 新建任务主页）→ 第一眼变化
2. 模块 A（证据卡队列）→ 灵魂落地，后续模块都围绕它
3. 模块 B + C（读写闭环 + 证据染色）→ 成稿可信可见
4. 模块 D（流式/steer/plan 确认/动态区）→ 体验现代化
5. 模块 E（流水线 + 专家页）
6. 模块 F（技能 + 记忆）
7. 模块 G + H（自动化/仙鹤/连接器/拆聊天）
8. 收尾：README 截图重拍（scripts/screenshot-ui.cjs）、BUILD.md 体积复测、v0.2.0 tag

## 6. 完成定义（DoD）

全部真实跑通并截图/录屏进 docs/screenshots/：

0. 打开应用即「新建任务」主页；侧边栏 7 项 + 动态任务区 + 底部用户区；**设置不在侧边栏**——点头像浮层进设置弹窗（Ctrl+, 亦可），9 个分区齐全。
1. 综述任务全流程：主页输入 → plan 确认 → 流式看专家接力与批评修订 → 成稿**证据染色**（三色可见）+ **覆盖率徽标** → 一键写入笔记。
2. 证据裁决：知识库·证据卡 tab 用 J/K 批掉 10 张卡；待裁决角标实时消减；桌宠黄点同步出现/消失。
3. 染色防编造：手动改坏一个 `[^e:xxx]` 引用 → 后端拒绝并打回。
4. cron 自动化到点触发，运行历史可跳详情，产出带染色。
5. 记忆跨 run 生效（第二次任务引用第一次的记忆）；设置弹窗·记忆里可管理。
6. 跟批评员单独对话；流水线 run 详情里子代理分组可展开。
7. 任务完成仙鹤飞来报喜；点它答出今日进展；浮层「显示宠物」关掉它真的消失。

**最终验收标准不是"功能在"，而是：给一个真实研究者用一天，他能说出"这玩意儿的稿子我敢信"——因为每个论断都能三秒内看到出处和裁决记录。**
