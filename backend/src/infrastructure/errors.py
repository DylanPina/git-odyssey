class AIError(RuntimeError):
    """Base error for AI runtime failures."""


class AIConfigurationError(AIError):
    """Raised when the AI runtime configuration is invalid or incomplete."""


class MissingConfigurationError(AIConfigurationError):
    """Raised when runtime configuration is missing for the current mode."""


class AIAuthenticationError(AIError):
    """Raised when the configured provider credentials are rejected."""


class AIConnectionError(AIError):
    """Raised when the configured provider cannot be reached."""


class AIModelError(AIError):
    """Raised when the configured model is missing or unsupported."""


class AIRequestError(AIError):
    """Raised when a provider request fails for non-auth/model reasons."""


class AIUnsupportedCapabilityError(AIError):
    """Raised when a provider does not implement a required endpoint."""
