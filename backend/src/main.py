import os
import sys
from dotenv import load_dotenv

src_dir = os.path.dirname(os.path.abspath(__file__))
if src_dir not in sys.path:
    sys.path.insert(0, src_dir)


os.environ["PYTHONPATH"] = src_dir


if __name__ == "__main__":
    import uvicorn

    port = os.getenv("PORT", 8000)
    try:
        uvicorn.run(
            "app:app",
            host="0.0.0.0",
            port=port,
            reload=True,
            log_level="info",
        )
    except KeyboardInterrupt:
        sys.exit(0)
    except Exception:
        sys.exit(1)
