# Selenyx R0.9.1 — Hermes 与科研工作台源码调研对照

> 调研日期：2026-07-29。范围只包含公开仓库与项目官方文档。本文记录交互/架构取舍，不代表复制任何第三方代码或视觉资产。

## 结论先行

Selenyx 不应成为“聊天框 + 技能卡片”的通用 Agent 换皮。科研桌面端的主对象是 **项目问题、文献、PDF 定位、批注、证据审阅和写作约束**。Hermes 值得借鉴的是项目级工作区、软切换、窄 Electron 权限边界和并排上下文；Zotero 值得借鉴的是批注回原页；PaperQA 值得借鉴的是带页码的证据上下文。模型能力只能放在证据闭环之上，不能替代真实检索或用户审阅。

## 源码项目对照（抄什么 / 不抄什么 / 改什么）

| 项目（官方仓库） | 抄什么：可迁移原则 | 不抄什么 | Selenyx 的科研改造 |
|---|---|---|---|
| [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | 项目是工作区抽象；三层边界（Electron / Renderer / Headless runtime）；软切换时清理旧上下文；主工作区与右侧预览并列 | 不复制通用编码 Agent 的终端、文件树和云账户主线 | 左栏改为八段科研流水线；右栏只展示当前文献、批注、检索或证据上下文；项目切换恢复独立 workspace.json |
| [MoonshotAI/kimi-cli](https://github.com/MoonshotAI/kimi-cli) | Runtime、Agent、UI、Wire 事件分层；UI 消费结构化事件而不是读取内部执行状态 | 不移植 CLI shell，也不让子代理自由递归 | Renderer 只消费窄 IPC；最多 10 个科研阶段代理；只回流结构化结果 |
| [zotero/reader](https://github.com/zotero/reader) | 阅读器是独立边界；批注保留页码/位置；批注列表可返回 PDF 上下文 | 不复制 Zotero 完整数据库、同步和引文生态 | PDF 文本层记录 text item 范围；重启重绘高亮；右栏批注跳回页码；证据记录原文、来源和定位 |
| [logseq/logseq](https://github.com/logseq/logseq) | 隐私优先、本地知识、PDF 批注与任务可连接；侧栏项目可配置 | 不采用块编辑器作为全部交互原语 | 项目本地持久化；批注进入证据链而非孤立笔记；科研阶段是固定语义，不让插件改变诚信规则 |
| [siyuan-note/siyuan](https://github.com/siyuan-note/siyuan) | 本地优先、桌面多栏、可恢复工作区、清晰的文档/上下文分区 | 不引入复杂块数据库和同步服务器 | 继续使用版本化 JSON + 原子写入；栏宽、折叠、最后页面和 PDF 阅读位置按项目恢复 |
| [future-house/paper-qa](https://github.com/Future-House/paper-qa) | 本地 PDF 索引、元数据交叉来源、证据上下文带页码、回答必须有行内引用 | 不在无 Key 时运行伪 RAG，也不默认上传本地论文 | L1 保留选区与页码；L2 以后只能读取用户允许的证据；未审阅证据不进入写作 |
| [stanford-oval/storm](https://github.com/stanford-oval/storm) | 先形成问题与不同视角，再检索、提纲、写作；长任务保留人类介入 | 不模拟专家对话来制造“共识” | 新建项目必须填写核心问题并离线生成路径；导航开放，但空问题不会被伪装成已立项 |
| [khoj-ai/khoj](https://github.com/khoj-ai/khoj) | 从本机文档到联网资料平滑扩展；本地/在线模型可替换 | 不默认建设个人云端“第二大脑” | 本地收藏与 PDF 始终可离线；联网只负责真实来源发现；BYOK 单独授权 |
| [open-webui/open-webui](https://github.com/open-webui/open-webui) | 引文可跳到文档片段；侧栏和设置持久化；失败引文不能拖垮界面 | 不复制聊天优先的信息架构和管理后台 | 对话降为研究工具；主流程从问题开始；错误 Key、0 结果和来源失败逐项显示 |
| [Mintplex-Labs/anything-llm](https://github.com/Mintplex-Labs/anything-llm) | 桌面本地文档、拖入资料、来源引用、可选本地模型 | 不引入遥测，也不把向量库当作“已理解文献” | 当前先做好 PDF 导入、查找、批注和证据定位；后续索引必须可删除、可解释且默认本地 |
| [opendatalab/MinerU-Document-Explorer](https://github.com/opendatalab/MinerU-Document-Explorer) | 文档目录、分段读取、文内查找、表图提取分别作为明确工具；云端解析是可选项 | 不把需要模型/API Key 的解析冒充离线能力 | 本轮先加入本地 PDF 页码跳转、适宽、旋转、逐页查找；复杂版面/OCR 明示为后续可选适配器 |
| [allenai/pawls](https://github.com/allenai/pawls) | PDF 标注以页面几何和结构为一等定位信息 | 不引入面向数据集标注团队的服务器工作流 | 当前文本 PDF 保存 text item 定位；扫描件没有文本层时明确只能阅读，未来再加 OCR/框选定位 |
| [CherryHQ/cherry-studio](https://github.com/CherryHQ/cherry-studio) | 桌面提供方管理、模型切换、紧凑侧栏与设置中心 | 不把 300+ 助手或模型目录作为首页 | CCSwitch 式提供方管理保留，但科研流水线先于模型；Key 只进系统安全存储 |
| [onyx-dot-app/onyx](https://github.com/onyx-dot-app/onyx) | 搜索、文档和引用是独立可观测步骤；连接器有真实状态 | 不引入企业权限、云连接器与服务器部署负担 | 每个文献源显示真实完成/0/限流/失败/跳转状态；Renderer 不直接访问网络 |

## 直接落地的决策

1. **创建项目**：名称与核心研究问题同屏必填；主进程一次性创建项目和离线研究路径，避免“创建成功但路径没保存”的半状态。
2. **左栏顺序**：研究问题 → 发现文献 → 获取全文 → 筛选收藏 → 精读批注 → 证据审阅 → 综合路径 → 证据写作；图表、实验、对话放到研究工具区。
3. **PDF 复核**：页码、缩放、旋转按文献持久化；批注保存文本层 item 范围；重新打开时恢复高亮；右栏批注可返回原页。
4. **文内工作**：加入页码跳转、适合宽度、旋转、逐页查找。扫描 PDF 无文本层时不假装可搜索。
5. **视觉**：只保留纸白、暖灰、朱砂与墨色；桌面图标改为小尺寸仍可识别的“朱砂月牙 + 墨色星标”，Windows 使用多分辨率 ICO。
6. **保持边界**：不增加云账户、遥测、远程字体、CDN、React 或外部数据库；不声称完整 PDF 编辑器、OCR 或跨设备同步已经实现。

## 许可证与实现边界

本轮只采用公开产品原则和信息架构，没有复制上述仓库的源代码、图标或截图。Selenyx 继续使用自己的原生 HTML/CSS/ES Modules 实现；Nature Skills 的既有适配仍按仓库内第三方声明和固定 commit 管理。
