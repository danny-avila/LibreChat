# Upstream Sync Strategy

This repository is a commercial fork of [LibreChat](https://github.com/danny-avila/LibreChat), renamed to **Graupel**.

## Sync Policy

- The `upstream` remote points to `danny-avila/LibreChat`
- **Only cherry-pick** security fixes and critical bugfixes from upstream
- **Do not** periodically merge `upstream/main` — the codebases have diverged intentionally
- Monthly: review upstream changelog, decide if any commit is worth cherry-picking

## Commands

```bash
# Fetch upstream
git fetch upstream

# Cherry-pick a specific fix
git cherry-pick <commit-hash>

# View divergence
git log --oneline upstream/main..HEAD | head -20
```

## History

- Forked from LibreChat at commit `e236e8d68` on 2026-05-21
- Reason: commercial SaaS product (Graupel) targeting overseas English market
