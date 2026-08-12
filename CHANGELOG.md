# Changelog

## [0.02] - 2026-08-11

V4 转型发布：从「科研工具箱」到「证据链 AI 科研助手」——证据门即灵魂、本地优先、仙鹤伙伴。

### 新增（按模块）
- **IA 重排（模块 0）**：侧边栏三段式（品牌区 / 7 项主导航 / 动态任务区 + 底部用户区）；设置改为模态弹窗（Ctrl+,，9 分区）；新建任务主页（问候语 + 模板卡 + 底部 Composer）；旧「总览」页废弃。
- **证据卡一等公民（模块 A）**：agent 落卡工具（save_evidence/list_pending_evidence）+ 知识库「证据卡」待裁决队列（J/K 快速裁决）+ 项目/主页待裁决朱砂角标。
- **读写闭环（模块 B）**：write_note / export_artifact / list_notes / read_note 写工具；run 工件清单（artifacts_json）；任务详情产出区（下载 .md / 复制 / 一键写入笔记）。
- **证据染色 + 覆盖率（模块 C）**：成稿逐句 `[^e:id]` / `[^none]` 标记，后端防编造校验（编造引用打回修订一次，二次存证染红）；产出区三色染色 + 证据芯片 + 覆盖率徽标。
- **流式与干预（模块 D）**：SSE 事件流恢复（snapshot 先行 + 心跳，EventSource 优先、轮询兜底）；steer 运行中插话；plan 确认门（waiting_confirm → 按计划/调整后执行）；LLM 调用可取消（秒级停）。
- **专家流水线（模块 E）**：综述流水线 recipe（综述员起草→批评员审→修订→染色成稿，模板卡一键启动）；专家人格对话、被委托记录与工具边界；subagent 时间线折叠分组。
- **技能与记忆（模块 F）**：SKILL.md 技能包（用户级 + 项目级遮蔽，注入指令 + 工具白名单裁剪，/技能名 调用，技能页真管理）；两层记忆（全局 + 项目，启动注入摘要，read_memory/write_memory 工具，设置·记忆分区管理）；自定义指令接通注入。
- **自动化 2.0（模块 G）**：cron 表达式（自写零依赖解析，五字段 + OR 惯例）；失败指数退避重试 ×3（1/2/4 分钟）；停机错过补偿（可关）；运行历史可跳任务详情。
- **仙鹤伙伴（模块 G）**：run 完成/失败报喜气泡；待裁决证据黄点；点击答「今日进展」；可拖拽换位 + 右键菜单；网页漂浮鹤与桌面桌宠双形态，三处开关同步。
- **连接器与 MCP（模块 H）**：学术连接器真实探测（超时 + 缓存）；MCP server 添加（stdio/sse，安全校验的 initialize/tools-list/tools-call 最小客户端）。
- **AIChatView 拆分（模块 H）**：components/assistant/（Composer/SessionList/MessageList/StreamController）；助理与新建任务共用 Composer；会话可转为任务；run 产出回贴来源会话。

### 安全与质量
- MCP stdio 命令/参数白名单校验、响应大小上限、环回/私网地址与任意 header 拦截。
- 证据门不可绕过：agent 写证据只能 pending；染色标记必须经后端真实性校验。
- 测试基线：后端 110 pytest / 前端 155 vitest / typecheck / eslint 全绿。

### 修复（2026-08-12 深度审查）
- **连接器视图整页崩溃**：/api/connectors 的「向量检索」项 detail 误塞字典（embedding_runtime_summary），前端按字符串渲染直接触碰 ErrorBoundary；改为文本摘要并加契约回归测试（每项 detail 必为字符串）。
- **证据门漏洞**：无项目 run 的编造引用标记此前跳过真实性校验；现同样打回（save_evidence 要求项目上下文，无项目时任何 [^e:id] 必假），附回归测试。
- 版本展示统一 v0.02（机器文件遵循 0.01 既定约定用 SemVer 0.2.0：npm/Tauri/Cargo/FastAPI）。
- 导航图标视觉重塑：助理/项目/知识库/专家·技能·连接器/自动化/更多 融入鹤翅与祥云意象。
- 清理：废弃 DashboardView（旧总览页）及其样式、docs/screenshots/v2 与 12 张旧主题截图。
- 测试基线：后端 112 pytest（+2 回归）/ 前端 155 vitest；27 项 UI 穿透交互测试全过、0 console 错误。

## [0.01] - 2026-08-07

### Changed
- Publish using SemVer `0.0.1` for npm, Tauri, Cargo, and FastAPI; the app displays the user-facing version as 0.01.
- Add explicit, read-only desktop import from Zotero Local API; it never reads Zotero's SQLite database or writes back to Zotero.

Selenyx 按「自迭代轮次（R<N>）」推进，本文件记录每轮主要变化。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 精神，以轮次代替语义化版本号。

## [R110] - 2026-08-07

### 新增
- 统计-图表深度融合：公式库（15 公式双向跳转）+ Logistic 森林图 + 卡方列联表热力图 + 全局文字对齐修复
- AI 助手技能推荐横向滚动卡（研究框架驱动 → nature-* 技能映射 → 点击注入 prompt）
### 优化
- AI 助手深度优化 v2：消息气泡 + 日期分隔 + 流式状态 + 滚动按钮 + 空状态动画 + 键盘导航 + 复制反馈 + 错误重试
- 移动端技能 chip 触控 36px → 44px（UI 设计师走查反馈）
- 安全加固（代码审查官评审 2 项黄建议）；冒烟信噪比 / Icon fallback / anydoc 加载态文案打磨

## [R109] - 2026-08-07

### 新增
- 笔记区：新建 / Markdown 编辑 / 分类标签 / 搜索 / 关联文献与流水线段 + 持久化迁移 v4
- anydoc 文档转 Markdown 集成（@firecrawl/anydoc-wasm，WASM 本地转换，文献库全文段）
- 工具箱「图表」标签页：ECharts 8 类科研图 + CSV 导入 + PNG/SVG 导出 + 主题自适应
### 优化
- AI 助手深度优化（参照 Hermes WebUI）：多会话管理 / Markdown 渲染 / 代码高亮 / 流式动效 / 快捷指令 / 会话分支 / 模型切换 / 响应式
- AI 助手移动端互斥全屏 + 气泡精确宽度 + AI 头像 + 斜杠面板 fixed

## [R108] - 2026-08-06 ~ 2026-08-07

### 新增
- 工具箱独特图标 + 项目创建重构（名称优先 / 框架可选可折叠）+ 框架扩展至 30（Science/Nature 标准）
- 红头文件 fullText/docUrl 接口 + ClinicalDataView 可展开原文 + 倒数日优化（预设/紧迫色/小时）
- AI 助手重构（Codex 命令面板 + Hermes 上下文）
- 内置 OCR（Tesseract.js chi_sim+eng，扫描版 PDF/图片文字识别）
### 迭代（r3–r19）
- r3：AI 助手对话持久化 + 命令分类别名 / 框架 46 个（EQUATOR 扩展）
- r4：界面密度切换修复（CSS 级联 bug）+ 密度响应覆盖面扩展
- r5：红头文件 39 条注入 docUrl 官方原文链接 + OfficialDocDetail 渲染原文/链接
- r6：医学 +55 参数 +54 公式（全学科数据首批）
- r7：总览页信息分组重构 + emoji 换 Icon + footer 强刷提示
- r8：应用内版本自动校验机制（fetch no-store 比对构建标记 + 8s 倒计时自动刷新 banner）
- r9：医学数据第四批（+26 数值 +22 公式，唯一值 101/103 双破百）
- r10：夜间卡片层级梯度加宽 + banner 文案去冗余
- r11：医学释义重写试点批次 50 条入库（L2 抽检 0% 同义反复通过）+ source 字段
- r12：暗色主题梯度修复（minimal-white/ink-classic dark CIE L* Δ≥7）
- r13：移动端批一（TopBar + Drawer 导航 + V1 总览 + V9 番茄钟 + 全局触控）
- r14：文献库三修复（A1 导出弹窗 + A2 删除确认 + A3 OA 查找 + 在线阅读新窗口）
- r15：stat-card icon tofu 修复 + drawer toolbox icon
- r16：移动端批二 V6/V2/V5 组件级适配（BottomSheet 详情 + 2 列网格 + chips 横滑 + safe-area）
- r17：anydoc wasm 外置 public/ + 运行时 fetch 按需加载（gzip 6.27MB → 2.55MB，-59%）
- r18：wasm 加载多源回退（相对路径 → jsDelivr CDN）+ 魔数校验防 HTML 兜底页
- r19：移动端批三 V3/V4/V7/V8 组件级适配 + 批二 P2 尾修 + R90 看板空态/番茄钟/统计表单收口
- Tauri v2 原生打包工程（桌面三平台 + Android）

## [R107] - 2026-08-06

### 新增
- P0 统计计算器：Logistic 回归 / ROC 曲线 / 生存分析（统计工具 15 → 18）

## [R106] - 2026-08-06

### 变更
- discipline params + official docs，toolbox icons，skills GitHub URL，nature-skills 32k stars

## [R105] - 2026-08-06

### 新增
- 文献删除 + 导出剪贴板兜底 + 在线预览提示
- 北京时间时钟 + 宽度对齐 + Agnes 预设 + 技能卡图标
- 3 个统计计算器：Cronbach α / 线性回归 / Mann-Whitney U


## [R104] - 2026-08-06

### 核实（R100 评审挂起项关闭）
- **A5 状态管理架构**：核实通过。`App.tsx` 中 11 个视图组件全部零 props 调用，共享状态集中在 Zustand store（`stores/appStore.ts`），无 prop drilling。
- **A6 类型安全深度**：核实通过。`strict` + `noUnusedLocals` + `noUnusedParameters` 全开；`any` 密度 11 处 / 61 文件（0.18/文件），全部位于外部 API 边界（PDF.js 弱类型引用、catch 错误、LLM/Crossref 响应解析），领域模型层无 `any`。

### 新增（A9 开源工程件）
- `LICENSE`：MIT 许可证全文（README 与 package.json 此前已声明 MIT，本轮补齐实体文件）。
- `CONTRIBUTING.md`：开发环境、提交前三道门槛（typecheck/test/local verification）、代码约定（store 集中、storage 迁移层、stats 集中）、数据准确性红线。
- `CHANGELOG.md`：本文件，按轮次回溯播种 R71–R104。

## [R103] - 2026-08

### 变更
- StatToolsView 重构：8 个计算器改用 `@lib/stats`，消除视图层内联重复实现。
- `stats.ts` 新增摘要量统计函数（independent/paired/oneSample）与 ANOVA eta²、diagTest 扩展。

## [R102] - 2026-08

### 新增
- stats 单测：67 项全部通过，期望值用 scipy 实算参考值（非手算）。
- storage 单测：覆盖 D6 旧数据迁移路径。
- **D6** localStorage schema versioning：持久化数据结构登记版本号与迁移函数。
- 冒烟测试升级：vite preview + 无头浏览器 console 检查，捕捉运行时白屏。
- **D3** pdfjs-dist 动态导入：延迟执行 + 单例 + 加载态，降低首屏包体。

## [R101] - 2026-08

### 修复
- **P0-3** 夜间模式 CSS 泄漏。
### 新增
- **P0-6** OnboardingChecklist 新手引导清单。
- **D5** ErrorBoundary 错误边界；**D4** 版本页脚。
- Vitest 引入与 stats.test.ts（scipy 参考值断言）。

## [R100] - 2026-08（里程碑）

### 新增
- 可配置倒计时；本地验证流程（类型检查→构建→冒烟）。
- L2 数据质量战役收官：13/13 学科同义反复清零，术语 2921→2892（去重）。

## [R97–R99] - 2026-08

- 学科数据质量逐批修复：医学 20 / 理学+法学+哲学 30 / 经济学 5 / 教育学 11（Bloom/Tyler/ADDIE）/ 历史学+文学 16 / 农学+工学 19 / 管理学+艺术学+军事学 29 循环定义升级。
- R99.1：领导力条目补全 Spears 十大特质。
- R97.1：L1 基础层去重 29 条。

## [R93–R96] - 2026-08

- R96：术语 source 覆盖率 100%（947/947），公式与参数回填。
- R95：glossary source 100% + 按类型审计脚本。
- R94：L1 同义反复检测修复 + 工学/医学 source 回填。
- R93/R93.1：9 学科 337 条扩展术语 + 43 条补缺。

## [R91–R92] - 2026-08

- R92：学科数据去重扩展；设置页 SVG 图标重做；工具箱 5→10 个科研工具。
- R91：修复统计计算 bug（gammaQ 灾难性相消、Haldane 校正）；R91.1：localStorage JSON.parse 安全护栏（Zustand 自定义 storage）。

## [R83–R89] - 2026-08

- R89/R88/R87：工学/教育学/理学学科旗舰扩展（glossary + 参数）。
- R86：自定义番茄钟事件、看板原生拖拽。
- R85：研究框架 5→15（多学科覆盖）。
- R84：5 个研究框架（PICO/PRISMA/CONSORT/STROBE/IMRaD）、25 个开源科研技能库、内置浏览器、仪表盘番茄钟/倒数日/时间线。
- R83：学科术语扩至 2921（13 一级学科）、瑞士杂志蓝主题、Pexels/Crossref/arXiv 集成、工具箱视图。

## [R79–R82] - 2026-08

- R80：多维表格 + 侧边栏分组 + 临床数据 + 统计工具视图。
- R79：BYOK 对话 + 流水线执行 + 单文件部署形态确立。

## [R71–R78] - 2026-08

- R77–R78：批注侧边栏、PDF 大纲导航、评审修复批次。
- R75–R76：PDF.js 全文阅读器、五色批注层、textLayer 选区高亮。
- R74：多维表格视图系统（看板/画廊/日历）。
- R73：BibTeX/RIS 解析器，导入导出闭环。
- R72：设计系统升级（5 平台调研落地）。
- R71：多语言架构启动——TS + Python + Rust monorepo 骨架。
