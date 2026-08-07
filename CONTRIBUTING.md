# 贡献指南（Contributing to Selenyx）

Selenyx 是本地优先的科研工作台。当前开发与验收以**原生桌面应用**为中心；浏览器页面只用于前端调试，Android 仅有设备本地/离线核心范围，不是桌面伴侣。

## 开发环境

| 层 | 技术栈 | 目录 |
|---|---|---|
| 前端 | React + TypeScript + Vite + Zustand | `frontend/` |
| 本地服务 | FastAPI + SQLModel + SQLite | `backend/` |
| 桌面壳 | Tauri v2 + Rust | `desktop/` |

首次准备和桌面开发：

```powershell
npm install
npm run desktop:doctor

# 可选：只在需要自己的 LLM 服务时创建；不得提交真实密钥
Copy-Item backend/.env.example backend/.env.local

npm run desktop:dev
```

不要把 `npm run dev` 当作完整应用验收：它仅启动前端。需要浏览器方式排查 API 时，再显式运行 `npm run backend:dev`。

## 提交前检查

在仓库根目录运行：

```powershell
npm run typecheck
npm run test
npm run verify:local
npm run backend:test
npm run desktop:doctor
```

改动桌面壳、打包脚本或 sidecar 时，还应运行：

```powershell
npm run desktop:build
```

若系统策略阻止本机安装包构建，请记录原始报错和系统环境；不要通过关闭安全策略来绕过验证。

## 代码与数据约定

- 共享前端状态统一通过 Zustand store 管理；持久化读取应通过 `frontend/src/lib/storage.ts` 的版本迁移层。
- 统计和数学函数集中在 `frontend/src/lib/stats.ts`，以可复算的参考值测试，不在视图层复制实现。
- 新功能默认离线可用；联网必须由用户显式触发，禁止隐式遥测或后台上传。
- 所有学科术语、公式、标准和文献元数据都应提供可核查来源，不能凭记忆编造。
- `backend/.env.local`、任何 `.env.local`、数据库和用户附件都不能提交。
- 修改 Rust/Tauri 依赖时，`desktop/Cargo.lock` 必须随同提交，保证桌面构建可复现。

## 平台边界

- 桌面端可以使用本地 FastAPI sidecar，且只能监听本机回环地址。
- Android 不运行桌面 sidecar，也没有已交付的局域网配对、同步或远程访问协议；不要将电脑地址写入移动端环境变量来作为正式功能。
- iOS 当前没有交付承诺；不要在 issue、文档或界面中把它表述为已支持的平台。

## 提交信息与讨论

使用清晰、可检索的提交主题，例如 `feat(desktop): improve local startup diagnostics` 或 `fix(references): preserve exported citations`。

提交 issue 时请附上复现步骤、平台、应用版本、相关日志以及已脱敏的错误信息。涉及 API 时不要粘贴真实密钥。
