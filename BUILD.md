# Selenyx 静态构建与平台边界

Selenyx 的默认交付物是纯前端静态单页应用：React/Vite 生成浏览器可直接托管的文件，业务数据仅保留在设备本地的 \`localStorage\` 和 \`IndexedDB\` 范围内。它不依赖托管协作平台，也不需要常驻服务或本机数据库进程。

\`frontend/\` 是应用界面和静态资源；\`desktop/\` 是可选的 Tauri 原生壳，复用同一份前端构建产物。

## 1. 本地开发

在仓库根目录执行：

\`\`\`powershell
npm install
npm run dev
\`\`\`

\`npm run dev\` 只启动 Vite 本地开发服务器。它是正常的开发和功能验证入口，不要求额外运行时。

## 2. 构建与静态预览

\`\`\`powershell
npm run build
npx serve frontend/dist
\`\`\`

构建输出位于：

\`\`\`text
frontend/dist/
\`\`\`

\`npx serve frontend/dist\` 用 HTTP 提供构建产物，适合验证正式静态运行方式。不要用 \`file://\` 直接打开页面：PDF、OCR 等 Web Worker 资源需要同源 HTTP 环境。静态站点可部署到任何普通文件托管或静态站点服务中；应用数据仍保存在访问该站点的设备与浏览器配置文件内。

## 3. 可选原生壳

Windows、macOS 和 Linux 的原生壳复用 \`frontend/dist/\`，不改变前端的数据归属。若要修改或构建原生壳，需要对应平台的 Rust 工具链；先检查环境再构建：

\`\`\`powershell
npm run desktop:doctor
npm run desktop:build
\`\`\`

安装包输出通常位于 \`desktop/target/release/bundle/\`。Windows 打包使用当前用户安装模式；实际发布前应在目标平台验证首次启动、浏览器/WebView 本地数据持久化、导入导出和离线 OCR。

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

- 工作区状态、JSON 备份和聊天缓存都应由用户在本机管理；定期导出 JSON 以获得可移植备份。
- \`.env\` 和 \`.env.local\` 不应提交。前端开发变量使用 \`frontend/.env.local\`，样例见 \`frontend/.env.example\`。
- 源码通过 \`import.meta.env\` 读取公开构建配置。Vite 会把所有 \`VITE_*\` 值写入最终的浏览器文件，因此这些变量不能保存长期生产密钥。
- \`desktop/Cargo.lock\` 是原生壳依赖锁定文件；修改原生壳依赖时必须一并提交，以保证构建可复现。

## 7. CI 与发布前验证

静态版本的基础验证：

\`\`\`powershell
npm run typecheck
npm run test
npm run build
npm run offline:check
npm run verify:local
\`\`\`

发布原生壳时，再在目标平台运行 \`npm run desktop:doctor\` 和 \`npm run desktop:build\`。工作流产物不等于已验收发布；发布前仍应实际检查数据持久化、导入导出、离线 OCR 和主流程可用性。
