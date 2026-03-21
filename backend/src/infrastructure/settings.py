from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    database_sslmode: str = "require"
    ai_runtime_config_json: str | None = None
    ai_secret_values_json: str | None = None
    desktop_user_id: int = 1
    desktop_user_username: str = "local-user"
    desktop_user_email: str = "local@gitodyssey.app"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="",
        case_sensitive=False,
        extra="ignore",
    )
