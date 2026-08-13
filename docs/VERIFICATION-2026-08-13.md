# v0.03 接管补全与验证报告（2026-08-13）

> 接手背景：grok4.6 的 v0.03 深化轮在 2026-08-12 13:12 因 LLM 网关超时（max_retries_exhausted）中断，
> 留下 58 改 + 30 新文件的未提交工作区。本轮（WorkBuddy/Kimi）接管：审查 → 补断点 → 全量验证 → 分模块提交。

## 一、grok4.6 遗产盘点（已完成部分，审查结论：质量保留）

| 任务池 | 遗产 | 审查结论 |
|---|---|---|
| T1 UI 成熟度 | `designScale.ts`（8pt/字阶/行高 token）、`interaction.css`（五态）、`EmptyGuide`、 EvidenceReview 三态、tokens.css 动效 token + reduced-motion 归零 | 刻度与 token 一致，五态选择器覆盖全 clickable；保留 |
| T2 图标鹤化 2.0 | 6 导航图标 + `craneDraft` 重画（朱砂鹤顶 + S 颈）、流水线 8 段 emoji → 类型化线性图标 | 与 IA.md 口径一致；保留 |
| T3 证据链 | 后端 `evidence_appendix.py`（权威附录、伪造段替换、fail-closed）、citations.py 收紧（missing_markers / 双 accepted / 无项目打回）、loop.py 二次不过即失败、PdfReader initialPage 钳位、contradictionPairs 并排 | 证据门无绕过口；保留 |
| T4 性能稳健 | `budget.py`（ContextVar 令牌预算）、database.py WAL+外键 pragma、test_rag_gold.py 20 问基线 | 默认 0 不限，向后兼容；保留 |
| IA 收敛 | 新对话即助理（taskLaunch nonce 认领）、侧栏 6 项、倒数日嵌项目卡、备份合并恢复 | 合并语义本地优先、不滚回；保留 |

## 二、本轮补全与修复（中断点）

1. **`LocalFilesPanel` 空态 props 误用**（tsc 阻断点）：`<EmptyGuide text=...>` → children 传参。此为会话中断的直接现场。
2. **侧栏版本号消失**：grok 删了 `workspace-brand-subtitle`（v0.02）却未补 v0.03，而其自改的穿透测试仍断言该元素含 "0.03"——自相矛盾。补回 `v{APP_VERSION}`，并抽 `lib/appVersion.ts` 单一来源（SettingsModal 同步改用），消除双写风险。
3. **穿透测试同拍断言**：「任务提交反馈态」在 click 同一拍查聊天气泡（异步交接必 false）；改为 `waitFor({ timeout: 8000 })` 等待落点。截图实证交接链路本身完好。
4. **vacuous assert 清理**：`test_token_budget.py` 的 `assert tokens_used() == 0 or True` 恒真，删之并同步清理未用 import。
5. **版本号统一**：package.json / frontend/package.json / desktop/tauri.conf.json / desktop/Cargo.toml → 0.3.0（FastAPI 已被 grok 升 0.3.0）；README 徽章 v0.03。
6. **文档同步**：CHANGELOG v0.03 全量条目；REQUIREMENTS-LEDGER 的 H3/H4/H5 与 Later 项标记已验收。

## 三、验证（全绿）

| 门槛 | 基线（v0.02） | 本轮 | 结果 |
|---|---|---|---|
| 后端 pytest | 112 | **132 passed**（+20：预算闸/附录/黄金集/WAL/证据门收紧） | ✅ 22.7s |
| 前端 vitest | 155 | **192 passed**（+37：designScale/appendix/pdfAttachment/contradictions/countdowns/taskLaunch…） | ✅ 4.2s |
| tsc / eslint | 绿 | 绿（--max-warnings 0） | ✅ |
| UI 穿透 | 27 项 | **24/24**（按新 IA 重排断言），0 console/pageerror | ✅ |
| 构建体积 | 9.78MB / gzip 2.02MB | 9.81MB / gzip 2.03MB（≤+10% 约束内，实际持平） | ✅ |
| 截图实证 | — | after-submit.png：新对话壳交接成功、侧栏 v0.03、目标回贴在屏 | ✅ |

## 四、设计判断记录

- **保留 grok 的侧栏顺序**（新对话→项目→工具→自动化→知识库→专家·技能·连接器）：与其 IA.md 文档、穿透断言、QA 截图三方自洽，且 IA.md 注明来自用户口径；不回退到 08-12 早间记忆里的旧顺序。
- **证据门二次失败即 run failed**（grok 的收紧）比 v0.02「按无据标记展示」更严，符合「证据门即灵魂」红线；保留。
- **备份恢复改合并**（grok）属行为变更但方向正确（非破坏），已在 CHANGELOG 明示接口改异步。

## 五、已知边界（诚实声明）

- RAG 黄金集断言行内阈值 ≥12/20 是哈希混合检索的地板基线，dense 嵌入真实端到端仍未在本机验收（Ollama 未装）。
- token 预算在 API 不返回 usage 时按 4 字符≈1 token 估算，是保守下限而非精确计量。
- 深色主题 WCAG AA 逐视图对比度复测未在本轮范围（T1 任务池遗留项）。
