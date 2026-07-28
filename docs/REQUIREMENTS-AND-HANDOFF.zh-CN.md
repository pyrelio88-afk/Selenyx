# 你与 Codex 的完整需求台账 + 本轮落地

日期：2026-07-28  
仓库：`C:\Users\34043\Documents\Codex\2026-07-25\ni\selenyx-r06`  
版本：`0.8.0-rc.4`

## 1. 从 Codex 对话还原的真实需求

### 产品
- Selenyx = 跨学科科研助手（月亮意象，静谧/克制/可信）
- CLI（零依赖）+ Desktop（Electron 三平台）
- 中英双语

### 架构红线
1. 禁止换皮；先调研 kimi-code / pi / hermes / cc-switch / zotero / 小绿鲸
2. 证据链原语：主张-证据-置信度-矛盾；本地敏感数据；长链路协作
3. 子代理 ≤10，不可再生子代理
4. 翻译/批注/总结 L1 离线；LLM 只做 L2；无 Key 诚实降级

### 诚信红线
- 真检索、真调用；禁嵌必须明示 + 绕行
- 演示数据显著标注
- 完成 = commit + release/部署 ID + 验证清单

### 功能
1. 文献流：真联网 → 展示 → 阅读（批注/翻译/总结/证据）
2. 内置浏览器：添加/删除站点、关键词；禁嵌走系统浏览器
3. 技能：AIGC/查重/降重 L1 + 免责声明
4. 提供方管理（CC Switch 式 BYOK）
5. 设置 13 分区
6. 中国优先：PubScholar 等；Google Scholar 可内置；付费库可添加站点
7. Nature Skills 内置为研究路径

### 你反复强调的痛点（验收失败点）
- 「很多功能只是有但是无法使用，能看见但不能用」
- 文献检索不可用 / 结果看不见
- 浏览器：站点长时间未完成加载、无法稳定显示、无法添加站点
- 阅读模式/批注不能用
- 无法添加文献
- UI 难看，要参照 Hermes

## 2. GitHub 成熟项目对照（本轮深度检索）

| 项目 | 可抄 | 不抄 |
| --- | --- | --- |
| Zotero + translators | 本地库、元数据、批注归属 | 完整引用管理器 |
| Electron WebContentsView 文档 / #43802 | bounds 主进程控制、层叠视图 | 盲目 iframe 嵌 PDF |
| PDF.js in Electron（Nutrient/Apryse 博客） | 后续 PDF 阅读路线 | 现在先不引入重依赖 |
| claude-scholar | 证据门、claim 提升 | 不做成纯 skill 包 |
| OpenResearcher / Valsci | 主张验证链 | 不堆多智能体空壳 |
| nature-skills | 科研阶段切分 | 不做空技能墙 |
| Hermes Agent | 三栏工作台、诚实降级 | 不做通用 coding agent |
| OpenAlex/PubMed/Crossref | 真 API | 不抓登录墙 |

## 3. 根因与修复

| 症状 | 根因 | 修复 |
| --- | --- | --- |
| 检索有 20 条却像没结果 | `.empty-state{display:grid}` 覆盖 `[hidden]` | `[hidden]{display:none!important}` + 结果工具条 |
| 浏览器白屏/超时卸载 | 30s 超时 `detachBrowserView()` 直接卸掉页面 | 60s；超时仅 `slow` 提示，**不 detach** |
| 无法添加站点 | 弹窗交互弱、保存后无反馈 | 稳定 id 输入框、保存后立即打开 |
| 无法加文献 | 结果不可见 + 浏览器不能入库 | 结果收藏/批量收藏；**收藏当前页**（pageMeta） |
| 批注不能用 | 必须精确选中；未入库 | 摘要可选中；未选中回退；自动入库 |
| 安装包还是旧的 | rc.3 早于可用性补丁 | 升到 **rc.4** 并重建 |

## 4. 本轮代码改动重点文件

- `desktop/main.js` — 浏览器超时/pageMeta/reload
- `desktop/preload.js` — 暴露 pageMeta/reload
- `desktop/renderer/modules/browserWorkbench.js` — 工具条、添站、收藏当前页
- `desktop/renderer/modules/search.js` / `reader.js` / `app.js` / `styles.css`
- `src/research/workspace.js` — reset/rename/evidence relation
- `docs/architecture.svg`、`docs/OPEN-SOURCE-LESSONS.zh-CN.md`、`docs/REQUIREMENTS-AND-HANDOFF.zh-CN.md`

## 5. 怎么用（rc.4）

```bash
cd C:\Users\34043\Documents\Codex\2026-07-25\ni\selenyx-r06
npm test
cd desktop
npm start
# 或打包
npm run dist:win
```

推荐路径：
1. 科研浏览器 → PubScholar/Google Scholar/arXiv
2. 搜完点 **收藏当前页** → 本地文献库
3. 打开阅读 → 拖选摘要 → 批注/加入证据
4. 文献检索 → CRISPR → 卡片应直接可见 → 全部收藏
