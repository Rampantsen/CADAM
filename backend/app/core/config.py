from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "CADAM Backend"
    api_v1_prefix: str = "/api/v1"
    secret_key: str = Field(
        default="change-me-in-production",
        description="JWT signing secret. Override with CADAM_SECRET_KEY.",
    )
    access_token_expire_minutes: int = 60 * 24 * 7
    database_url: str = f"sqlite:///{BACKEND_ROOT / 'cadam.sqlite3'}"
    data_root: Path = BACKEND_ROOT / "data"
    genai_api_url: str | None = None
    genai_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("CADAM_GENAI_API_KEY", "OPENAI_API_KEY"),
    )
    genai_model: str = "gpt-5.5"
    genai_timeout_seconds: int = 120
    deepseek_v4_pro_api_key: str | None = None
    gpt55_api_key: str | None = None
    gpt55_max_completion_tokens: int = 16000
    gpt55_reasoning_effort: str | None = None
    openrouter_api_url: str = "https://openrouter.ai/api/v1/chat/completions"
    openrouter_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("CADAM_OPENROUTER_API_KEY", "OPENROUTER_API_KEY"),
    )
    cors_origins: list[str] = [
        "http://localhost:6000",
        "http://127.0.0.1:6000",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    model_config = SettingsConfigDict(
        env_prefix="CADAM_",
        env_file=BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.data_root.mkdir(parents=True, exist_ok=True)
    return settings
