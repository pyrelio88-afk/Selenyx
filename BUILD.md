# Selenyx 本地前后端构建与平台边界

Selenyx 的完整交付物是 Tauri 2 桌面应用：React/Vite 提供交互层，本机 FastAPI sidecar 提供 SQLite、RAG、学术连接器、证据链与密钥网关。浏览器存储作为离线缓存与降级路径，与 SQLite 通过显式仓库层同步对账。

`frontend/` 是应用界面，`backend/` 是只监听 loopback（`127.0.0.1:8770`）的本机服务，`desktop/` 负责把两者封装为原生桌面安装包并托管子进程生命周期。

## 1. 本地开发

在仓库根目录执行：

```powershell
npm install
npm run dev:local
```

`npm run dev:local` 同时启动 FastAPI 与 Vite，是完整功能的开发入口。`npm run dev` 只启动前端，适合验证后端离线时的降级行为。

## 2. 前端按需分包构建与预览

```powershell
npm run build
npm --workspace @selenyx/frontend run preview
```

构建输出位于 `frontend/dist/`。默认采用标准多 chunk 分包模式（核心壳层极速启动，PDF 阅读器、ECharts 图表、统计计算器与学科资料库按需异步加载）。若特殊场景需要单 HTML 文件归档，可显式设置环境变量 `VITE_SINGLEFILE=1 npm run build`。

## 3. 完整桌面应用构建（Windows EXE / macOS / Linux）

桌面构建会先通过 PyInstaller 生成 Python sidecar，再由 Tauri 打包前端静态产物与本机后端。需要对应平台的 Rust 与 Python（`uv`）工具链：

```powershell
npm run desktop:doctor
npm run desktop:build
```

安装包输出位于 `desktop/target/release/bundle/`（Windows NSIS `*-setup.exe` 与 MSI）。桌面壳在主窗口退出时会自动关闭仙鹤桌宠副窗并清理 `selenyx-backend` 子进程树，避免端口残留占用。

Windows 可显式制作含 WebView2 离线引导器的能力包：

```powershell
npm run desktop:build:offline-pack
```

> **体积与纯净边界**：任何构建均**不附带** Ollama 安装器或本地大模型权重。用户可在「设置 → 模型」中接入任意兼容 OpenAI / Anthropic / Google / 本地 Ollama 或本机网关服务。

## 4. 离线 OCR 资源校验

`frontend/public/ocr/` 随前端构建复制为 `frontend/dist/ocr/`，包含 Tesseract.js 运行时、WASM 核心以及 `chi_sim`、`eng` 模型。运行时仅加载同源本地资源，绝不外连 CDN：

```powershell
npm run offline:check
```

## 5. 本地数据与密钥安全边界

- SQLite 默认位于 `~/.selenyx/selenyx.sqlite3`（启用 WAL 与 `busy_timeout`）。
- 长期 API 密钥仅存于本机 `~/.selenyx/.env.local` 或 `backend/.env.local`，**永不**打入前端可分发构建产物。
- `desktop/Cargo.lock` 与根目录 `package-lock.json`、`backend/uv.lock` 为唯一锁文件基线（子工作区不再保留重复锁文件）。

## 6. 发布前全量验证

```powershell
npm run typecheck
npm run lint
npm test
npm run backend:test
npm run verify:local
```
