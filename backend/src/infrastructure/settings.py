from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from typing import List
import json


class Settings(BaseSettings):
    database_url: str
    cors_allow_origins: List[str] = [
        "http://localhost:5173",
    ]
    frontend_url: str = "http://localhost:5173"
    secret_key: str
    github_client_id: str
    github_client_secret: str
    github_webhook_secret: str
    app_id: int
    private_key: str

    @field_validator('cors_allow_origins', mode='before')
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                # If it's a comma-separated string, split it
                return [origin.strip() for origin in v.split(',') if origin.strip()]
        return v

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="",
        case_sensitive=False,
        extra="ignore",
    )
