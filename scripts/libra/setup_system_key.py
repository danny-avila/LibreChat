"""Provision the LibreChat system identity in the gateway.

Creates a no-bill customer + default team + VK for LibreChat's system key.
Idempotent: safe to re-run — both the customer and team endpoints are
idempotent on slug, and the VK endpoint mints a fresh key only if needed.

Usage (gateway must be running):

    # Default: gateway at http://localhost:8003
    python scripts/libra/setup_system_key.py

    # Custom gateway URL
    GATEWAY_URL=http://localhost:8000 python scripts/libra/setup_system_key.py

Output: prints the VK plaintext to paste into .env as LIBRECHAT_GATEWAY_KEY.
"""

from __future__ import annotations

import os
import sys

import httpx

GATEWAY_URL = os.environ.get("GATEWAY_URL", "http://localhost:8003").rstrip("/")
INTERNAL_TOKEN = os.environ.get("INTERNAL_SERVICE_TOKEN", "dev-internal-token-rotate-me")

CUSTOMER_SLUG = "librechat-system"
TEAM_SLUG = "librechat-system-default"

HEADERS = {
    "Authorization": f"Bearer {INTERNAL_TOKEN}",
    "Content-Type": "application/json",
}


def run() -> int:
    with httpx.Client(base_url=GATEWAY_URL, headers=HEADERS, timeout=30) as client:
        print(f"Gateway: {GATEWAY_URL}")

        # 1. Ensure no-bill customer exists.
        print("\n[1/2] Ensuring librechat-system customer ...")
        r = client.post(
            "/internal/customers",
            json={
                "slug": CUSTOMER_SLUG,
                "name": "LibreChat System",
                "kind": "platform",
                "no_bill": True,
            },
        )
        if r.status_code not in (200, 201):
            print(f"  ERROR {r.status_code}: {r.text[:400]}", file=sys.stderr)
            return 1
        customer = r.json()
        print(f"  customer id={customer['id']}  bifrost={customer.get('bifrost_customer_id')}  no_bill={customer['no_bill']}")

        # 2. Create default team + VK (idempotent on team slug).
        print("\n[2/2] Creating default team + VK ...")
        r2 = client.post(
            f"/internal/customers/{CUSTOMER_SLUG}/teams",
            json={
                "slug": TEAM_SLUG,
                "name": "LibreChat System Team",
                "create_default_vk": True,
                "default_vk_label": "librechat-gateway",
            },
        )
        if r2.status_code not in (200, 201):
            print(f"  ERROR {r2.status_code}: {r2.text[:400]}", file=sys.stderr)
            return 2
        team = r2.json()
        vk = team.get("default_vk") or {}
        plaintext = vk.get("plaintext")

        if not plaintext:
            print(
                "  Team already existed — a VK was not re-minted (idempotent).\n"
                "  If you need a fresh key, delete the team from the DB and re-run.",
                file=sys.stderr,
            )
            return 3

        print(f"  team id={team['id']}  bifrost={team.get('bifrost_team_id')}")
        print()
        print("=" * 70)
        print("LIBRECHAT_GATEWAY_KEY (add this to aivion-router/.env):")
        print()
        print(f"  LIBRECHAT_GATEWAY_KEY={plaintext}")
        print()
        print("=" * 70)

    return 0


if __name__ == "__main__":
    sys.exit(run())
