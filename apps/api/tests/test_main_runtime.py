from __future__ import annotations

import unittest

from fastapi.middleware.cors import CORSMiddleware

from app.main import app


class MainRuntimeTests(unittest.TestCase):
    def test_loopback_cors_regex_is_enabled(self) -> None:
        middleware = next((entry for entry in app.user_middleware if entry.cls is CORSMiddleware), None)

        self.assertIsNotNone(middleware)
        self.assertEqual(middleware.kwargs.get("allow_origin_regex"), r"^https?://(127\.0\.0\.1|localhost)(:\d+)?$")
        self.assertIn("http://127.0.0.1:3000", middleware.kwargs.get("allow_origins", []))

    def test_local_auth_routes_are_registered(self) -> None:
        route_paths = {route.path for route in app.routes}

        self.assertIn("/api/v1/auth/session", route_paths)
        self.assertIn("/api/v1/auth/register", route_paths)
        self.assertIn("/api/v1/auth/login", route_paths)
        self.assertIn("/api/v1/auth/logout", route_paths)


if __name__ == "__main__":
    unittest.main()
