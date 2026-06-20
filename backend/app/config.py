"""
All environment-configurable settings live here. Nothing in the rest of
the backend should read os.environ directly — import `settings` instead.

Values are read from (in order of precedence): real environment variables,
then a `.env` file in the backend/ directory, then the defaults below.
"""
from __future__ import annotations

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Comma-separated list of exact origins allowed to call the API
    # (e.g. "http://localhost:5173,https://my-app.example.com")
    cors_allow_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Regex of additional allowed origins, e.g. for forwarded-port dev
    # environments like Codespaces (*.app.github.dev) or Gitpod.
    cors_allow_origin_regex: str = r"https://.*\.app\.github\.dev"

    # Where character folders (images + skeleton.json) are stored on disk.
    # Relative paths are resolved relative to the backend/ directory.
    storage_dir: str = "storage/characters"

    # Reject uploads larger than this (bytes). Default 15 MB.
    max_upload_bytes: int = 15 * 1024 * 1024

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allow_origins.split(",") if o.strip()]

    @property
    def storage_path(self) -> Path:
        p = Path(self.storage_dir)
        if not p.is_absolute():
            p = Path(__file__).resolve().parent.parent / p
        return p


settings = Settings()
