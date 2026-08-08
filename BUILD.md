# Selenyx 本地前后端构建与平台边界

Selenyx 的完整交付物是 Tauri 桌面应用：React/Vite 提供交互层，本机 FastAPI sidecar 提供 SQLite、RAG、学术连接器、证据链与密钥网关。浏览器存储是离线缓存和降级路径，不是完整版本的唯一数据源。

\`frontend/\` 是应用界面，\`backend/\` 是只监听 loopback 的本机服务，\`desktop/\` 负责把两者组成桌面应用。

## 1. 本地开发

在仓库根目录执行：

\`\`\`powershell
npm install
npm run dev:local
\`\`\`

\`npm run dev:local\` 同时启动 FastAPI 与 Vite，是完整功能的开发入口。\`npm run dev\` 只启动前端，适合验证后端离线时的降级行为，不包含 RAG、证据链或学术连接器。

## 2. 前端构建与降级预览

\`\`\`powershell
npm run build
npx serve frontend/dist
\`\`\`

构建输出位于：

\`\`\`text
frontend/dist/
\`\`\`

\`npx serve frontend/dist\` 只验证前端降级产物。不要用 \`file://\` 直接打开页面：PDF、OCR 等 Web Worker 资源需要同源 HTTP 环境。它不能替代完整桌面/RAG 验收。

## 3. 完整桌面应用

桌面构建会先生成 Python sidecar，再由 Tauri 打包前端与本机后端。需要对应平台的 Rust 与 Python/uv 工具链：

\`\`\`powershell
npm run desktop:doctor
npm run desktop:build
\`\`\`

安装包输出通常位于 \`desktop/target/release/bundle/\`。Windows 打包使用当前用户安装模式；实际发布前必须在目标平台验证 sidecar 健康、SQLite 重启持久化、RAG、导入导出与离线 OCR。

默认 Windows 包使用 Tauri 的小型 WebView2 下载引导模式，不附带 AI 模型、WebView2 离线安装器或 Ollama 安装器。目标机器尚无 WebView2 时，首次安装需要联网完成该系统前置依赖。

Windows 可显式制作离线能力包：

\`\`\`powershell
npm run desktop:build:offline-pack
\`\`\`

该命令才会准备约 1.46 GiB 的固定版本 Ollama 安装器并校验精确大小与 SHA-256，同时选择 Tauri 的 WebView2 离线前置包。能力包仍不包含任何 Ollama 模型权重；模型需由用户明确拉取。普通 \`desktop:build\` 不下载、不打包这些大资源。Selenyx 只会在 Windows 文件夹中定位 Ollama 安装器，绝不代替用户运行。旧命令 \`desktop:build:with-ollama\` 仅作为兼容别名保留。对外分发前需复核上游许可条款。

通过桌面 Junction 启动脚本时，发布脚本会先解析到真实物理目录，再将同一条规范路径交给 Node、Cargo 和 Tauri，避免同一仓库因 Desktop/OneDrive 两种路径产生重复缓存或 sidecar 资源错位。

## 4. 离线 OCR 资源

\`frontend/public/ocr/\` 随前端构建复制为 \`frontend/dist/ocr/\`，包含 Tesseract.js 运行时、四个兼容性核心以及 \`chi_sim\`、\`eng\` 的 \`4.0.0_best_int\` 模型。运行时只加载这些同源本地资源，不会回退到 CDN。

\`\`\`powershell
npm run offline:check
\`\`\`

该命令校验源码和构建产物中的文件大小及 SHA-256。相关 Apache-2.0 许可证位于 \`frontend/public/ocr/licenses/\`；替换资源时必须同步更新校验清单。

## 5. Android 的当前范围

Android 使用同一份前端能力，但当前只承诺设备本地、离线核心功能：

- 工作区保存在该设备自己的浏览器/WebView 存储中。
- 不提供账号同步、设备配对、局域网协作或远程控制。
- 不应把电脑地址写入移动端环境变量来充当正式能力。

不要把 Android APK 当成桌面端数据的同步端或远程控制器。iOS 当前没有构建、签名、发布或支持承诺。

## 6. 本地数据与环境变量

- SQLite 默认位于 \`~/.selenyx/selenyx.sqlite3\`；前端 localStorage 是离线缓存，两者需要通过仓库层显式对账。
- JSON 备份、聊天缓存和数据库都由用户在本机管理；定期做可验证的版本化导出。
- \`.env\` 和 \`.env.local\` 不应提交。前端开发变量使用 \`frontend/.env.local\`，样例见 \`frontend/.env.example\`。
- 源码通过 \`import.meta.env\` 读取公开构建配置。Vite 会把所有 \`VITE_*\` 值写入最终的浏览器文件，因此这些变量不能保存长期生产密钥。
- \`desktop/Cargo.lock\` 是原生壳依赖锁定文件；修改原生壳依赖时必须一并提交，以保证构建可复现。

## 7. CI 与发布前验证

基础验证：

\`\`\`powershell
npm run typecheck
npm run test
npm run backend:test
npm run build
npm run offline:check
npm run verify:local
\`\`\`

发布桌面应用时，再在目标平台运行 \`npm run desktop:doctor\` 和 \`npm run desktop:build\`。工作流产物不等于已验收发布；发布前仍应实际安装并检查 sidecar、数据持久化、导入导出、RAG、离线 OCR 和主流程。
