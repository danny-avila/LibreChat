"""Pre-flight validation for tasks.yaml — run before every deploy.

Checks:
  1. Every bifrost_prompt_id is non-empty and resolves in Bifrost
  2. The pinned bifrost_prompt_version exists for each prompt
  3. Every librechat_agent_id is non-empty and resolves in LibreChat
  4. No task uses bifrost_prompt_version: 0 (prohibited — see biforst.md §9.2.3)

The Bifrost Prompts Plugin silently passes through invalid prompt IDs with no
error — the request just goes to the provider with no system prompt injected.
This check catches typos and missing commits before they hit users.

Exit codes:
    0  all checks passed
    1  one or more checks failed (details printed)
    2  configuration error (missing env var, unreachable service)

Usage:
    python scripts/libra/verify_tasks.py
    python scripts/libra/verify_tasks.py --skip-librechat   # only verify Bifrost
    python scripts/libra/verify_tasks.py --tasks-yaml /path/to/tasks.yaml

Environment:
    BIFROST_BASE_URL    Bifrost endpoint (default: http://localhost:8081)
    LIBRECHAT_URL       LibreChat endpoint (default: http://localhost:3081)
    LIBRECHAT_API_KEY   Admin API key (required unless --skip-librechat)
    TASKS_YAML          Path to tasks.yaml (default: repo root)
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent / "bifrost"))

from _client import BifrostAdmin  # noqa: E402

REPO_ROOT = Path(__file__).parent.parent.parent
DEFAULT_TASKS_YAML = REPO_ROOT / "tasks.yaml"

PASS = "✓"
FAIL = "✗"
WARN = "⚠"


def load_tasks(tasks_yaml: Path) -> list[dict]:
    with tasks_yaml.open() as f:
        return yaml.safe_load(f)


def check_bifrost(tasks: list[dict], admin: BifrostAdmin) -> list[str]:
    errors: list[str] = []

    for t in tasks:
        slug = t["slug"]
        prompt_id = t.get("bifrost_prompt_id", "")
        version = t.get("bifrost_prompt_version")

        if not prompt_id:
            errors.append(f"{FAIL} [{slug}] bifrost_prompt_id is empty — create prompt in Bifrost Playground first")
            continue

        if version == 0 or version is None:
            errors.append(f"{FAIL} [{slug}] bifrost_prompt_version must be >= 1, got {version!r}")
            continue

        prompt = admin.get_prompt(prompt_id)
        if prompt is None:
            errors.append(f"{FAIL} [{slug}] bifrost_prompt_id '{prompt_id}' not found in Bifrost")
            continue

        version_data = admin.get_prompt_version(prompt_id, version)
        if version_data is None:
            errors.append(
                f"{FAIL} [{slug}] version {version} of prompt '{prompt_id}' not found — "
                f"did you Commit Version in Bifrost Playground?"
            )
            continue

        print(f"  {PASS} [{slug}] bifrost prompt v{version} OK")

    return errors


def check_librechat(tasks: list[dict]) -> list[str]:
    # Import here so --skip-librechat avoids the env var requirement
    try:
        from _librechat import LibreChatAdmin
    except SystemExit:
        return ["LibreChat API key not set — use --skip-librechat to skip this check"]

    errors: list[str] = []
    with LibreChatAdmin() as lc:
        for t in tasks:
            slug = t["slug"]
            agent_id = t.get("librechat_agent_id", "")
            if not agent_id:
                errors.append(
                    f"{WARN} [{slug}] librechat_agent_id is empty — "
                    f"run scripts/libra/create_task_agents.py"
                )
                continue

            agent = lc.get_agent(agent_id)
            if agent is None:
                errors.append(
                    f"{FAIL} [{slug}] librechat_agent_id '{agent_id}' not found — "
                    f"agent may have been deleted"
                )
                continue

            instructions = agent.get("instructions") or ""
            if instructions.strip():
                errors.append(
                    f"{WARN} [{slug}] agent '{agent_id}' has non-empty instructions — "
                    f"this will cause duplicate system messages with Bifrost Prompts Plugin"
                )
            else:
                print(f"  {PASS} [{slug}] LibreChat agent '{agent.get('name')}' OK")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--skip-librechat", action="store_true", help="Only verify Bifrost prompts")
    parser.add_argument(
        "--tasks-yaml",
        type=Path,
        default=Path(os.environ.get("TASKS_YAML", DEFAULT_TASKS_YAML)),
    )
    args = parser.parse_args()

    tasks_yaml: Path = args.tasks_yaml
    if not tasks_yaml.exists():
        print(f"error: tasks.yaml not found at {tasks_yaml}", file=sys.stderr)
        return 2

    tasks = load_tasks(tasks_yaml)
    print(f"Loaded {len(tasks)} task(s) from {tasks_yaml}")

    all_errors: list[str] = []

    print("\n--- Bifrost Prompt Repository ---")
    with BifrostAdmin() as admin:
        try:
            admin.list_prompts()  # connectivity check
        except Exception as e:
            print(f"error: cannot reach Bifrost: {e}", file=sys.stderr)
            return 2
        all_errors.extend(check_bifrost(tasks, admin))

    if not args.skip_librechat:
        print("\n--- LibreChat Agents ---")
        all_errors.extend(check_librechat(tasks))
    else:
        print("\n--- LibreChat Agents --- (skipped)")

    print()
    if not all_errors:
        print(f"{PASS} All checks passed. tasks.yaml is ready to deploy.")
        return 0

    print(f"Found {len(all_errors)} issue(s):")
    for e in all_errors:
        print(f"  {e}")

    # Warnings (⚠) are non-fatal; errors (✗) block deploy
    fatal = [e for e in all_errors if e.startswith(FAIL)]
    if fatal:
        print(f"\n{len(fatal)} blocking error(s). Fix before deploying.")
        return 1

    print("\nAll issues are warnings — deploy can proceed, but review them.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
