from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    database_url: str
    cors_allow_origins: List[str] = [
        "https://git-odyssey-1.onrender.com",
        "http://localhost:5173",
        "https://git-odyssey-prod-frontend.s3.us-east-1.amazonaws.com/index.html",
    ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
