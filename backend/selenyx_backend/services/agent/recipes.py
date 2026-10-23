"""内置任务流水线 recipe（V4 模块 E）。

recipe = 预编排的角色接力指令 + 默认开关（审查门等），随 run 启动注入目标消息。
保持轻量：不引入 DAG 框架，接力顺序由指令约束 + 主 loop 的既有机制
（ask_expert 委托 / finalize 审查门 / 证据门校验）承载。
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Recipe:
    key: str
    name: str
    # 面向输入框菜单的一句话说明（不参与模型注入）
    description: str
    # 注入 run 目标消息的角色接力指令
    directive: str
    # 是否强制开启 finalize 批评审查门
    force_review: bool = False


_REVIEW_PIPELINE = Recipe(
    key="review-pipeline",
    name="综述流水线",
    description="检索 → 起草 → 证据卡 → 批评 → 成稿",
    force_review=True,
    directive=(
        "本任务按「综述流水线」执行，角色接力顺序不可省略：\n"
        "1. 你先输出执行计划（plan）；\n"
        "2. 检索摸底（search_library / project_context）后，用 ask_expert 委托「文献综述员」"
        "基于本机文献库起草综述主体（按主题归类 + 研究缺口）；\n"
        "3. 起草涉及的每个事实性论断，逐一用 save_evidence 落证据卡（附原文摘录）；\n"
        "4. 你用 ask_expert 委托「论文批评员」审一遍草稿，按意见修订；\n"
        "5. 最终成稿由你整合输出：逐句标注 [^e:证据id]（只能用真实存在的证据 id），"
        "无据断言标 [^none]。成稿还会经证据门校验，编造引用会被打回。"
    ),
)

_EVIDENCE_AUDIT = Recipe(
    key="evidence-audit",
    name="证据审计",
    description="逐条核对主张与证据，标出无据和冲突",
    directive=(
        "本任务按「证据审计」执行，顺序不可省略：\n"
        "1. 你先输出审计计划（plan），写明本轮要核对的主张 / 草稿范围；\n"
        "2. 用 project_context 与 list_evidence 盘点现有主张和证据链，再用 search_library 回查原文，"
        "不得只凭记忆判断；\n"
        "3. 对每条主张给出结论：有据（附真实证据 id 与原文摘录）、弱支持、无据或互相冲突；\n"
        "4. 对无据或弱支持的主张，用 save_evidence 补充证据卡；无法补充的明确标为待补，不要编造证据；\n"
        "5. 最终输出审计表（主张 | 结论 | 证据 id | 原文摘录 | 下一步），并总结最需要补强的 3 处。"
    ),
)

_STUDY_DESIGN = Recipe(
    key="study-design",
    name="研究设计",
    description="从研究问题到可执行方案与风险清单",
    directive=(
        "本任务按「研究设计」执行：\n"
        "1. 先澄清研究问题与假设，用 PICO / PECO 等框架界定人群、暴露或干预、对照、结局与时间窗；\n"
        "2. 用 search_library、project_context、list_evidence 检索本机资料，说明已有证据如何支持这个问题，"
        "并指出具体研究缺口（不要把“没人做过”当成缺口）；\n"
        "3. 给出研究设计草案：研究类型、纳排标准、样本量考虑、主要与次要结局、统计分析和偏倚控制；\n"
        "4. 列出可行性、伦理、数据获取与时间风险，以及仍需补充的材料；\n"
        "5. 用 write_note 保存方案草稿，最后给出按优先级排序的下一步清单。"
    ),
)

RECIPES: dict[str, Recipe] = {
    recipe.key: recipe for recipe in (_REVIEW_PIPELINE, _EVIDENCE_AUDIT, _STUDY_DESIGN)
}


def get_recipe(key: str | None) -> Recipe | None:
    if not key:
        return None
    return RECIPES.get(key.strip())


__all__ = ["Recipe", "RECIPES", "get_recipe"]
