"""Verify or fix the LibreChat admin account via MongoDB.

The first user who signs in through LibreChat's Clerk OIDC becomes ADMIN
automatically. If the wrong person hit the URL first, use this script to
reassign the ADMIN role before you open LibreChat to other users.

Run this BEFORE sharing the LibreChat URL with anyone.

Usage:
    # List all users and their roles
    python scripts/libra/check_admin.py --list

    # Promote to ADMIN
    python scripts/libra/check_admin.py --set-admin your@email.com

    # Demote to USER
    python scripts/libra/check_admin.py --set-user wrong@email.com

Environment:
    MONGO_URI       MongoDB connection string (default: mongodb://localhost:27017)
    LIBRECHAT_DB    Database name (default: LibreChat)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from _mongo import get_db  # noqa: E402


def list_users(db: object) -> int:
    users = list(db.users.find({}, {"email": 1, "role": 1, "provider": 1, "createdAt": 1}))
    if not users:
        print("No users found. LibreChat may not have been accessed yet.")
        return 0

    print(f"{'Role':<10} {'Provider':<12} {'Email'}")
    print("-" * 60)
    for u in sorted(users, key=lambda x: x.get("role", "USER")):
        role = u.get("role", "USER")
        provider = u.get("provider", "?")
        email = u.get("email", "(no email)")
        marker = " ← ADMIN" if role == "ADMIN" else ""
        print(f"{role:<10} {provider:<12} {email}{marker}")
    return 0


def set_role(db: object, email: str, role: str) -> int:
    result = db.users.update_one({"email": email}, {"$set": {"role": role}})
    if result.matched_count == 0:
        print(f"error: no user found with email '{email}'", file=sys.stderr)
        print("Tip: run --list to see all registered emails.")
        return 1
    if result.modified_count == 0:
        print(f"User '{email}' already has role '{role}' — no change needed.")
        return 0
    print(f"✓ User '{email}' role set to '{role}'.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--list", action="store_true", help="List all users and roles")
    parser.add_argument("--set-admin", metavar="EMAIL", help="Promote this email to ADMIN")
    parser.add_argument("--set-user", metavar="EMAIL", help="Demote this email to USER")
    args = parser.parse_args()

    if not any([args.list, args.set_admin, args.set_user]):
        parser.error("one of --list, --set-admin, --set-user is required")

    db = get_db()
    print(f"Connected to MongoDB → {db.name}")

    if args.list:
        return list_users(db)
    if args.set_admin:
        return set_role(db, args.set_admin, "ADMIN")
    if args.set_user:
        return set_role(db, args.set_user, "USER")
    return 0


if __name__ == "__main__":
    sys.exit(main())
