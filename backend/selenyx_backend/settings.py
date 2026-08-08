"""Configuration for the local Selenyx service.

Only this module reads environment variables. It deliberately keeps API keys
on the device running the backend and never returns them from an API route.

Settings are instantiated per request instead of being cached. This lets an
already-running desktop sidecar pick up an edited ``~/.selenyx/.env.local``
file without copying its secrets into the process environment or requiring a
restart. Process environment variables still take precedence over both files.
"""

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def development_env_file() -> Path:
    """Return the private config file used while running from this repository."""

    return Path(__file__).resolve().parents[1] / ".env.local"


def local_env_file() -> Path:
    """Return the private config file used by the packaged local application."""

    return Path.home() / ".selenyx" / ".env.local"


def default_data_dir() -> Path:
    return Path.home() / ".selenyx"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="SELENYX_",
        # ``get_settings`` supplies absolute files so a packaged sidecar does
        # not accidentally read a file from its transient working directory.
        env_file=None,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    data_dir: Path = Field(default_factory=default_data_dir)
    cors_origins: str = (
        "http://127.0.0.1:5173,http://localhost:5173,"
        "http://tauri.localhost,https://tauri.localhost,tauri://localhost"
    )
    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: str = ""
    llm_model: str = "gpt-4o-mini"
    # Optional dense embeddings.  The default provider speaks the
    # OpenAI-compatible /embeddings protocol; ``ollama`` uses /api/embed.
    # Empty base/model values deliberately keep the zero-download hash path.
    embed_provider: str = "openai-compatible"
    embed_base_url: str = ""
    embed_api_key: str = ""
    embed_model: str = ""
    # Some retrieval models (notably E5/BGE variants) expect asymmetric
    # query/document instructions.  They are opt-in so generic models are not
    # silently given the wrong prompt format.
    embed_query_prefix: str = ""
    embed_document_prefix: str = ""
    embed_timeout_seconds: float = Field(default=30.0, ge=1.0, le=300.0)
    # OpenAlex polite pool
    openalex_mailto: str = "selenyx@research.local"
    openalex_api_key: str = ""

    @property
    def database_path(self) -> Path:
        return self.data_dir / "selenyx.sqlite3"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


def get_settings() -> Settings:
    """Read the current local configuration without caching secrets.

    The application directory file is listed last, so it can override the
    repository development fallback. Pydantic still gives actual process
    environment variables the highest priority.
    """

    return Settings(_env_file=(development_env_file(), local_env_file()))
