import os
import shutil
from urllib.parse import urlparse, urlunparse


def redact_url_credentials(url: str) -> str:
    """Redact any credentials embedded in a URL before logging it."""
    parsed = urlparse(url)
    if "@" not in parsed.netloc:
        return url

    _, host = parsed.netloc.rsplit("@", 1)
    username = parsed.username or ""
    if parsed.password is not None:
        auth = f"{username}:***" if username else "***"
    else:
        auth = username

    netloc = f"{auth}@{host}" if auth else host
    return urlunparse(parsed._replace(netloc=netloc))


def delete_dir_if_exists(path: str):
    if os.path.exists(path):
        shutil.rmtree(path)
