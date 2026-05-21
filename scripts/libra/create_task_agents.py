"""Create LibreChat Agents for every task in tasks.yaml.

Reads tasks.yaml, creates one LibreChat Agent per task (idempotent by name),
and writes the returned agent IDs back into tasks.yaml as `librechat_agent_id`.

IMPORTANT — agent `instructions` field is intentionally left empty.
The system prompt lives in Bifrost Prompt Repository and is injected
via the Prompts Plugin (`x-bf-prompt-id` header). Filling both causes
duplicate system messages (Bifrost prepends without dedup). See biforst.md §2.3.

Phase 1 capabilities per agent: ["artifacts", "context"]
  - artifacts: render output as styled HTML / Mermaid in chat
  - context:   extract text from uploaded files inline (no RAG API needed)

Usage:
    # Create all agents that don't have a librechat_agent_id yet
    python scripts/libra/create_task_agents.py

    # Force-recreate / update all agents (ignores existing IDs)
    python scripts/libra/create_task_agents.py --force

    # Dry-run: show what would be created
    python scripts/libra/create_task_agents.py --dry-run

    # Create agents for one country only
    python scripts/libra/create_task_agents.py --country BD

Environment:
    LIBRECHAT_URL       LibreChat base URL (default: http://localhost:3081)
    LIBRECHAT_API_KEY   Admin API key from LibreChat UI → Settings → API Keys
    TASKS_YAML          Path to tasks.yaml (default: tasks.yaml in repo root)
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).parent))

from _librechat import LibreChatAdmin  # noqa: E402

REPO_ROOT = Path(__file__).parent.parent.parent
DEFAULT_TASKS_YAML = REPO_ROOT / "tasks.yaml"

# Capabilities enabled on every task agent (Phase 1 safe set).
# file_search and execute_code are Phase 2.
AGENT_CAPABILITIES = ["artifacts", "context"]

# Model→tier mapping for agent description generation.
MODEL_TIER: dict[str, str] = {
    "aivion-quick": "Quick",
    "aivion-mid": "Standard",
    "aivion-pro": "Premium",
}

# BDT price → conversation starter hint
def _starters(slug: str, display_name: str) -> list[str]:
    examples: dict[str, list[str]] = {
        "grammar-fix": ["Fix the grammar and tone of this text: [paste your text]"],
        "rewrite": ["Rewrite this shorter: [paste your text]", "Rewrite this in a more formal tone: [paste your text]"],
        "translate": ["Translate to English: [paste your text]", "Translate to Bangla: [paste your text]"],
        "formal-email": ["Write a formal email to my manager requesting a meeting about [topic]"],
        "leave-application": ["Write a leave application for [reason], from [start date] to [end date]"],
        "cv-prepare": ["Help me prepare a CV for a [job title] position at [company type]"],
        "cover-letter": ["Write a cover letter for a [job title] role at [company]"],
        "sop": ["Write an SOP for applying to [program] at [university]"],
        "business-plan": ["Write a business plan for a [type] business in Bangladesh"],
        "article-summary": ["Summarise this article: [paste article or upload PDF]"],
    }
    return examples.get(slug, [f"Help me with: {display_name}"])


def _agent_body(task: dict) -> dict:
    slug = task["slug"]
    display_name = task["display_name"]
    display_name_bn = task.get("display_name_bn", "")
    model = task["model"]
    tier = MODEL_TIER.get(model, model)
    price_bdt = task.get("price_bdt", "?")

    description_parts = [display_name]
    if display_name_bn:
        description_parts.append(f"({display_name_bn})")
    description_parts.append(f"· {tier} tier · {price_bdt} BDT")

    return {
        "name": display_name,
        "description": " ".join(description_parts),
        "instructions": "",   # MUST be empty — system prompt lives in Bifrost
        "model": model,
        "capabilities": AGENT_CAPABILITIES,
        "tools": [],
        "conversation_starters": _starters(slug, display_name),
        # Viewer ACL is set in LibreChat admin UI after creation (Public toggle).
        # There is no create-time ACL field in the agent API.
    }


def load_tasks(tasks_yaml: Path) -> list[dict]:
    with tasks_yaml.open() as f:
        return yaml.safe_load(f)


def save_tasks(tasks: list[dict], tasks_yaml: Path) -> None:
    with tasks_yaml.open("w") as f:
        yaml.dump(tasks, f, allow_unicode=True, sort_keys=False, default_flow_style=False)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--force", action="store_true", help="Update even agents that already have an ID")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--country", help="Filter to tasks with this country code (or '*')")
    parser.add_argument(
        "--tasks-yaml",
        type=Path,
        default=Path(os.environ.get("TASKS_YAML", DEFAULT_TASKS_YAML)),
        help=f"Path to tasks.yaml (default: {DEFAULT_TASKS_YAML})",
    )
    args = parser.parse_args()

    tasks_yaml: Path = args.tasks_yaml
    if not tasks_yaml.exists():
        print(f"error: tasks.yaml not found at {tasks_yaml}", file=sys.stderr)
        return 1

    tasks = load_tasks(tasks_yaml)

    if args.country:
        tasks = [t for t in tasks if t.get("country") in (args.country, "*")]
        print(f"Filtered to {len(tasks)} task(s) for country '{args.country}'")

    needs_update = [
        t for t in tasks
        if args.force or not t.get("librechat_agent_id")
    ]

    if not needs_update:
        print("All tasks already have librechat_agent_id. Use --force to re-sync.")
        return 0

    print(f"{len(needs_update)} agent(s) to create / update.")

    if args.dry_run:
        for t in needs_update:
            body = _agent_body(t)
            existing = t.get("librechat_agent_id", "(none)")
            print(f"\n  slug: {t['slug']}")
            print(f"  name: {body['name']}")
            print(f"  model: {body['model']}")
            print(f"  existing_id: {existing}")
        print("\n(dry-run — nothing written)")
        return 0

    with LibreChatAdmin() as lc:
        if not lc.ping():
            print(f"warning: LibreChat at {lc.base_url} may not be reachable")

        modified = False
        for t in needs_update:
            slug = t["slug"]
            print(f"\n=== {slug} ===")
            body = _agent_body(t)
            try:
                agent = lc.upsert_agent(body)
                agent_id = agent.get("id") or agent.get("_id")
                if agent_id:
                    t["librechat_agent_id"] = str(agent_id)
                    modified = True
                else:
                    print(f"  warning: no id returned for '{slug}' — response: {agent}")
            except Exception as e:
                print(f"  error creating agent for '{slug}': {e}")

        if modified:
            # Write all tasks back (not just the ones we touched, to preserve order).
            all_tasks = load_tasks(tasks_yaml)
            id_map = {t["slug"]: t.get("librechat_agent_id") for t in tasks if t.get("librechat_agent_id")}
            for t in all_tasks:
                if t["slug"] in id_map:
                    t["librechat_agent_id"] = id_map[t["slug"]]
            save_tasks(all_tasks, tasks_yaml)
            print(f"\n✓ tasks.yaml updated with {len(id_map)} agent ID(s).")
        else:
            print("\nNo agent IDs to write back.")

        print("\n⚠️  Remember to set each agent to Public (viewer ACL) in the")
        print("   LibreChat admin panel so users can access them.")
        print("   Agents → [agent] → Share → Public toggle ON")

    return 0


if __name__ == "__main__":
    sys.exit(main())
