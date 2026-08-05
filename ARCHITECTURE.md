# Selenyx 架构决策：一个项目，按功能选最适配的语言

> 2026-08-06 定稿。响应用户指示：「一个完整项目，那个功能最适配那个语言用哪个，但是不能是乱七八糟的这一个哪一个的」。

## 决策

**Selenyx 只有这一个项目（selenyx-next）。** 旧版 JS 单文件版（17,238 行）与 Java/JavaFX 版（11,072 行）已归档为参考实现（`_archive/`），不再迭代。所有新功能只在本仓库落地。

本项目是一个**连贯的单一产品**，不是多个语言各做一个。语言按功能层选择，每层一个最适配的语言，层间以明确契约（HTTP/JSON、Tauri IPC）衔接：

| 功能层 | 语言 / 框架 | 为什么是它（GitHub 证据） |
|---|---|---|
| 前端 UI（多维表格、PDF 阅读、批注、看板） | TypeScript + React 19 + Vite | 交互密集型桌面级 UI 的最成熟生态。Zotero（JS）、JabRef 之外几乎所有现代文献/知识工具（Logseq TS、AFFiNE TS、Outline TS）均用 TS；`pdfjs-dist`、`react-*` 拖拽/表格生态只存在于 JS/TS 世界 |
| 后端服务（LLM 编排、文献 API 聚合、持久化） | Python + FastAPI + SQLModel | 科研与 LLM 工具链生态在 Python：Crossref/OpenAlex 客户端、PDF 解析（pypdf/pdfminer）、LLM SDK 官方支持最全。HydraLab（微软开源移动测试平台）生产验证了「TS 前端 + Python 后端 + Rust 端侧」同构栈 |
| 桌面/移动端壳（分发、原生能力） | Rust + Tauri v2 | Tauri 以 Rust 核心 + 系统 WebView 复用前端产物，安装包与内存占用比 Electron 小一个数量级；同一套 TS 前端零改动进壳 |

## 为什么不是全 Java

JabRef（GitHub 3k+ stars，JavaFX 文献管理器）证明 Java **可以**做这类工具，我们认真评估过（2026-08-06 深度检索 JabRef 官方架构文档：model/logic/gui 分层、事件总线、BibTeX 文本库）。但整条产品线全押 Java 的代价：

- 切断 `pdfjs-dist`（PDF 渲染/文本层/批注坐标）这一不可替代依赖——Java 侧 PDFBox 无等价交互层
- 切断 React 表格/看板/画廊视图生态，多维表格需从零自绘
- LLM SDK 与科研数据源客户端在 Java 生态更新滞后于 Python

结论：Java 不是本项目的最适配语言，Java 版归档保留为功能对照参考（BibTeX/RIS 导入导出、护理学数据库内容已反向移植进主线）。

## 目录结构（单一项目，单一 git 历史）

```
selenyx-next/
  frontend/    TypeScript + React + Vite + Zustand   （唯一 UI）
  backend/     Python + FastAPI + SQLModel           （唯一服务）
  desktop/     Rust + Tauri v2                        （唯一壳，复用 frontend 产物）
  ARCHITECTURE.md   本文件
```

## 工程规则

1. 新功能只进 selenyx-next；禁止再开平行语言版本。
2. 每层只用一个语言，跨层只走契约（OpenAPI/JSON、Tauri IPC），不互相渗透。
3. 每轮迭代 git tag 快照；评测只用外部项目/工具标准，不自评。
4. GitHub push 锁死，等用户明示「允许发布」。
