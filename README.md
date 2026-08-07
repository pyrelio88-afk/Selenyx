# Selenyx 科研工作台

> 本地优先 · 前端交互 + 后端 RAG/API/SQLite · 八段证据门科研流水线

Selenyx 把文献管理、PDF 阅读与标注、研究项目、统计工具、学科资料和 AI 辅助集中在一个本地工作区。  
**推荐开发路径**同时启动前端与本地后端：后端负责向量/混合检索、学术 API、证据链与密钥网关；前端负责交互，并在后端不可用时降级到浏览器本地存储。

## 快速开始

```powershell
npm install
npm run dev:local
```

- 前端：`http://127.0.0.1:5173`（`/api` 代理到后端）
- 后端：`http://127.0.0.1:8770/api/health`

仅前端（无 RAG/学术网关）：

```powershell
npm run dev
```

## 后端与密钥

复制并编辑（已 gitignore）：

```powershell
Copy-Item backend\.env.example backend\.env.local
```

常用变量：

| 变量 | 含义 |
|---|---|
| `SELENYX_LLM_BASE_URL` | OpenAI 兼容网关，如 Agnes `https://apihub.agnes-ai.com/v1` |
| `SELENYX_LLM_API_KEY` | 仅后端读取 |
| `SELENYX_LLM_MODEL` | 如 `agnes-2.5-flash` |
| `SELENYX_EMBED_*` | 可选稠密向量（Ollama embeddings） |

## 功能概览

- 八段流水线：问题 → 检索 → 全文 → 筛选 → 精读 → 证据 → 综合 → 写作（仅 accepted 证据）
- 文献库：导入/导出 BibTeX·RIS、去重、DOI/PMID、Zotero 本地 API 只读导入
- 本地 RAG：hybrid hashing + 可选 dense；结果带 excerpt/页码/字符偏移
- 学术连接器：OpenAlex / Crossref / PubMed / arXiv（限流 + 诚实空结果）
- PDF/OCR、统计与图表、学科资料、AI 助手（BYOK / 后端网关）

## 验证

```powershell
npm run backend:test
npm run verify:local
```

架构见 [ARCHITECTURE.md](ARCHITECTURE.md)，需求账本见 [docs/REQUIREMENTS-LEDGER.md](docs/REQUIREMENTS-LEDGER.md)。

## License

MIT
