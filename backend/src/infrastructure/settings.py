from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from typing import List
import json


class Settings(BaseSettings):
    database_url: str
    frontend_url: str = "http://localhost:5173"
    secret_key: str
    github_client_id: str
    github_client_secret: str
    github_webhook_secret: str
    app_id: int
    private_key: str

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="",
        case_sensitive=False,
        extra="ignore",
    )
