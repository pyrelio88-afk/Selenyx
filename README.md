# Selenyx 科研工作台

> 本地优先 · 纯前端单页应用 · 可离线使用的科研工作区

Selenyx 把文献管理、PDF 阅读与标注、研究项目、统计工具、学科资料和 AI 辅助集中在一个浏览器本地工作区中。运行时不需要常驻服务：项目、文献、笔记、表格和界面设置保存在当前设备的浏览器存储中（以 \`localStorage\` 为主；支持 \`IndexedDB\` 的功能只使用本机缓存）。

## 快速开始

在仓库根目录运行：

\`\`\`powershell
npm install
npm run dev
\`\`\`

开发服务器默认只监听本机。打开终端给出的地址即可使用完整的本地工作区；不需要启动额外进程。

## 构建并以静态站点运行

\`\`\`powershell
npm run build
npx serve frontend/dist
\`\`\`

\`npm run build\` 生成可静态托管的 \`frontend/dist/\`。请用 HTTP 静态服务器打开它，而不是直接双击 \`index.html\`：PDF Worker、OCR Worker 和其他浏览器资源需要正常的同源 HTTP 上下文。

## 功能概览

- 本地项目与研究流水线：从问题、检索、阅读、证据到写作的可追踪工作区。
- 文献库：手动录入、BibTeX/RIS 导入和导出、去重、引用格式与本地附件预览。
- PDF 与笔记：本地阅读、标注、摘录和与项目关联的笔记。
- 离线 OCR：随构建携带 Tesseract.js 运行时与 \`chi_sim\`/\`eng\` 轻量模型；扫描件识别不依赖 CDN。
- 分析与资料：统计计算、图表、研究框架、学科术语、公式与规范资料。
- AI 助手：只在用户明确配置并发起请求时访问所选模型服务；未配置时，其余本地功能照常可用。

## 数据与隐私

- Selenyx 不要求账号，也不把工作区同步到云端。清除浏览器站点数据会清除该设备上的工作区；请定期使用应用内 JSON 导出功能备份。
- OCR 运行时和语言模型位于 \`frontend/public/ocr/\`，构建后原样复制到 \`frontend/dist/ocr/\`。可运行 \`npm run offline:check\` 校验版本、大小和 SHA-256。
- 联网元数据检索和 AI 对话均由用户动作触发；不会进行隐式遥测或后台上传。

## 环境变量与密钥

前端配置样例在 [frontend/.env.example](frontend/.env.example)。如需本地开发配置，请复制为 \`frontend/.env.local\`：

\`\`\`powershell
Copy-Item frontend/.env.example frontend/.env.local
\`\`\`

第三方配置只应从 \`.env.local\` 经 \`import.meta.env\` 读取，绝不写死在源码或提交到 Git。重要限制是：Vite 会把所有以 \`VITE_\` 开头的变量编译进浏览器产物。因此 \`VITE_*\` **不是秘密存储**；只能放公开配置、短期开发测试密钥或权限严格受限的本地密钥，不能放可长期使用的生产密钥。

## 平台边界

Windows、macOS 和 Linux 可以使用同一份静态前端产物包装为可选的原生壳；它们仍使用设备本地浏览器/WebView 存储。Android 也是设备本地范围，不提供账号同步、局域网配对或把电脑作为数据源的能力。iOS 目前没有构建、签名或发布承诺。

## 开发与贡献

提交前运行：

\`\`\`powershell
npm run verify:local
\`\`\`

贡献约定见 [CONTRIBUTING.md](CONTRIBUTING.md)，静态构建与平台说明见 [BUILD.md](BUILD.md)。

## License

MIT
