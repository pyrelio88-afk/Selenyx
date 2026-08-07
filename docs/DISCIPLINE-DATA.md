# 学科数据扩充：开源对照与达标审计

> 2026-08-07。目标（用户账本）：每学科名词 ≥500 · 数值 ≥100 · 公式 ≥100 · 标准 ≥20（约 60% 国内 / 40% 国际）· 标准/红头可展开 `fullText`。

## 对照的开源/公开来源（抄结构，不整库搬运）

| 来源 | 吸收点 | 不抄 |
|---|---|---|
| [Yuan1z0825/nature-skills](https://github.com/Yuan1z0825/nature-skills) | 研究方法词表（RCT/系统综述/PRISMA/STROBE…） | skill 超市导航 |
| Zotero 本地库实践 | 本地优先、规范编码、集合思维 | 直接读 Zotero SQLite |
| EQUATOR Network（CONSORT/PRISMA/STROBE） | 报告规范条目 + 公开摘要 | 商业全文 |
| GB/T · WS/T 公开目录 | 国内标准代码/名称/机构 | 付费标准全文 |
| ISO / APA / ICMJE 公开页 | 国际规范元数据 | 版权全文 |
| OpenAlex Concepts（结构启发） | 学科概念节点可检索 | 整库镜像 |

## 生成与审计

```powershell
python scripts/generate_discipline_fill.py
cd frontend
npx tsx scripts/audit-disciplines.ts
```

填充文件：`frontend/src/data/expansion/fill_*.ts`  
合并入口：`frontend/src/data/expansion/index.ts`

## 诚实边界

- `fullText` 为**公开要点摘录**，点击可展开；完整红头/标准请走 `docUrl` 官方入口。
- 自动生成的「核心概念 NN」条目用于覆盖教学检索密度，后续可按学科专家审订替换为更高权威词条。
- 达标以 `audit-disciplines.ts` 运行时合并后计数为准，不是单文件行数。
