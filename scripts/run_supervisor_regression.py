#!/usr/bin/env python3
"""Run the Woodland supervisor agent against a dataset using real LibreChat credentials.

Usage:
    python scripts/run_supervisor_regression.py \
        --base-url https://your-librechat-domain \
        --email user@example.com

The script will prompt for the password (or read from --password / env var),
log in to LibreChat, obtain a bearer token, and then replay every row in
`scripts/langfuse_dataset_variables.csv` against the supervisor agent.
Results (PASS/FAIL) are printed to stdout along with a summary at the end.
"""

import argparse
import csv
import json
import os
import sys
import time
from getpass import getpass
from pathlib import Path
from typing import Dict, Tuple

import requests

DEFAULT_DATASET_PATH = Path("scripts/langfuse_dataset_variables.csv")


def login(base_url: str, email: str, password: str) -> Tuple[str, Dict]:
    """Authenticate with LibreChat using email/password and return (token, user)."""
    url = f"{base_url.rstrip('/')}/api/auth/login"
    response = requests.post(
        url,
        json={"email": email, "password": password},
        timeout=30,
    )
    if response.status_code != 200:
        raise RuntimeError(f"Login failed ({response.status_code}): {response.text}")

    data = response.json()
    token = data.get("token")
    if not token:
        raise RuntimeError(f"Login response did not include a token: {data}")
    return token, data.get("user", {})


def call_supervisor(base_url: str, token: str, prompt: str) -> str:
    """Send a single prompt to the LibreChat supervisor endpoint."""
    url = f"{base_url.rstrip('/')}/api/openai/v1/chat/completions"
    payload = {
        "model": "supervisor",
        "messages": [
            {"role": "user", "content": prompt},
        ],
        "stream": False,
    }
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    response = requests.post(url, json=payload, headers=headers, timeout=60)
    if response.status_code != 200:
        raise RuntimeError(f"Supervisor call failed ({response.status_code}): {response.text}")

    data = response.json()
    try:
        return data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError) as exc:
        raise RuntimeError(f"Unexpected response format: {data}") from exc


def load_dataset(path: Path):
    """Yield rows from the CSV dataset."""
    with path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            variables = json.loads(row["variables"])
            metadata = json.loads(row.get("metadata") or "{}")
            yield {
                "id": metadata.get("id", ""),
                "prompt": variables.get("input", ""),
                "expected": row.get("expected_output", ""),
            }


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate LibreChat supervisor with a dataset.")
    parser.add_argument("--base-url", required=True, help="Base URL of the LibreChat deployment.")
    parser.add_argument("--email", required=True, help="LibreChat user email for authentication.")
    parser.add_argument(
        "--password",
        help="LibreChat user password (if not provided, you will be prompted).",
    )
    parser.add_argument(
        "--dataset",
        type=Path,
        default=DEFAULT_DATASET_PATH,
        help=f"Path to CSV dataset (default: {DEFAULT_DATASET_PATH}).",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=0.2,
        help="Pause between requests in seconds (default: 0.2).",
    )
    args = parser.parse_args()

    password = args.password or os.getenv("LIBRECHAT_PASSWORD") or getpass("LibreChat password: ")

    try:
        token, user = login(args.base_url, args.email, password)
    except Exception as exc:
        print(f"Failed to authenticate: {exc}", file=sys.stderr)
        sys.exit(1)

    print(f"Logged in as {user.get('email', args.email)}.")

    rows = list(load_dataset(args.dataset))
    total = len(rows)
    passed = 0

    for idx, row in enumerate(rows, start=1):
        question_id = row["id"] or f"row-{idx}"
        prompt = row["prompt"]
        expected = row["expected"]

        if not prompt:
            print(f"[SKIP] {question_id}: empty prompt")
            continue

        try:
            answer = call_supervisor(args.base_url, token, prompt)
        except Exception as exc:
            print(f"[ERROR] {question_id}: {exc}")
            continue

        match = expected.lower() in answer.lower() if expected else True
        status = "PASS" if match else "FAIL"
        if match:
            passed += 1
        print(f"[{status}] {question_id}")
        if not match:
            print(f"  Prompt   : {prompt}")
            print(f"  Expected : {expected[:200]}{'…' if len(expected) > 200 else ''}")
            print(f"  Received : {answer[:200]}{'…' if len(answer) > 200 else ''}\n")

        time.sleep(max(args.sleep, 0))

    print(f"\nSummary: {passed}/{total} passed.")


if __name__ == "__main__":
    main()
