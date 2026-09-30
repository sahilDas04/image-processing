"""Shared fixtures for the security test suite.

The environment is intentionally not touched: pydantic-settings reads the
developer's server/.env, so tests that assert on config use explicit
constructor overrides instead of depending on whichever secret is present.
"""

import sys
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parents[1]
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))