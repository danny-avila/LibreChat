# Issue Log

| # | Date-Time (UTC) | Issue Summary | Fix Summary | Plan |
|---|---|---|---|---|
| 1 | 2026-02-28 07:05 | `librechat.yaml` not found inside Docker container (`ENOENT: no such file or directory, open '/app/librechat.yaml'`). The `docker-compose.yml` does not mount the file into the container. Additionally, the config used an outdated version (`1.1.5` vs expected `1.3.4`) and an invalid `models` schema (object with `default`/`fetch` keys instead of a flat string array). | Created `docker-compose.override.yml` to bind-mount `librechat.yaml` into the container at `/app/librechat.yaml`. Updated config version to `1.3.4`. Fixed `endpoints.anthropic.models` to use a flat array of model name strings. Updated the setup guide to document the override file requirement. | [Plan](.cursor/plans/fix_librechat.yaml_mount_554349b7.plan.md) |
