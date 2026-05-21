"""Shared MongoDB client for LibreChat admin scripts.

Requires pymongo:
    pip install pymongo
"""

from __future__ import annotations

import os
import sys
from typing import Any

DEFAULT_MONGO_URI = "mongodb://localhost:27017"
DEFAULT_DB_NAME = "LibreChat"


def get_db(uri: str | None = None, db_name: str | None = None) -> Any:
    try:
        from pymongo import MongoClient
    except ImportError:
        print("error: pymongo not installed — run: pip install pymongo", file=sys.stderr)
        sys.exit(1)

    uri = uri or os.environ.get("MONGO_URI", DEFAULT_MONGO_URI)
    db_name = db_name or os.environ.get("LIBRECHAT_DB", DEFAULT_DB_NAME)

    client = MongoClient(uri, serverSelectionTimeoutMS=5000)
    try:
        client.admin.command("ping")
    except Exception as e:
        print(f"error: cannot connect to MongoDB at {uri}: {e}", file=sys.stderr)
        sys.exit(1)

    return client[db_name]
