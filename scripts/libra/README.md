# LibreChat setup scripts (`scripts/libra/`)

Idempotent scripts for configuring and validating the LibreChat instance
(`aivion-router/chat/`) that sits on top of the gateway.

## Layout

```
scripts/libra/
├── _mongo.py               Shared MongoDB client (do not run directly)
├── _librechat.py           Shared LibreChat API client (do not run directly)
├── check_admin.py          Verify / fix first-user admin account
├── setup_roles.py          Harden USER role permissions
├── create_task_agents.py   Create LibreChat Agents from tasks.yaml
├── verify_tasks.py         Pre-flight check before every deploy
└── README.md               This file
```

## Requirements

```bash
pip install pymongo httpx pyyaml
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `MONGO_URI` | `mongodb://localhost:27017` | LibreChat MongoDB connection string |
| `LIBRECHAT_DB` | `LibreChat` | MongoDB database name |
| `LIBRECHAT_URL` | `http://localhost:3081` | LibreChat base URL |
| `LIBRECHAT_API_KEY` | (required) | Admin API key from LibreChat UI → Settings → API Keys |
| `BIFROST_BASE_URL` | `http://localhost:8081` | Bifrost endpoint (for verify_tasks.py) |
| `TASKS_YAML` | `<repo-root>/tasks.yaml` | Path to task catalog |

## Recommended run order (Week 2 setup)

### 1. Fix admin account (run before sharing the URL)

```bash
# Check who registered first
python scripts/libra/check_admin.py --list

# Promote yourself
python scripts/libra/check_admin.py --set-admin raianul.berlin@gmail.com

# Demote anyone who got there first
python scripts/libra/check_admin.py --set-user wrong@email.com
```

### 2. Harden USER role permissions

```bash
# Preview changes
python scripts/libra/setup_roles.py --dry-run

# Apply
python scripts/libra/setup_roles.py --apply

# Verify
python scripts/libra/setup_roles.py --show
```

### 3. Create task agents (Week 3 — after Bifrost prompts are committed)

First fill in `bifrost_prompt_id` values in `tasks.yaml` (UUID from Bifrost
Playground after explicitly clicking "Commit Version"). Then:

```bash
# Dry-run to preview
python scripts/libra/create_task_agents.py --dry-run

# Create all agents and write IDs back to tasks.yaml
python scripts/libra/create_task_agents.py

# Bangladesh tasks only
python scripts/libra/create_task_agents.py --country BD
```

After creation, go to LibreChat admin UI and set each task agent to **Public**
(viewer ACL) so users can access but not edit them:
`Agents → [agent name] → Share → Public toggle ON`

### 4. Verify before every deploy

```bash
# Full check (Bifrost prompts + LibreChat agents)
python scripts/libra/verify_tasks.py

# Bifrost prompts only (no LibreChat API key needed)
python scripts/libra/verify_tasks.py --skip-librechat
```

Exit code 0 = safe to deploy. Exit code 1 = blocking errors, fix first.

## Key rules from biforst.md

**Agent `instructions` MUST be empty.**
The system prompt lives in Bifrost Prompt Repository, injected via the Prompts
Plugin (`x-bf-prompt-id` header). LibreChat's `instructions` field and Bifrost's
prompt both inject a system message — Bifrost prepends without dedup. Both set =
two system messages sent to the provider. `create_task_agents.py` enforces this
automatically. `verify_tasks.py` warns if it detects a non-empty instructions field.

**Never use `bifrost_prompt_version: 0` or omit the version.**
Omitting the `x-bf-prompt-version` header defaults to the latest committed version,
meaning any new commit immediately hits production with no review gate.
Always pin an explicit integer version in `tasks.yaml`.

**Saving ≠ committing in Bifrost Playground.**
After editing a prompt session, you must click "Commit Version" explicitly
to create an immutable numbered version. Only committed versions are callable
via `x-bf-prompt-version`.

## LibreChat quirks

- **Agents API is Beta.** The CRUD endpoints (`POST /api/agents`,
  `PATCH /api/agents/:id`) exist but may change between LibreChat versions.
  If `create_task_agents.py` fails with 404, check the running LibreChat version
  and inspect `/api` route handlers in the LibreChat source.

- **MongoDB role collection name may vary.** `setup_roles.py` writes to
  `db.roles`. If your LibreChat version stores permissions differently (e.g.
  in `db.config` or as part of `db.users`), the script will create a `roles`
  document that LibreChat ignores. Run `--show` first and inspect the output.

- **API key scope.** LibreChat API keys are scoped to the generating user's
  permissions. If `create_task_agents.py` gets 403, the key was generated from
  a non-admin account.
