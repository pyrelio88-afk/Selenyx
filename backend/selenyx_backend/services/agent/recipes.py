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
    # 注入 run 目标消息的角色接力指令
    directive: str
    # 是否强制开启 finalize 批评审查门
    force_review: bool = False


_REVIEW_PIPELINE = Recipe(
    key="review-pipeline",
    name="综述流水线",
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

RECIPES: dict[str, Recipe] = {recipe.key: recipe for recipe in (_REVIEW_PIPELINE,)}


def get_recipe(key: str | None) -> Recipe | None:
    if not key:
        return None
    return RECIPES.get(key.strip())


__all__ = ["Recipe", "RECIPES", "get_recipe"]
