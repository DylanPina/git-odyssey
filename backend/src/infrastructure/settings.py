from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):

    database_url: str
    frontend_url: str
    secret_key: str
    github_client_id: str
    github_client_secret: str
    github_webhook_secret: str
    github_app_id: int
    github_app_private_key: str
    github_app_name: str

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="",
        case_sensitive=False,
        extra="ignore",
    )
