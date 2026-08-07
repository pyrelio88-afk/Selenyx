# 贡献指南（Contributing to Selenyx）

Selenyx 是本地优先的纯前端科研工作台。浏览器静态版本是日常开发与验收入口；可选的 Tauri 壳复用同一份前端产物。Android 属于设备本地、离线核心范围，不是桌面端的同步伴侣。

## 开发环境

| 层 | 技术栈 | 目录 |
|---|---|---|
| 应用 | React + TypeScript + Vite + Zustand | \`frontend/\` |
| 本地持久化 | 浏览器 \`localStorage\` / \`IndexedDB\` | 浏览器或 WebView 配置文件 |
| 可选原生壳 | Tauri v2 + Rust | \`desktop/\` |

首次准备和本地开发：

\`\`\`powershell
npm install
npm run dev
\`\`\`

构建与静态预览：

\`\`\`powershell
npm run build
npx serve frontend/dist
\`\`\`

若需要本地开发变量，复制 \`frontend/.env.example\` 为 \`frontend/.env.local\`。不要提交真实密钥；所有 \`VITE_*\` 变量会被编译进浏览器产物，不能作为生产秘密保存。

## 提交前检查

在仓库根目录运行：

\`\`\`powershell
npm run typecheck
npm run test
npm run build
npm run offline:check
npm run verify:local
\`\`\`

改动原生壳、打包脚本或原生权限时，再运行：

\`\`\`powershell
npm run desktop:doctor
npm run desktop:build
\`\`\`

若系统策略阻止本机安装包构建，请记录原始报错和系统环境；不要通过关闭安全策略来绕过验证。

## 代码与数据约定

- 共享前端状态统一通过 Zustand store 管理；持久化读取应通过 \`frontend/src/lib/storage.ts\` 的版本迁移层。
- 统计和数学函数集中在 \`frontend/src/lib/stats.ts\`，以可复算的参考值测试，不在视图层复制实现。
- 新功能默认离线可用；联网必须由用户显式触发，禁止隐式遥测或后台上传。
- 所有学科术语、公式、标准和文献元数据都应提供可核查来源，不能凭记忆编造。
- 任何 \`.env.local\`、用户导入文件、导出文件和浏览器数据都不能提交。
- 通过 \`import.meta.env\` 读取第三方配置，禁止在源码、测试快照、示例或文档中写入真实密钥。
- 修改 Rust/Tauri 依赖时，\`desktop/Cargo.lock\` 必须随同提交，保证原生壳构建可复现。

## 平台边界

- 桌面壳与浏览器版使用相同的静态前端和本机存储语义。
- Android 不提供已交付的局域网配对、数据同步或远程访问协议；不要将电脑地址写入移动端环境变量来作为正式功能。
- iOS 当前没有交付承诺；不要在 issue、文档或界面中把它表述为已支持的平台。

## 提交信息与讨论

使用清晰、可检索的提交主题，例如 \`feat(references): preserve exported citations\` 或 \`fix(offline): keep OCR assets available\`。

提交 issue 时请附上复现步骤、平台、应用版本、相关日志以及已脱敏的错误信息。涉及外部服务时不要粘贴真实密钥。
