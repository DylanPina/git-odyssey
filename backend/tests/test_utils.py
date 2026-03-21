import unittest

from utils.utils import redact_url_credentials


class UtilsTests(unittest.TestCase):
    def test_redact_url_credentials_hides_password_or_token(self) -> None:
        url = "https://x-access-token:ghs_secret_token@github.com/owner/repo"

        redacted = redact_url_credentials(url)

        self.assertEqual(
            redacted,
            "https://x-access-token:***@github.com/owner/repo",
        )

    def test_redact_url_credentials_leaves_plain_urls_unchanged(self) -> None:
        url = "https://github.com/owner/repo"

        redacted = redact_url_credentials(url)

        self.assertEqual(redacted, url)


if __name__ == "__main__":
    unittest.main()
