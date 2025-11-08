import os
import sys
from dotenv import load_dotenv
from utils.logger import logger

src_dir = os.path.dirname(os.path.abspath(__file__))
if src_dir not in sys.path:
    sys.path.insert(0, src_dir)


os.environ["PYTHONPATH"] = src_dir


def running_in_ecs() -> bool:
    """Detect whether we are running inside an ECS or Fargate task."""
    execution_env = os.getenv("AWS_EXECUTION_ENV", "")
    return any(
        os.getenv(name)
        for name in (
            "ECS_CONTAINER_METADATA_URI_V4",
            "ECS_CONTAINER_METADATA_URI",
            "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
        )
    ) or execution_env.startswith("AWS_ECS")


def strip_aws_env_credentials() -> None:
    """Remove static AWS credential env vars so task-role credentials are used."""
    for key in (
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_SESSION_TOKEN",
        "AWS_SECURITY_TOKEN",
    ):
        if key in os.environ:
            logger.info(
                "Removing AWS credential environment variable '%s'", key)
            os.environ.pop(key, None)


if running_in_ecs():
    strip_aws_env_credentials()
else:
    load_dotenv()


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    reload_enabled = os.getenv("RELOAD_SERVER", "false").lower() == "true"
    log_level = os.getenv("LOG_LEVEL", "info")
    try:
        uvicorn.run(
            "app:app",
            host="0.0.0.0",
            port=port,
            reload=reload_enabled,
            log_level=log_level,
        )
    except KeyboardInterrupt:
        sys.exit(0)
    except Exception:
        logger.exception("Uvicorn failed to start")
        sys.exit(1)
