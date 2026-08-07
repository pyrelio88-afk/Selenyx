# Selenyx 科研工作台

> 本地优先 · 原生桌面应用 · 可离线使用的科研工作区

Selenyx 将文献管理、PDF 阅读与标注、研究项目、统计工具、学科资料和 AI 辅助整合在同一个本地工作区。桌面版把前端和本地 FastAPI 服务一起运行；项目数据默认只保存在本机。当前界面状态保存在应用本地存储并可创建原生备份，SQLite 是本地服务的数据层，资料库的完整迁移仍在进行中。

## 推荐使用方式：原生桌面应用

桌面端是当前的主要交付与验证方式。请在仓库根目录运行：

```powershell
npm install
npm run desktop:doctor

# 仅在需要配置自己的 LLM 服务时创建；真实密钥不要提交到 Git
Copy-Item backend/.env.example backend/.env.local

npm run desktop:dev
```

`desktop:doctor` 只检查 Rust 和 Windows MSVC 等本机前置条件，不会自动安装系统软件。`desktop:dev` 会启动原生 Tauri 窗口，并同时管理 Vite 与仅监听 `127.0.0.1:8770` 的本地服务；无需另开浏览器或手动启动 FastAPI。

构建本机安装包：

```powershell
npm run desktop:doctor
npm run desktop:build
```

构建产物位于 `desktop/target/release/bundle/`。Windows 的 NSIS 安装包按当前用户安装，不要求管理员权限；它内置 WebView2 离线安装程序，因此安装 WebView2 时不依赖网络，但安装包会明显增大。

如需把经校验的 Ollama Windows 安装器作为**可选资源**带入 Windows 包，显式运行：

```powershell
npm run desktop:build:with-ollama
```

该命令才会下载约 1.46 GiB 的上游 `OllamaSetup.exe`，并以固定版本、精确大小和 SHA-256 校验后放入 Windows 专用 Tauri 资源。普通 `desktop:build` 不下载也不捆绑它；应用不会静默执行该安装器，分发前仍须核对 Ollama 的上游许可与分发条款。

详见 [BUILD.md](BUILD.md)。

## 功能概览

- 本地项目与研究流水线：从问题、检索、阅读、证据到写作的可追踪工作区。
- 文献库：手动录入、BibTeX/RIS 导入/导出、Crossref 检索、从本机 Zotero 的显式只读导入、去重、引用格式与本地附件预览。
- PDF 与笔记：本地阅读、标注、摘录和与项目关联的笔记。
- 离线 OCR：随应用携带 Tesseract.js 运行时、四种设备能力适配核心与 `chi_sim`/`eng` 轻量模型；扫描件识别不依赖 CDN。
- 分析与资料：统计计算、图表、研究框架、学科术语、公式与规范资料。
- AI 助手：由用户显式配置自己的服务；没有配置密钥时，本地非 AI 功能仍可使用。

## 平台边界

### 桌面端

Windows、macOS 和 Linux 的桌面打包目标共用同一套前端。桌面版会随安装包携带与当前平台匹配的本地后端 sidecar，数据保存在本机的 Selenyx 数据目录中。

### Android（设备本地/离线核心）

Android 不是桌面端的联网伴侣。它不会打包或运行桌面 Python sidecar，不会读取或同步桌面 SQLite 数据，也没有已交付的设备配对、账号同步或局域网访问流程。因此，移动端当前仅以设备本地存储和不依赖 API 的离线核心界面为范围；依赖桌面后端、LLM 或桌面资料库的能力不能视为可用。

当前版本不支持把 `VITE_API_BASE_URL` 指向电脑来作为正式方案；在完成显式配对、身份校验、TLS 与断连处理之前，电脑—手机局域网协作不开放。iOS 尚无构建、签名或发布交付，本文档不宣称提供 iOS 应用。

## 浏览器前端（仅用于开发调试）

`npm run dev` 只启动前端开发服务器，用于界面调试；它不是推荐的日常使用方式。需要调试 API 时，可另开终端执行 `npm run backend:dev`，再运行 `npm run dev`。`npm run build` 仅产出前端静态文件，不等同于包含本地 sidecar 的桌面安装包。

## 数据与隐私

- 当前项目、文献、笔记和界面状态保存在应用本地存储中；桌面版可创建本机恢复点和 JSON 导出。SQLite 本地资料库迁移在进行中，尚不能把它宣称为全部业务数据的唯一来源。
- LLM 密钥应放在 `backend/.env.local`（开发）或桌面应用数据目录下的本地配置中，绝不写入前端构建产物或提交到仓库。
- OCR 的第三方许可随资源保存在 `frontend/public/ocr/licenses/`；`npm run offline:check` 会校验其版本、大小和 SHA-256。
- 所有联网请求都应由用户主动触发，例如元数据检索或已配置的 AI 对话。

### 可选：从本机 Zotero 导入

在 Zotero 的“设置 → 高级”中启用“允许同一台计算机上的其他应用与 Zotero 通信”，然后在桌面版文献库点击“导入 Zotero”，检查候选预览后再确认复制。Selenyx 只通过 Zotero 的 loopback Local API 读取顶层条目，绝不读取其 SQLite 文件、不会上传或写回数据；附件、笔记和批注会明确跳过。详见 [Zotero Local API 文档](https://www.zotero.org/support/dev/web_api/v3/local_api)。

## 开发与贡献

提交前运行：

```powershell
npm run verify:local
npm run backend:test
```

贡献约定见 [CONTRIBUTING.md](CONTRIBUTING.md)，构建与平台说明见 [BUILD.md](BUILD.md)。

## License

MIT
