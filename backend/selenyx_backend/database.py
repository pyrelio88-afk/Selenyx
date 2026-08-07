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

    SQLModel.metadata.create_all(get_engine())


def get_session() -> Generator[Session, None, None]:
    with Session(get_engine()) as session:
        yield session
