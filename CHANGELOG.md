# Changelog

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
