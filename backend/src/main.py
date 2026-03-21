import os
import sys
from utils.logger import logger

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional during injected desktop runs
    load_dotenv = None

src_dir = os.path.dirname(os.path.abspath(__file__))
if src_dir not in sys.path:
    sys.path.insert(0, src_dir)


os.environ["PYTHONPATH"] = src_dir


if load_dotenv is not None:
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
