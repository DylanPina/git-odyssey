import os
import shutil
from urllib.parse import urlparse


def parse_github_url(url: str) -> tuple[str, str]:
    """Parse a GitHub URL into owner and name"""
    parsed = urlparse(url)
    owner, name = parsed.path.split("/")[-2:]
    return owner, name.replace(".git", "")


def delete_dir_if_exists(path: str):
    if os.path.exists(path):
        shutil.rmtree(path)
