"""SQLite persistence for the local backend."""

from collections.abc import Generator
from typing import NamedTuple

from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlmodel import SQLModel, Session, create_engine

from selenyx_backend.settings import get_settings


class _EngineCacheInfo(NamedTuple):
    hits: int
    misses: int
    maxsize: int | None
    currsize: int


_engines: dict[str, Engine] = {}
_cache_hits = 0
_cache_misses = 0


def get_engine() -> Engine:
    global _cache_hits, _cache_misses
    settings = get_settings()
    resolved_db = settings.database_path.resolve()
    key = str(resolved_db)
    engine = _engines.get(key)
    if engine is not None:
        _cache_hits += 1
        return engine

    _cache_misses += 1
    resolved_db.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        f"sqlite:///{resolved_db.as_posix()}",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def _enable_sqlite_guards(dbapi_connection, _connection_record) -> None:  # noqa: ANN001
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

    _engines[key] = engine
    return engine


def _clear_engines() -> None:
    global _cache_hits, _cache_misses
    for engine in list(_engines.values()):
        try:
            engine.dispose()
        except Exception:
            pass
    _engines.clear()
    _cache_hits = 0
    _cache_misses = 0


def _engine_cache_info() -> _EngineCacheInfo:
    return _EngineCacheInfo(_cache_hits, _cache_misses, None, len(_engines))


get_engine.cache_clear = _clear_engines  # type: ignore[attr-defined]
get_engine.cache_info = _engine_cache_info  # type: ignore[attr-defined]


def init_db() -> None:
    # Importing the models registers every SQLModel table before creation.
    import selenyx_backend.models  # noqa: F401

    engine = get_engine()
    SQLModel.metadata.create_all(engine)
    # create_all intentionally does not alter existing SQLite tables.  These
    # additive columns keep pre-0.0.1 local libraries readable without deleting
    # or rebuilding the user's database.
    with engine.begin() as connection:
        columns = {
            row[1]
            for row in connection.exec_driver_sql("PRAGMA table_info('references')").fetchall()
        }
        if columns and "payload_json" not in columns:
            connection.exec_driver_sql(
                "ALTER TABLE 'references' ADD COLUMN payload_json TEXT NOT NULL DEFAULT '{}'"
            )
        if columns and "payload_version" not in columns:
            connection.exec_driver_sql(
                "ALTER TABLE 'references' ADD COLUMN payload_version INTEGER NOT NULL DEFAULT 1"
            )
        for table in ("projects", "tasks"):
            columns = {
                row[1]
                for row in connection.exec_driver_sql(f"PRAGMA table_info('{table}')").fetchall()
            }
            if columns and "payload_json" not in columns:
                connection.exec_driver_sql(
                    f"ALTER TABLE '{table}' ADD COLUMN payload_json TEXT NOT NULL DEFAULT '{{}}'"
                )
            if columns and "payload_version" not in columns:
                connection.exec_driver_sql(
                    f"ALTER TABLE '{table}' ADD COLUMN payload_version INTEGER NOT NULL DEFAULT 1"
                )
        # Evidence and RAG locators are additive: an existing local library
        # remains readable while new imports can retain parser provenance.
        additive_columns = {
            "document_chunks": {
                "bbox_json": "TEXT NOT NULL DEFAULT '[]'",
                "heading_path_json": "TEXT NOT NULL DEFAULT '[]'",
                "parser_version": "TEXT NOT NULL DEFAULT 'legacy'",
            },
            "evidence_items": {
                "status": "TEXT NOT NULL DEFAULT 'pending'",
                "anchor_id": "TEXT",
            },
            # V4 模块 B：run 工件清单（write_note / export_artifact 落盘记录）
            "agent_runs": {
                "artifacts_json": "TEXT NOT NULL DEFAULT '[]'",
                "checkpoint_json": "TEXT NOT NULL DEFAULT '{}'",
                # V4 模块 H：run 完成后回贴浏览器本地来源会话的 opaque 标识。
                "source_session_id": "TEXT NOT NULL DEFAULT ''",
                "source_session_scope": "TEXT NOT NULL DEFAULT ''",
            },
            # V4 模块 G：cron 表达式 / 停机补偿 / 失败指数退避重试
            "automation_tasks": {
                "cron_expr": "TEXT NOT NULL DEFAULT ''",
                "catch_up": "INTEGER NOT NULL DEFAULT 1",
                "retry_count": "INTEGER NOT NULL DEFAULT 0",
                "next_retry_at": "TEXT",
            },
        }
        evidence_status_was_added = False
        for table, expected in additive_columns.items():
            table_columns = {
                row[1]
                for row in connection.exec_driver_sql(f"PRAGMA table_info('{table}')").fetchall()
            }
            for column, definition in expected.items():
                if table_columns and column not in table_columns:
                    connection.exec_driver_sql(
                        f"ALTER TABLE '{table}' ADD COLUMN {column} {definition}"
                    )
                    if table == "evidence_items" and column == "status":
                        evidence_status_was_added = True
        # Old evidence rows predate the canonical status column.  Their legacy
        # review value is the only trustworthy history, so use it once here.
        if evidence_status_was_added:
            connection.exec_driver_sql("UPDATE evidence_items SET status = review")


def get_session() -> Generator[Session, None, None]:
    with Session(get_engine()) as session:
        yield session
