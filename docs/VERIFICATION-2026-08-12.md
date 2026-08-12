# Selenyx v0.02 深度审查与优化验证报告（2026-08-12）

范围：代码深度审查与修复 / UI 交互穿透验证与视觉重塑 / 仓库文档重构 / 版本统一。
推送：`4b1469e..e12f5b2 main` + tag `v0.02`（commit 8711b09 → a52c8de → e12f5b2）。

---

## 一、发现的问题与修复记录

### P0-Critical：连接器视图整页渲染崩溃 —— 已修复 ✅
- **现象**：进入「专家·技能·连接器 → 连接器」tab 后整个主视图触碰 ErrorBoundary（"Objects are not valid as a React child: {configured, mode, provider, model, fallback}"）。
- **根因**：`routers/connectors.py` 的「向量检索」项 `detail` 误塞 `embedding_runtime_summary()` 字典，其余项均为字符串；`ConnectorsView.tsx:105` 按字符串直接渲染。
- **修复**：后端改为文本摘要（稠密 provider·model / 哈希回退说明），保持 detail 契约一致。
- **交叉验证**：① Playwright 穿透测试复现崩溃截图 → ② 修复后 `GET /api/connectors` 实测四项 detail 均为 string → ③ 新增契约回归测试 `test_connectors_status_details_are_plain_strings` → ④ 全量 pytest 112 通过 → ⑤ UI 穿透复测 27/27。

### P1-High：证据门漏洞——无项目 run 跳过编造引用校验 —— 已修复 ✅
- **根因**：`loop.py` 校验条件 `if draft and project_id and has_markers(draft)`，无项目 run 直接跳过；而 `save_evidence` 要求项目上下文，无项目时任何 `[^e:id]` 必然是编造的。
- **修复**：去掉 `project_id` 前提，无项目时以空 scope 校验（所有 `[^e:]` 必假 → 打回修订一次，二次存证染红）。
- **交叉验证**：新增回归测试 `test_projectless_run_fabricated_citation_bounced`（假 LLM 脚本驱动完整 loop，验证打回事件 + 修订稿落库）。

### P3-Low：测试脚本断言问题 ×2 —— 已修正
- 提交反馈态断言未考虑"成功后主页卸载"（实测 250ms 内已跳任务详情）；cron 输入框需先切换节奏下拉。均修正后通过。

## 二、审查通过项（抽样深读，无缺陷）

| 区域 | 结论 |
|---|---|
| cronparse（自研 cron 解析） | 17 项对抗性边界检查全过：闰日 2/29、DOM/DOW OR 惯例（对照 Vixie cron/croniter 语义）、步进/区间、周日 0/7 等价、永不可能表达式快速返回、prev_fire 亚分钟边界由调度层二次判定 |
| scheduler 重试状态机 | 退避 1/2/4 分钟 ×3、重试消费在 in-flight 守卫之后、新周期重置序列、逃逸异常有兜底落库 |
| connectors MCP 安全边界 | stdio 绝对路径 + 不经 shell；SSE 拒绝环回/私网/任意 header/重定向；每次请求前重解析 DNS 防 rebinding；调用前重新 list 防陈旧快照越权 |
| citations 防编造 | 跨项目引用隔离（project_id 过滤）、大小写严格、打回-存证两段式 |
| EvidenceReview J/K | 输入目标守卫、光标越界自动回钳（cards.length 变化时）、与全局 K 检索快捷键按 tab 隔离无冲突 |
| PetCompanionBridge | 轮询卸载清理、开关切换状态重置、异常静默不扰主流程 |

## 三、UI 交互穿透验证（Playwright，27/27 通过，0 console 错误）

覆盖：版本号 v0.02 显示 / 导航图标渲染 / 7 项主导航切换 / 知识库 6 tab / 扩展 3 tab / 设置弹窗 9 分区（Ctrl+, 开、Esc 关）/ 用户浮层 6 行 / 模板卡填入 / 芯片开关 / cron 非法即时校验。

**"深度思考"反馈链（实测通过）**：
- 任务提交：按钮即时进入「创建中…」禁用态 → 创建后跳任务详情 → 时间线流式呈现步骤（思考/工具调用/观察/批评审阅）→ 完成归档。实测使用本机配置的 LLM 网关真实执行：agent 依次调用 读取项目概况→读取证据链→检索文献库→读取笔记列表，工具返回"任务未关联项目"时诚实降级处理，批评员按对抗式五维度审阅后定稿。
- 助理发送：未配置 LLM 时给出诚实错误提示（引导至设置），不静默失败。

## 四、视觉重塑

6 项主导航图标重绘（鹤翅/祥云意象，24×24、1.6 线性描边、currentColor，深浅主题验证）：
助理=气泡藏三段翼羽 / 项目=文件夹卧祥云螺旋 / 知识库=书页展翼 / 专家·技能·连接器=三节点云带相连 / 自动化=鹤颈弯针时钟 / 更多=三条云纹波。

## 五、清理清单

- `DashboardView.tsx` + `dashboard-workbench.css`（v4 废弃的旧总览页，0 引用，typecheck/vitest 复核无悬挂）
- `docs/screenshots/v2/`（7 张）+ 根目录 12 张旧主题/旧版截图（README 已换 v4 图集，全仓 grep 无引用）

## 六、仓库与版本

- README 全面重写：定位宣言 / 签名功能 / 界面图集 / 功能特性 / 安装指南 / 使用示例（综述、自动化、MCP）/ 验证命令 / 技术栈。
- 版本统一 v0.02：侧栏与设置关于页显示 `v0.02`；机器文件（npm ×2、pyproject、FastAPI、Tauri、Cargo）按 0.01 既定约定使用 SemVer `0.2.0`（Rust semver 拒绝前导零；npm 实测容忍 0.02 但为一致性保持 SemVer）。
- CHANGELOG 增补本节修复记录；新 tag `v0.02` 已推送。

## 七、最终门槛状态

| 门槛 | 结果 |
|---|---|
| 后端 pytest | **112 通过**（+2 回归测试）✅ |
| 前端 vitest | **155 通过** ✅ |
| tsc typecheck | ✅ |
| eslint | ✅ |
| UI 穿透（27 项） | **全过，0 console 错误** ✅ |
| 体积 | 未复测（本轮无新增依赖；上轮 9.78MB/gzip 2.02MB，+0.7%） |
| 遗留风险 | 桌面 pet.rs 本机受 Smart App Control 拦截无法编译验证（rustfmt 语法校验过，真编译走 CI） |
