# Changelog

Selenyx 按「自迭代轮次（R<N>）」推进，本文件记录每轮主要变化。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 精神，以轮次代替语义化版本号。

## [R104] - 2026-08-06

### 核实（R100 评审挂起项关闭）
- **A5 状态管理架构**：核实通过。`App.tsx` 中 11 个视图组件全部零 props 调用，共享状态集中在 Zustand store（`stores/appStore.ts`），无 prop drilling。
- **A6 类型安全深度**：核实通过。`strict` + `noUnusedLocals` + `noUnusedParameters` 全开；`any` 密度 11 处 / 61 文件（0.18/文件），全部位于外部 API 边界（PDF.js 弱类型引用、catch 错误、LLM/Crossref 响应解析），领域模型层无 `any`。

### 新增（A9 开源工程件）
- `LICENSE`：MIT 许可证全文（README 与 package.json 此前已声明 MIT，本轮补齐实体文件）。
- `CONTRIBUTING.md`：开发环境、提交前三道门槛（typecheck/test/deploy_safe.sh）、代码约定（store 集中、storage 迁移层、stats 集中）、数据准确性红线。
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
- 可配置倒计时；`deploy_safe.sh` 五段部署安全脚本（tsc 门→构建→备份→冒烟→推送）。
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
