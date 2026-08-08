"""SQLite persistence for the local backend."""

from collections.abc import Generator
from functools import lru_cache

from sqlmodel import SQLModel, Session, create_engine

from selenyx_backend.settings import get_settings


@lru_cache
def get_engine():
    settings = get_settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    return create_engine(
        f"sqlite:///{settings.database_path.as_posix()}",
        connect_args={"check_same_thread": False},
    )


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


def get_session() -> Generator[Session, None, None]:
    with Session(get_engine()) as session:
        yield session
