# Upstream LibreChat Sync

This fork tracks [danny-avila/LibreChat](https://github.com/danny-avila/LibreChat). The sync process is automated via `.github/workflows/upstream-sync.yml` and runs every Monday at 09:00 UTC, or on demand via `workflow_dispatch`.

---

## How it works

1. The workflow fetches `upstream/main` (public LibreChat repo).
2. It creates a branch `sync/upstream-YYYYMMDD` and merges into it.
3. Files listed in `.gitattributes` as `merge=ours` are auto-resolved in our favour — no manual action needed for those.
4. Remaining conflicts (shared files) are flagged in the PR body with a list of files to resolve.
5. A PR is opened against `main` for team review.

### One-time local setup

To run merges locally, register the `ours` merge driver once:

```bash
git config merge.ours.driver true
git remote add upstream https://github.com/danny-avila/LibreChat.git
```

---

## File ownership classification

### Always ours — auto-resolved on merge

These files are entirely fork-specific. Conflicts are resolved automatically via `.gitattributes`.

| Path | Reason |
|---|---|
| `api/app/clients/tools/util/{gmail,googleDrive,googleCalendar,microsoftMail,microsoftOneDrive,microsoftCalendar,dropbox,box,clio}.js` | Nango OAuth integrations |
| `api/server/routes/admin/**` | Tenant & admin management |
| `api/server/services/Scheduler/**` | Scheduled skills backend |
| `api/server/routes/skillSchedules.js` | Skills API route |
| `api/server/routes/config.js` | SMB Team branding & defaults |
| `client/src/components/Integrations/**` | OAuth provider picker UIs |
| `client/src/components/ScheduledSkills/**` | Scheduler UI |
| `client/src/components/Skills/SaveSkillBanner.tsx` | Save-to-memory banner |
| `librechat.yaml` | Curated model/endpoint config, MCP server |

### Shared — manual review required on each sync PR

| Path | Notes |
|---|---|
| `packages/data-provider/src/` | We extend upstream types; check for conflicts with our additions |
| `packages/api/src/` | New upstream backend modules; check for overlap with our `/packages/api` work |
| `api/server/routes/` (non-admin) | Core routes; check for conflicts with our middleware |
| `client/src/components/` (non-custom) | Core UI; pick up upstream changes unless they touch our feature areas |
| `package.json` / `package-lock.json` | Dependency changes; review carefully for version conflicts |

### Freely take from upstream

| Path | Notes |
|---|---|
| `client/src/locales/{de,pt-BR,da,fi,nn,pl,...}/` | Other-language translations — always take upstream |
| `packages/agents/` | Core agent framework improvements |
| Security patches in any file | Always apply; override ownership rules manually if needed |

---

## Merge resolution playbook

When the sync PR has **unresolved conflicts** in shared files:

```bash
git fetch origin
git checkout sync/upstream-YYYYMMDD

# For each conflicting file:
git diff --name-only --diff-filter=U

# Open the file. Conflict markers:
#   <<<<<<< HEAD           ← our version
#   =======
#   >>>>>>> upstream/main  ← upstream version

# Decision rule:
#   - Block added by us (new route, new hook, etc.) → keep ours + manually merge upstream's change alongside
#   - Block that was untouched LibreChat code → take upstream
```

After resolving:
```bash
git add <resolved-files>
git commit -m "chore: resolve upstream sync conflicts"
git push origin sync/upstream-YYYYMMDD
```

Then mark the PR ready for review.

---

## Deciding whether to adopt an upstream feature

When upstream adds a feature we've also built custom (e.g. a native Google Drive integration):

1. Compare feature completeness and auth approach.
2. If upstream's version is sufficient and uses a standard auth flow, prefer replacing our custom code with upstream's — less maintenance burden.
3. If our Nango-based version provides capabilities upstream's doesn't (e.g. multi-tenant token management), keep ours and leave a comment on the PR documenting the decision.

---

## Triggering a manual sync

Go to **Actions → Upstream LibreChat Sync → Run workflow**. Set `dry_run: true` to preview what would change without creating a branch or PR.
