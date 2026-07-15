# OneCode LibreChat Shell

Community baseline: LibreChat v0.8.7

Community commit: `9e74cc0e5`

OneCode upgrade branch: `feature/onecode-shell-v087-hardening`

OneCode remains the execution and approval authority. LibreChat provides the authenticated Web shell, conversations, settings, and chat interaction surface.

## Local Runtime

- OneCode API: `127.0.0.1:19080`
- LibreChat: `127.0.0.1:14080`
- MongoDB: `127.0.0.1:39017`
- Persistent state: `~/.onecode/shell`, overridable with `--state-dir`
- Model timeout: 60 seconds by default, configurable in `(0, 600]` with `--model-timeout-seconds`

The state directory stores private shell authentication state, persistent Mongo data, bounded service logs, generated LibreChat configuration, and a redacted runtime status record. Authentication state is reused across restarts and written with private permissions.

The OneCode custom endpoint sets `maxRetries: 0`. A timed-out model request therefore produces one bounded request, one failed model-call terminal event, and one structured HTTP 504 response instead of a LibreChat retry cascade.

Start the isolated shell from the OneCode repository and point `--librechat-dir` at this checkout. Use `onecode shell-status` to inspect service health and redacted runtime paths.

## Rollback

The pre-upgrade customization is preserved on `checkpoint/onecode-shell-pre-v087-20260715`. Rollback is a deliberate branch/worktree selection; no automatic cutover or destructive cleanup is performed by the upgrade.

## License And Provenance

The repository `LICENSE` records the upstream MIT license. The upstream root package manifest records ISC metadata. Both records are preserved from the community baseline.
