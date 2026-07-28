# 成熟开源对照：Selenyx 该抄什么 / 不抄什么

> 对应你与 Codex 的产品红线：禁止换皮；核心抽象服务科研；子代理有限；L1 离线可用。

## 对照矩阵

| 项目 | 我们借鉴 | 我们不抄 | 在 Selenyx 的落点 |
| --- | --- | --- | --- |
| [Zotero](https://www.zotero.org/) / [zotero/zotero](https://github.com/zotero/zotero) | 本地库、条目元数据、批注与证据归属、诚实的“无全文就说无全文” | 不做完整引用管理器、不同步 Zotero 云、不复制其 UI | 本地文献库、批注、证据链 |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | 三栏工作台、右栏上下文、设置分区、失败如实展示 | 不做成通用 coding agent | Desktop 布局与交互气质 |
| [OpenClaw](https://github.com/openclaw/openclaw) | 多表面（桌面/网关）与本地优先 | 不堆技能市场外壳 | 双形态 CLI + Desktop 的产品边界 |
| [kimi-code](https://github.com/MoonshotAI/kimi-code) | 清晰的 Agent 工具边界与可观测执行 | 不绑单一模型厂商 | BYOK provider 层 |
| [CC Switch](https://github.com/farion1231/cc-switch) | 本地配置切换、不假装全局劫持 | 不做成模型账号管理器 | 设置里的提供方管理 |
| [Semantic Scholar API](https://api.semanticscholar.org/) / OpenAlex / PubMed | 原生 API 检索与可审计状态 | 不抓登录墙页面 | 国际检索与来源状态芯片 |
| [nature-skills](https://github.com/Yuan1z0825/nature-skills) | 科研流水线任务切分 | 不把技能做成空卡片墙 | Nature 科研助手路径 |
| Electron `WebContentsView` 实践（各桌面 agent） | 内嵌浏览 + bounds 同步 + 外部兜底 | 不硬刚所有 X-Frame/登录墙站点 | 科研浏览器 |
| [ZotReader](https://github.com/Drakonis96/zotreader) | 阅读-批注-AI 的连续体验 | 不做纯 PDF SaaS | 阅读模式与证据闭环 |

## 针对你点名的“空有其表”

| 表象 | 根因 | 本次修复方向 |
| --- | --- | --- |
| 检索说有 20 条，界面像没结果 | `.empty-state { display:grid }` 盖掉 `[hidden]`，空状态把结果顶出视口 | 全局 `[hidden]{display:none!important}` + 结果工具条 + 自动滚到结果 |
| 收藏/加文献像失灵 | 结果不可见，用户点不到；进入阅读前未强制入库 | 结果卡“收藏/进入阅读”自动入库；全部收藏 |
| 阅读/批注不能用 | 未选中文字直接失败；摘要不可选；文献不在本地库 | 可选中摘要；未选中时回退摘要开头；批注前自动收藏 |
| 内置浏览器白屏/不显 | 首次打开 bounds 为 0；部分站点禁嵌 | 双 rAF + bounds 回退；blocked 时系统浏览器兜底 |
| 设置/技能很多但像摆设 | 装饰性入口过多 | 助手改为路径推进；不可用能力明确标 L2/外部依赖 |

## 产品取舍（按你的吐槽校准）

1. **浏览器优先可用**：能嵌就嵌，不能嵌立刻给系统浏览器，不允许假加载。
2. **检索不是花瓶**：要么显示真实卡片，要么诚实 0 条；站点入口单独分区。
3. **阅读必须能批注**：没有 PDF 全文时，至少摘要级批注/证据可用。
4. **少而真**：宁可少几个菜单，也不再堆“看起来有”的空控件。
