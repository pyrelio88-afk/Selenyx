# Selenyx 需求账本（Codex 交接 · 2026-08-07）

> 来源：用户与 Codex 多轮会话 + 本轮 Hermes 接管确认。空壳/坏功能 = Critical。

## 产品定位

本地优先的**完整科研工作台**：前端交互 + 后端 RAG/API/数据库；桌面可打包；手机后续。

## 红线

- 不要只做静态壳；用户明确「要后端」
- 不要 skill 超市主导航
- 不要编造文献 / 假 DOI / 假 stars
- 密钥不进可分发前端产物
- GitHub push 需授权

## Critical（先修）

| # | 需求 | 活树状态 | 本轮动作 |
|---|---|---|---|
| C1 | 文献导出不可用 | 已有导出预览+下载代码 | 加后端/单测回归；保证下载路径 |
| C2 | 导入文献无法删除 | store 有 `deleteReferenceAndRelations` | 删时清 RAG chunk；UI 确认 |
| C3 | 在线预览不可用 | Unpaywall + iframe | 保留外开 + 内嵌诚实失败 |
| C4 | 工具箱图标 | CSS 已补 desktop grid | 桌面改为图标网格入口 |
| C5 | 番茄钟旁时钟时区/高度 | 已用 Asia/Shanghai | 统一 minHeight 卡片 |
| C6 | Agnes API | models 200；chat 超时 | 接入 provider + 后端网关；报告实测 |

## 高优先级

| # | 需求 | 说明 |
|---|---|---|
| H1 | 项目名称优先，框架可选可折叠 | 10 类 Science/Nature 常用框架 |
| H2 | 文献库对标 Zotero | 导入/导出/去重/集合/本地 API 只读导入 |
| H3 | RAG 向量检索 | SQLite hybrid；摘要/笔记/粘贴文本可索引 |
| H4 | 证据门写作 | 仅 accepted |
| H5 | nature-skills 级技能 | 真实仓库映射；禁止虚标 32k stars |
| H6 | 标准规范内嵌原文 | fullText 展开 + 官方链接应用内预览 |
| H7 | 学科名词/数值/公式/标准量 | 目标：名词≥500/大类，数值≥100，公式≥100，标准≥20（中 60% 外 40%）— 分批扩充 |

## 验收烟测（3 分钟）

1. `npm run dev:local` → 健康检查 ok  
2. 新建项目：只填名称可创建；框架可折叠  
3. 导入 BibTeX → 删除成功  
4. 导出 BibTeX 可下载  
5. 语义检索命中本地摘要  
6. 证据 accept → 写作提纲引用  
7. 工具箱见图标  
8. 时钟显示「北京时间」  

## 明确不抄

- OpenScience 290 skill 导航 / 云钱包  
- 宣称知网全文 API  
- 静默假文献填充 429  
