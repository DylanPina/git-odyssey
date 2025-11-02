from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    database_url: str
    cors_allow_origins: List[str] = [
        "https://git-odyssey-1.onrender.com",
        "http://localhost:5173",
    ]
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


settings = Settings()
