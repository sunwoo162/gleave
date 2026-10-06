from pathlib import Path
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "OSS Product Builder"
    data_dir: Path = Path(".oss-builder")
    workspace_root: Path = Path("workspaces")
    github_token: str | None = None
    llm_base_url: str | None = None
    llm_api_key: str | None = None
    llm_model: str | None = None
    execution_mode: Literal["demo", "workspace_verify"] = "demo"
    command_timeout_seconds: float = 120.0
    max_command_output_chars: int = 8_000

    @field_validator("command_timeout_seconds")
    @classmethod
    def validate_command_timeout(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("command_timeout_seconds must be positive")
        return value

    @field_validator("max_command_output_chars")
    @classmethod
    def validate_max_command_output_chars(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("max_command_output_chars must be positive")
        return value

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")
