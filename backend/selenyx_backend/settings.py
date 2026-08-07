"""Configuration for the local Selenyx service.

Only this module reads environment variables.  It deliberately keeps API keys
on the device running the backend and never returns them from an API route.
"""

from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict


# A packaged desktop sidecar starts outside the repository. Load its private
# configuration from the same local application directory as the SQLite data;
# process environment still takes precedence over this file.
load_dotenv(Path.home() / ".selenyx" / ".env.local", override=False)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="SELENYX_",
        env_file=".env.local",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    data_dir: Path = Path.home() / ".selenyx"
    cors_origins: str = (
        "http://127.0.0.1:5173,http://localhost:5173,"
        "http://tauri.localhost,https://tauri.localhost,tauri://localhost"
    )
    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: str = ""
    llm_model: str = "gpt-4o-mini"

    @property
    def database_path(self) -> Path:
        return self.data_dir / "selenyx.sqlite3"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
