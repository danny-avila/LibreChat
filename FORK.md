# LibreChat-Maasu v0.8.7 baseline

This branch provides the official LibreChat v0.8.7 source as the starting point
for Maasu development.

- Fork: https://github.com/Maasu-de/LibreChat-Maasu
- Branch: `governed-v0.8.7`
- Upstream: https://github.com/danny-avila/LibreChat
- Release: https://github.com/danny-avila/LibreChat/releases/tag/v0.8.7
- Upstream tag: `v0.8.7` (marked as a pre-release on GitHub)
- Upstream commit: `9e74cc0e57b395926122bd4062c1fcedc48ed465`
- Branch setup author: Muna Abu Jaber <munaabujaber@outlook.com>

The initial fork commit adds only this document. All application source,
configuration examples, dependency lockfiles, and deployment files come from
the upstream tag. Upstream history, contributor attribution, and the original
license are preserved.

Maasu-specific changes on `governed-v0.8.4` have not been ported to this branch.
This branch establishes the upstream baseline for that future work.

## Publish the branch

Run from the repository root:

```bash
git switch governed-v0.8.7
git push --set-upstream origin governed-v0.8.7
```

## Verify the baseline

```bash
git rev-parse 'v0.8.7^{commit}'
git diff --stat v0.8.7...governed-v0.8.7
```

Immediately after branch setup, the diff contains only `FORK.md`.
Refer to `README.md` and the upstream configuration examples for application setup.
