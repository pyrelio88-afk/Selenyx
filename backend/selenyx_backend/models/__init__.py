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
    # Lossless copy of the frontend Reference object.  Indexed columns above
    # keep search/RAG efficient while this payload preserves annotations,
    # attachments and newer UI fields across backend version changes.
    payload_json: str = "{}"
    payload_version: int = 1
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
    # Lossless frontend object. Indexed columns above remain queryable while
    # optional framework and future fields survive backend upgrades.
    payload_json: str = "{}"
    payload_version: int = 1
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
    # Keep the exact frontend task shape (including stable local ids) so a
    # backend with an older schema never silently discards newer fields.
    payload_json: str = "{}"
    payload_version: int = 1
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
    artifacts_json: str = "[]"  # V4 模块 B：write_note/export_artifact 落盘工件清单
    # V4 模块 H：opaque browser-local chat origin. These identifiers carry no
    # conversation content; the frontend uses them to return the real output
    # to the session that started the run.
    source_session_id: str = ""
    source_session_scope: str = ""
    tokens_used: int = 0
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class Expert(SQLModel, table=True):
    """角色化研究助手（专家）——隔离 system prompt 的 subagent 人格"""
    __tablename__ = "experts"

    id: str = Field(default_factory=gen_id, primary_key=True)
    key: str = Field(index=True, default="")
    name: str = ""
    tagline: str = ""
    system_prompt: str = ""
    builtin: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())


class AutomationTask(SQLModel, table=True):
    """自动化：按节奏触发 agent 任务的调度定义"""
    __tablename__ = "automation_tasks"

    id: str = Field(default_factory=gen_id, primary_key=True)
    name: str = ""
    prompt: str = ""
    schedule_type: str = "daily"  # interval | daily | cron
    interval_min: int = 60
    daily_hhmm: str = "08:00"
    cron_expr: str = ""  # V4 模块 G：五字段 cron（schedule_type=cron 时生效）
    catch_up: bool = True  # 停机/休眠错过的触发是否补跑一次
    retry_count: int = 0  # 连续失败已重试次数（指数退避 ×3）
    next_retry_at: Optional[str] = None  # 下一次重试时刻（ISO）
    project_id: str = ""
    enabled: bool = True
    last_run_at: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())


class McpServer(SQLModel, table=True):
    """用户明确配置的本机 MCP 连接器。

    配置只保存在本地 SQLite。stdio 命令与参数分列保存，服务层始终以
    ``create_subprocess_exec`` 调用，绝不交给 shell 解释；SSE/HTTP 端点
    不存自定义请求头，避免把令牌复制进配置或日志。
    """

    __tablename__ = "mcp_servers"

    id: str = Field(default_factory=gen_id, primary_key=True)
    name: str = ""
    transport: str = "stdio"  # stdio | sse（Streamable HTTP / SSE 响应）
    command: str = ""
    args_json: str = "[]"
    url: str = ""
    timeout_seconds: float = 10.0
    enabled: bool = True
    # 最后一次显式探测的可调用工具快照。动态 agent 白名单只信任此快照，
    # 不会为了列工具而在后台偷偷联网或起进程。
    capabilities_json: str = "[]"
    protocol_version: str = ""
    server_info_json: str = "{}"
    last_status: str = "unknown"  # unknown | ok | error | disabled
    last_error: str = ""
    last_checked_at: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat())


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
    # Structured-parser locators are deliberately stored alongside the text
    # chunk.  They let a UI return to the exact source region without
    # pretending that a generated answer has a verifiable citation.
    bbox_json: str = "[]"  # [left, top, right, bottom] in page coordinates
    heading_path_json: str = "[]"  # e.g. ["Methods", "Participants"]
    parser_version: str = "legacy"  # docling/x parser identifier, never inferred
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
    # ``review`` is retained for the existing frontend.  ``status`` is the
    # canonical evidence-state vocabulary and is kept in sync by the router.
    review: str = "pending"  # pending | accepted | rejected (legacy)
    status: str = "pending"  # retrieved | pending | accepted | rejected | unresolved
    confidence: str = "medium"  # high | medium | low — user-set only
    page: Optional[int] = None
    chunk_id: Optional[str] = None
    anchor_id: Optional[str] = None
    notes: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat())


class ProvenanceAnchor(SQLModel, table=True):
    """A durable, parser-independent location in an imported source file."""

    __tablename__ = "provenance_anchors"

    id: str = Field(default_factory=gen_id, primary_key=True)
    reference_id: str = Field(index=True, default="")
    chunk_id: Optional[str] = Field(default=None, index=True)
    page: Optional[int] = None
    bbox_json: str = "[]"
    char_start: Optional[int] = None
    char_end: Optional[int] = None
    heading_path_json: str = "[]"
    parser_version: str = "manual-v1"
    source_uri: str = ""
    content_hash: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())


class ResearchClaim(SQLModel, table=True):
    """A project-scoped research claim, separate from a single excerpt."""

    __tablename__ = "research_claims"

    id: str = Field(default_factory=gen_id, primary_key=True)
    project_id: str = Field(index=True, default="")
    text: str = ""
    claim_type: str = "finding"  # finding | method | sample | limitation | hypothesis
    status: str = "draft"  # draft | active | retired
    evidence_ids_json: str = "[]"
    notes: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat())


class ContradictionCase(SQLModel, table=True):
    """A documented conflict between evidence items or their applicability."""

    __tablename__ = "contradiction_cases"

    id: str = Field(default_factory=gen_id, primary_key=True)
    project_id: str = Field(index=True, default="")
    claim_id: Optional[str] = Field(default=None, index=True)
    title: str = ""
    description: str = ""
    evidence_ids_json: str = "[]"
    status: str = "open"  # open | resolved | accepted
    resolution: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat())


class StageArtifact(SQLModel, table=True):
    """Versioned output of a project stage with an explicit quality gate."""

    __tablename__ = "stage_artifacts"

    id: str = Field(default_factory=gen_id, primary_key=True)
    project_id: str = Field(index=True, default="")
    stage: str = Field(index=True, default="problem")
    title: str = ""
    artifact_type: str = "note"
    content_json: str = "{}"
    content_hash: str = ""
    version: int = 1
    quality_gate: str = ""
    status: str = "draft"  # draft | ready | approved | blocked
    source_uri: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat())
