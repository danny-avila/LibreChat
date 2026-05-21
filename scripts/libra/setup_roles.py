"""Harden the LibreChat USER role for the Aivion consumer product.

Updates permissions in MongoDB to match our locked-down consumer UX:
  - Users can USE agents but NOT create, share, or publish them
  - No Code Interpreter (billing bypass risk)
  - No native web search (we use aivion-search model instead)
  - No RAG file search (no RAG API in Phase 1)
  - Memory enabled with opt-out (users can toggle per-conversation)

Run this once after initial LibreChat setup and after any LibreChat upgrade
that might reset role permissions to defaults.

Usage:
    python scripts/libra/setup_roles.py --apply
    python scripts/libra/setup_roles.py --show      # print current USER role perms
    python scripts/libra/setup_roles.py --dry-run   # show what would change

Environment:
    MONGO_URI       MongoDB connection string (default: mongodb://localhost:27017)
    LIBRECHAT_DB    Database name (default: LibreChat)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from _mongo import get_db  # noqa: E402

# Target permission state for the consumer USER role.
# true  = feature enabled for all users
# false = feature disabled for all users (they cannot turn it on)
TARGET_USER_PERMISSIONS: dict = {
    "MARKETPLACE": {
        "USE": True,           # users can browse and start public agents
    },
    "AGENTS": {
        "USE": True,
        "CREATE": False,       # only Aivion ops creates agents
        "SHARE": False,
        "SHARE_PUBLIC": False,
    },
    "PROMPTS": {
        "USE": True,
        "CREATE": False,       # no custom prompts
        "SHARE": False,
        "SHARE_PUBLIC": False,
    },
    "MCP_SERVERS": {
        "USE": True,           # Phase 2: Bifrost MCP via LibreChat
        "CREATE": False,       # users cannot add their own MCP servers
    },
    "MEMORIES": {
        "USE": True,           # memory enabled on regular chat
        "OPT_OUT": True,       # users can permanently opt out (privacy)
    },
    "RUN_CODE": {
        "USE": False,          # Code Interpreter: billing bypass risk, Phase 1 skip
    },
    "WEB_SEARCH": {
        "USE": False,          # use aivion-search model instead
    },
    "FILE_SEARCH": {
        "USE": False,          # no RAG API in Phase 1
    },
}


def _flatten(perms: dict, prefix: str = "") -> dict[str, bool]:
    out: dict[str, bool] = {}
    for k, v in perms.items():
        key = f"{prefix}{k}" if not prefix else f"{prefix}.{k}"
        if isinstance(v, dict):
            out.update(_flatten(v, key))
        else:
            out[key] = v
    return out


def show_role(db: object, role_name: str = "USER") -> int:
    role = db.roles.find_one({"name": role_name})
    if not role:
        print(f"Role '{role_name}' not found in MongoDB roles collection.")
        print("LibreChat may store roles differently in this version.")
        print("Try: db.getCollectionNames() to inspect available collections.")
        return 1
    print(f"Current '{role_name}' permissions:")
    perms = role.get("permissions") or role.get("grants") or {}
    print(json.dumps(perms, indent=2))
    return 0


def apply_permissions(db: object, *, dry_run: bool = False) -> int:
    role = db.roles.find_one({"name": "USER"})
    if not role:
        # LibreChat may not have initialised roles yet (no users logged in).
        # Insert the role document with our target permissions.
        if dry_run:
            print("USER role not found — would insert with target permissions.")
            print(json.dumps(TARGET_USER_PERMISSIONS, indent=2))
            return 0
        db.roles.insert_one({"name": "USER", "permissions": TARGET_USER_PERMISSIONS})
        print("✓ USER role created with target permissions.")
        return 0

    current = role.get("permissions") or {}
    current_flat = _flatten(current)
    target_flat = _flatten(TARGET_USER_PERMISSIONS)

    changes: list[tuple[str, bool | None, bool]] = []
    for key, target_val in target_flat.items():
        current_val = current_flat.get(key)
        if current_val != target_val:
            changes.append((key, current_val, target_val))

    if not changes:
        print("USER role permissions already match target — no changes needed.")
        return 0

    print(f"{'Key':<40} {'Current':<10} {'Target'}")
    print("-" * 65)
    for key, cur, tgt in changes:
        cur_str = str(cur) if cur is not None else "(missing)"
        print(f"  {key:<38} {cur_str:<10} → {tgt}")

    if dry_run:
        print(f"\n{len(changes)} change(s) would be applied.")
        return 0

    db.roles.update_one(
        {"name": "USER"},
        {"$set": {"permissions": TARGET_USER_PERMISSIONS}},
    )
    print(f"\n✓ USER role updated ({len(changes)} change(s) applied).")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="Apply target permissions to USER role")
    parser.add_argument("--show", action="store_true", help="Show current USER role permissions")
    parser.add_argument("--dry-run", action="store_true", help="Show changes without applying")
    args = parser.parse_args()

    if not any([args.apply, args.show, args.dry_run]):
        parser.error("one of --apply, --show, --dry-run is required")

    db = get_db()
    print(f"Connected to MongoDB → {db.name}")

    if args.show:
        return show_role(db)

    return apply_permissions(db, dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
