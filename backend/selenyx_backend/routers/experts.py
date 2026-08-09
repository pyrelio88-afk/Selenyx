"""专家（角色化 subagent 人格）CRUD + 内置专家播种。"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session, select

from selenyx_backend.database import get_engine
from selenyx_backend.models import Expert

router = APIRouter()

BUILTIN_EXPERTS: list[dict[str, str]] = [
    {
        "key": "reviewer",
        "name": "文献综述员",
        "tagline": "按主题归类文献、提炼研究缺口",
        "system_prompt": "你是「文献综述员」：只基于工具查到的本机文献与证据工作，按主题归类核心观点，指出研究缺口与未来方向；不得编造文献、作者或结论；证据不足就明说。",
    },
    {
        "key": "critic",
        "name": "论文批评员",
        "tagline": "审稿级批判性分析",
        "system_prompt": "你是「论文批评员」：从研究设计、样本代表性、统计方法、结论可靠性、伦理五个维度做批判性分析，直给问题清单与修改建议；严格区分「文本所述」与「你的推断」。",
    },
    {
        "key": "methodologist",
        "name": "统计顾问",
        "tagline": "研究设计与统计方法选型",
        "system_prompt": "你是「统计顾问」：根据研究设计与数据类型推荐统计方法，说明选择理由、前提条件与常见误用；不做没有数据支撑的结论。",
    },
    {
        "key": "writer",
        "name": "学术写作教练",
        "tagline": "结构、润色与投稿规范",
        "system_prompt": "你是「学术写作教练」：帮助梳理论文结构、润色学术表达、核对投稿规范；保持作者原意，改动处给出理由。",
    },
]


def seed_builtin_experts() -> None:
    """内置专家播种：表为空时写入（init_db 后调用，幂等）。"""
    with Session(get_engine()) as session:
        existing = {e.key for e in session.exec(select(Expert)).all()}
        for spec in BUILTIN_EXPERTS:
            if spec["key"] in existing:
                continue
            session.add(Expert(builtin=True, **spec))
        session.commit()


class ExpertBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    name: str = Field(min_length=1, max_length=60)
    tagline: str = ""
    system_prompt: str = Field(min_length=1, max_length=8000)


def _serialize(expert: Expert) -> dict:
    return {
        "id": expert.id,
        "key": expert.key,
        "name": expert.name,
        "tagline": expert.tagline,
        "systemPrompt": expert.system_prompt,
        "builtin": expert.builtin,
    }


@router.get("")
def list_experts():
    with Session(get_engine()) as session:
        experts = list(session.exec(select(Expert)).all())
    return {"experts": [_serialize(e) for e in experts]}


@router.post("", status_code=201)
def create_expert(body: ExpertBody):
    expert = Expert(key=f"custom-{body.name.strip()}", name=body.name.strip(), tagline=body.tagline.strip(), system_prompt=body.system_prompt.strip(), builtin=False)
    with Session(get_engine()) as session:
        session.add(expert)
        session.commit()
        session.refresh(expert)
        return _serialize(expert)


@router.put("/{expert_id}")
def update_expert(expert_id: str, body: ExpertBody):
    with Session(get_engine()) as session:
        expert = session.get(Expert, expert_id)
        if not expert:
            raise HTTPException(404, "专家不存在。")
        if expert.builtin:
            raise HTTPException(409, "内置专家不可修改；可复制为自定义专家后再改。")
        expert.name = body.name.strip()
        expert.tagline = body.tagline.strip()
        expert.system_prompt = body.system_prompt.strip()
        session.add(expert)
        session.commit()
        session.refresh(expert)
        return _serialize(expert)


@router.delete("/{expert_id}")
def delete_expert(expert_id: str):
    with Session(get_engine()) as session:
        expert = session.get(Expert, expert_id)
        if not expert:
            raise HTTPException(404, "专家不存在。")
        if expert.builtin:
            raise HTTPException(409, "内置专家不可删除。")
        session.delete(expert)
        session.commit()
    return {"deleted": expert_id}
