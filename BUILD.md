# Selenyx 桌面构建与平台边界

Selenyx 的主要交付物是本地原生桌面应用：Tauri v2 负责桌面壳，React/Vite 提供界面，FastAPI 与 SQLite 作为随桌面版运行的本地服务。它不依赖任何托管协作平台。当前项目和资料界面状态仍保存在应用本地存储，SQLite 统一资料库迁移尚未完成，文档不会把它误称为已全面接管。

`desktop/` 是 Tauri 工程；`frontend/` 是界面；`backend/` 是桌面版所需的本地服务。发布桌面版时，本地服务会作为与当前平台匹配的 sidecar 一起打包。

## 1. 桌面开发（推荐）

在仓库根目录执行：

```powershell
npm install
npm run desktop:doctor

# 可选：仅在需要配置自己的 LLM 服务时创建本机私有配置
Copy-Item backend/.env.example backend/.env.local

npm run desktop:dev
```

`desktop:doctor` 会检查构建所需的 Rust 工具链和 Windows 的 MSVC C++ Build Tools；它不会自行修改系统。`desktop:dev` 会先做同样的前置检查，再启动 Tauri 原生窗口、Vite 和本地 FastAPI 服务。请优先使用该命令，不要以 `cargo tauri dev` 或单独浏览器页面替代完整桌面开发链路。

本地后端只监听 `127.0.0.1:8770`。开发时的密钥放入 `backend/.env.local`；该文件被 Git 忽略，不能提交。

## 2. 构建桌面安装包

```powershell
npm run desktop:doctor
npm run desktop:build
```

构建脚本依次检查前置条件、打包当前平台的 FastAPI sidecar，并调用 Tauri 构建器。完成后的安装包位于：

```text
desktop/target/release/bundle/
```

不能用一个平台生成的 sidecar 去打另一个平台的安装包；Windows、macOS 和 Linux 应分别在对应平台或对应 CI runner 构建。

### Windows 安装器

- NSIS 安装器采用 `currentUser` 模式：默认写入当前用户范围，不要求管理员权限。
- Tauri 的 `offlineInstaller` WebView2 模式已启用：安装器内含 WebView2 离线安装程序，WebView2 安装阶段不需要联网。
- 离线 WebView2 会给安装器增加约百兆级体积；这是为离线可用性付出的明确体积成本。
- 生成安装包仍需要本机 Rust stable 和 Visual Studio C++ Build Tools。先运行 `npm run desktop:doctor` 查看缺失项。

当前 `bundle.targets` 仍保留各平台的默认格式；Windows 日常分发应优先选择 NSIS 安装包，以获得上述当前用户安装行为。

### 可选内置 Ollama Windows 安装器

默认的 `npm run desktop:build` 不会下载或捆绑 Ollama。若发布包确实需要携带上游 Windows 安装器，使用下面的显式命令：

```powershell
npm run desktop:build:with-ollama
# 等价写法：npm run desktop:build -- --with-ollama
```

此路径仅适用于 Windows：它会流式下载固定的 Ollama `v0.32.6` `OllamaSetup.exe`（`1,563,278,432` bytes，约 1.46 GiB），只有其 SHA-256 等于 `526e47db7c295d017e9514df5bb20c6f32b3d1170f2c8bb9c59b53185f5bd6ff` 时才会放入 `desktop/resources/ollama/` 并作为 Windows-only Tauri resource 打包。下载到缓存或校验失败的内容不会进入资源目录；`OllamaSetup.exe` 本身也被 Git 忽略，绝不会被意外提交。

资源清单位于 `desktop/resources/ollama/manifest.json`。该资源只被携带，不会被 Selenyx 静默执行；它仍是 Ollama 的上游安装器，发布者应在分发前独立审阅 Ollama 的适用许可和分发条款。可以用下面的无下载命令复核已准备的文件：

```powershell
npm run desktop:verify-ollama
```

## 3. 仅前端浏览器调试

```powershell
npm run dev
```

该命令只运行 Vite，适合排查界面问题，不会自动启动本地 FastAPI，也不会验证原生窗口、sidecar 或安装包。若要在浏览器中调试 API，再单独执行：

```powershell
npm run backend:dev
```

`npm run build` 只生成前端静态文件；它不是完整桌面应用发布流程。

## 离线 OCR 资源

`frontend/public/ocr/` 是随前端构建复制的离线 OCR 资源：Tesseract.js 运行时、四个兼容性核心以及 `chi_sim`、`eng` 的 `4.0.0_best_int` 模型。应用运行时只加载这些本地资源，不会回退到 CDN。构建后运行以下命令可同时校验源码和 `frontend/dist/` 中的每个文件大小与 SHA-256：

```powershell
npm run offline:check
```

相关 Apache-2.0 许可证随资源置于 `frontend/public/ocr/licenses/`。这些资源会增加桌面和 Android 构建体积；不要在未同步更新校验清单的情况下替换它们。

## 4. Android 的当前范围

仓库保留 Android 的 Tauri 配置与构建基础，但 Android 目前只应作为**设备本地、离线核心功能**的预览范围：

- 不包含、也不能运行桌面 FastAPI/Python sidecar。
- 不访问或同步桌面端 SQLite 数据。
- 没有已交付的配对、登录、TLS、断线恢复或局域网伴侣协议。
- 因此不支持通过 `VITE_API_BASE_URL` 把手机直接连到电脑作为正式能力；在完整配对链路通过验收前，该路径必须视为不可用。

不要把 Android APK 当作桌面版的远程控制器、资料同步端或带后端的完整替代品。iOS 当前没有构建、签名、发布或支持承诺。

## 5. 本地数据与密钥

- 桌面应用的业务数据默认保存在本机应用存储中，并可创建原生恢复点与 JSON 导出；SQLite 是同机本地服务的数据层，完整资料库迁移尚未完成。
- 开发环境的私有 LLM 配置使用 `backend/.env.local`；生产桌面环境使用本机应用数据目录内的私有配置。
- `.env`、`.env.local` 和数据库文件都不应提交。
- `desktop/Cargo.lock` 是原生依赖锁定文件，必须纳入版本控制，以保证桌面构建可复现。

## 6. CI 与发布前验证

仓库包含桌面与 Android 的 GitHub Actions 构建定义，但工作流产物不等于已验收发布。每次发布前至少应在目标平台完成：

```powershell
npm run verify:local
npm run backend:test
npm run desktop:doctor
npm run desktop:build
```

然后在实际桌面安装包中验证首次启动、应用数据持久化、导入导出和本地服务健康检查。Android 若重新启用交付，也必须单独验证其离线边界，不能假设桌面 sidecar 或局域网协作会自动可用。
