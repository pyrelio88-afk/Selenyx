# 贡献指南（Contributing to Selenyx）

感谢你愿意为 Selenyx 做贡献。Selenyx 是一个本地优先、BYOK（Bring Your Own Key）的科研工作台，目标是让任何人接入自己的 LLM API 就能完成从选题到写作的八段科研流水线。

## 开发环境

| 层 | 技术栈 | 入口 |
|---|---|---|
| 前端 | React 19 + TypeScript + Vite 6 + Zustand 5 | `frontend/` |
| 后端 | FastAPI + SQLModel + async SQLite + Alembic | `backend/` |
| 桌面 | Tauri v2 | `desktop/` |

```bash
# 前端
cd frontend
npm install
npm run dev          # 本地开发
npm run typecheck    # tsc --noEmit（提交前必过）
npm run test         # Vitest 单测（提交前必过）
npm run build        # 构建单文件产物
```

## 提交前检查（硬性门槛）

1. **`npm run typecheck` 零错误** — 仓库开启 `strict` + `noUnusedLocals` + `noUnusedParameters`，不允许新增 `any` 于领域模型层（外部 API 边界如 LLM 响应解析除外，且应优先用 `unknown` + 收窄）。
2. **`npm run test` 全绿** — 统计计算（`src/lib/stats.ts`）的测试以 scipy 参考值为准；改动统计函数必须同步更新参考值（用 Python scipy 实算，禁止手算）。
3. **提交前运行 `npm run verify:local`** — 类型检查 → 测试 → 本地构建。不要绕过验证直接提交。
4. **本地优先原则** — 新功能默认离线可用；任何网络请求必须是用户显式触发（BYOK 对话、元数据抓取等），禁止隐式上报/遥测。

## 代码约定

- **共享状态一律走 Zustand store**（`stores/appStore.ts`，persist key `selenyx-v2`），视图组件零 props，禁止 prop drilling。
- **localStorage 读写必须经过 `src/lib/storage.ts`** 的版本化迁移层（schema versioning），新增/变更持久化字段时要登记迁移函数。
- 统计/数学函数集中放 `src/lib/stats.ts`，视图层不内联重复实现。
- 单文件构建（vite-plugin-singlefile）是当前部署形态；新增大型依赖前先评估包体（迁移触发线：gzip > 1.5MB 或功能模块 > 120）。

## 提交信息

格式：`R<轮次>: <主题>`（如 `R103: StatToolsView重构 + anova eta2`）。每轮自迭代打标签 `r<N>-<theme>`。

## 数据准确性红线

学科术语、统计公式、参考文献元数据属于**事实层**：不得凭记忆编造，必须有来源（source 字段）或可复算的验证路径。R90–R100 的数据质量战役（术语去重、同义反复清零、source 覆盖 100%）是基线，新增条目不得低于此标准。

## 提问与讨论

开 Issue 时请附：使用的 LLM provider、浏览器版本、复现步骤、控制台报错截图。Selenyx 仍处于密集自迭代阶段，接口与数据结构可能随轮次演进，CHANGELOG.md 记录了每轮变化。
