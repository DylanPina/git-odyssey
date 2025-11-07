import base64
import os
from functools import lru_cache
from typing import Dict, Optional

import boto3
from botocore.exceptions import ClientError

from utils.logger import logger


class SecretsService:
    """Service for loading application secrets from AWS Secrets Manager."""

    _DEFAULT_SECRET_PREFIX = "git-odyssey-prod"

    # Map of suffix -> environment variable name
    _SECRET_MAP: Dict[str, str] = {
        "github_client_secret": "GITHUB_CLIENT_SECRET",
        "github_client_id": "GITHUB_CLIENT_ID",
        "github_app_id": "GITHUB_APP_ID",
        "github_app_private_key": "GITHUB_APP_PRIVATE_KEY",
        "github_webhook_secret": "GITHUB_WEBHOOK_SECRET",
        "secret_key": "SECRET_KEY",
        "google_api_key": "GOOGLE_API_KEY",
        "openai_api_key": "OPENAI_API_KEY",
    }

    def __init__(
        self,
        region_name: Optional[str] = None,
        secret_prefix: Optional[str] = None,
        secret_map: Optional[Dict[str, str]] = None,
    ) -> None:
        self.region_name = (
            region_name
            or os.getenv("AWS_REGION")
            or os.getenv("AWS_DEFAULT_REGION")
            or "us-east-1"
        )
        self.secret_prefix = secret_prefix or os.getenv(
            "SECRETS_PREFIX", self._DEFAULT_SECRET_PREFIX
        )
        self.secret_map = secret_map or self._SECRET_MAP
        self._client = boto3.client(
            "secretsmanager", region_name=self.region_name)
        self._loaded_values: Dict[str, str] = {}

    def _build_secret_id(self, secret_suffix: str) -> str:
        if secret_suffix.startswith("arn:"):
            return secret_suffix
        if secret_suffix.startswith(f"{self.secret_prefix}/"):
            return secret_suffix
        return f"{self.secret_prefix}/{secret_suffix}"

    def _fetch_secret(self, secret_id: str) -> str:
        try:
            response = self._client.get_secret_value(SecretId=secret_id)
        except ClientError as exc:
            logger.error("Failed to retrieve secret '%s': %s", secret_id, exc)
            raise RuntimeError(
                f"Unable to retrieve secret '{secret_id}'") from exc

        secret_string = response.get("SecretString")
        if secret_string is not None:
            return secret_string

        secret_binary = response.get("SecretBinary")
        if secret_binary is not None:
            if isinstance(secret_binary, str):
                secret_binary = secret_binary.encode("utf-8")
            # Secrets Manager stores binary secrets base64-encoded
            return base64.b64decode(secret_binary).decode("utf-8")

        raise RuntimeError(f"Secret '{secret_id}' did not contain a value")

    def load(self, force: bool = False) -> Dict[str, str]:
        """Load secrets into the current process environment.

        Args:
            force: When True, always fetch from AWS even if env vars already set.

        Returns:
            Mapping of environment variable names to loaded string values.
        """

        for suffix, env_name in self.secret_map.items():
            existing_value = os.getenv(env_name)
            if existing_value and not force:
                self._loaded_values[env_name] = existing_value
                continue

            secret_id = self._build_secret_id(suffix)
            secret_value = self._fetch_secret(secret_id)
            os.environ[env_name] = secret_value
            # Also expose lowercase variant for Pydantic case-insensitive lookups
            os.environ[env_name.lower()] = secret_value
            self._loaded_values[env_name] = secret_value
            logger.info(
                "Loaded secret '%s' into environment variable '%s'", secret_id, env_name)

        return dict(self._loaded_values)


@lru_cache(maxsize=1)
def get_secrets_service() -> SecretsService:
    return SecretsService()
