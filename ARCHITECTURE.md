# Selenyx 架构：前端交互 + 本地后端服务

> 2026-08-07 修订。纠正「纯静态」偏航：完整科研工作台需要本地后端承担 RAG、学术 API、数据库与密钥网关；前端负责交互与离线降级。

## 决策

**Selenyx = 本地优先的前后端一体工作台。**

| 层 | 技术 | 职责 |
|---|---|---|
| 前端 | React 19 + TypeScript + Vite + Zustand | 交互、文献/项目 UI、PDF/OCR、统计图、流水线；浏览器存储作缓存与降级 |
| 后端 | FastAPI + SQLModel + SQLite | 持久化、RAG 向量/混合检索、学术连接器、证据链、Zotero 本地 API、LLM 密钥网关 |
| 桌面壳 | Tauri v2 + Python sidecar (`127.0.0.1:8770`) | 分发、拉起本机后端、原生文件能力 |

## 科研闭环（证据门）

```text
立题 → 真检索(API) → 获取全文 → 导入 PDF → 阅读批注
→ 证据链(accept) → 综合 → 写作(仅 accepted 证据)
```

本地 RAG（hybrid）：

- 默认 **hashing embedding**（无模型下载，永远可用）
- 可选 **OpenAI 兼容 /embeddings**（Ollama `nomic-embed-text` 等）
- 检索结果带 `page` / `charOffset` / `excerpt`，禁止编造引用

学术连接器（抄 OpenScience/Runcell 的诚实性）：

- OpenAlex（mailto 礼貌池）/ Crossref / PubMed / arXiv
- 宿主级 rate limit；429 与 0 结果如实上报
- 相关文献：PubMed ELink

## 目录

```text
selenyx/
  frontend/     React 交互层
  backend/      FastAPI 服务（selenyx_backend）
  desktop/      Tauri 壳 + sidecar
  docs/         需求账本与流水线说明
  scripts/      构建与校验
```

## 数据与密钥边界

1. SQLite 默认 `~/.selenyx/selenyx.sqlite3`
2. 密钥只进 `backend/.env.local` 或 `~/.selenyx/.env.local`（`SELENYX_LLM_*`），**永不**进前端构建产物的长期分发
3. 开发可用 Vite proxy：`/api` → `127.0.0.1:8770`
4. 后端不可用时前端仍可读本地 Zustand/localStorage，功能降级而不是白屏

## 开发命令

```powershell
npm run dev:local     # 同时起后端 + 前端
npm run backend:test
npm run verify:local
```

## 工程规则

1. 空壳 UI = Critical（按钮必须有真实 handler 与可验证结果）
2. 写作提纲只能来自 `review=accepted` 的证据
3. GitHub push 需用户明确授权
4. 不把 skill 超市做成主导航；能力折叠进八段流水线
