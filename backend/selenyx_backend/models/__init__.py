"""
Selenyx 数据模型 — SQLModel
对齐前端 TypeScript 类型定义
"""

from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime
import uuid


def gen_id() -> str:
    return str(uuid.uuid4())


class Reference(SQLModel, table=True):
    """文献条目"""
    __tablename__ = "references"

    id: str = Field(default_factory=gen_id, primary_key=True)
    cite_key: str = ""
    type: str = "journalArticle"
    title: str = ""
    short_title: str = ""
    abstract: str = ""
    creators_json: str = "[]"  # JSON 序列化的 Creator[]
    publication: str = ""
    volume: str = ""
    issue: str = ""
    pages: str = ""
    publisher: str = ""
    place: str = ""
    year: str = ""
    date: str = ""
    doi: str = ""
    isbn: str = ""
    issn: str = ""
    pmid: str = ""
    arxiv_id: str = ""
    url: str = ""
    collections_json: str = "[]"
    tags_json: str = "[]"
    language: str = ""
    notes: str = ""
    impact_factor: Optional[float] = None
    jcr_quartile: Optional[str] = None
    open_access: bool = False
    pipeline_stage: Optional[str] = None
    read_status: str = "unread"
    importance: int = 3
    source: str = "manual"
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat())


class ResearchProject(SQLModel, table=True):
    """科研项目"""
    __tablename__ = "projects"

    id: str = Field(default_factory=gen_id, primary_key=True)
    name: str = ""
    description: str = ""
    current_stage: str = "problem"
    pico_json: str = '{"population":"","intervention":"","comparison":"","outcome":""}'
    sbar_json: Optional[str] = None
    tags_json: str = "[]"
    reference_ids_json: str = "[]"
    status: str = "planning"
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat())


class KanbanTask(SQLModel, table=True):
    """任务看板"""
    __tablename__ = "tasks"

    id: str = Field(default_factory=gen_id, primary_key=True)
    project_id: str = Field(foreign_key="projects.id")
    title: str = ""
    description: str = ""
    column: str = "todo"
    stage: str = "problem"
    assignee: str = ""
    priority: str = "medium"
    due_date: Optional[str] = None
    tags_json: str = "[]"
    sort_order: int = 0
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat())


class RefCollection(SQLModel, table=True):
    """文献集合"""
    __tablename__ = "collections"

    id: str = Field(default_factory=gen_id, primary_key=True)
    name: str = ""
    parent_id: Optional[str] = None
    color: str = "#7a9b6a"
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())


class ChatHistory(SQLModel, table=True):
    """AI 聊天历史"""
    __tablename__ = "chat_history"

    id: str = Field(default_factory=gen_id, primary_key=True)
    project_id: Optional[str] = None
    role: str = "user"
    content: str = ""
    tool_calls_json: str = "[]"
    reference_ids_json: str = "[]"
    tokens_used: int = 0
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())


class AgentRun(SQLModel, table=True):
    """Agent 运行记录"""
    __tablename__ = "agent_runs"

    id: str = Field(default_factory=gen_id, primary_key=True)
    recipe_id: str = ""
    project_id: str = ""
    status: str = "staged"
    input_text: str = ""
    output_text: str = ""
    audit_log_json: str = "[]"
    tokens_used: int = 0
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class DocumentChunk(SQLModel, table=True):
    """RAG 文本块（带页码/字符偏移，extractive 引用）"""
    __tablename__ = "document_chunks"

    id: str = Field(default_factory=gen_id, primary_key=True)
    reference_id: str = Field(index=True, default="")
    source: str = "metadata"  # metadata | pdf | note | paste
    page: Optional[int] = None
    section: Optional[str] = None
    char_start: int = 0
    char_end: int = 0
    text: str = ""
    embedding_json: str = "[]"
    embedding_backend: str = "hash"  # hash | dense
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())


class EvidenceItem(SQLModel, table=True):
    """证据链条目（写作只允许 accepted）"""
    __tablename__ = "evidence_items"

    id: str = Field(default_factory=gen_id, primary_key=True)
    project_id: str = Field(index=True, default="")
    reference_id: str = Field(index=True, default="")
    claim: str = ""
    excerpt: str = ""
    relation: str = "supports"  # supports | contradicts | qualifies
    review: str = "pending"  # pending | accepted | rejected
    confidence: str = "medium"  # high | medium | low — user-set only
    page: Optional[int] = None
    chunk_id: Optional[str] = None
    notes: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat())
