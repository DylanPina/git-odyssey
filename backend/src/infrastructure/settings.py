from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):

    database_url: str
    database_sslmode: str = "require"
    openai_api_key: str | None = None
    openai_text_model: str = "gpt-5.4-mini"
    openai_embedding_model: str = "text-embedding-3-small"
    desktop_user_id: int = 1
    desktop_user_username: str = "local-user"
    desktop_user_email: str = "local@gitodyssey.app"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="",
        case_sensitive=False,
        extra="ignore",
    )
