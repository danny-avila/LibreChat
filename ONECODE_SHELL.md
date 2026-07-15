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

## Verification

Verified implementation head before this documentation update:
`cde7eef12ba7bae8aac1b186a62e429d0f7f4fd8`.

- OneCode final full suite: 903 passed, 1 environment-only skip; source-quality
  and doctor passed.
- LibreChat focused suites: 35 endpoint, 27 server, and 28 client tests passed.
- Data-provider, API, and client production builds passed; the client transformed
  9,315 modules and completed its PWA post-build.
- Desktop and mobile browser checks covered login, project state, all Console
  tabs, read execution, approval-required writes, keyboard focus, and a visible
  bounded HTTP 504. Browser console result: 0 errors and 0 warnings.
- Controlled restarts reused the same private authentication file and Mongo
  directory, preserved the authenticated session, and produced no
  `invalid signature` log entry.
- A delayed-model request generated one new OneCode run with started-to-failed
  model events, readable ledger/manifest/checkpoint evidence, and a matching
  SHA-256 task digest. No model credential was written to the run evidence.

The complete verification and 54-row migration inventory are recorded in the
OneCode repository at
`docs/ONECODE_LIBRECHAT_V087_HARDENING_CLOSURE_2026-07-15.md`.

## License And Provenance

The repository `LICENSE` records the upstream MIT license. The upstream root package manifest records ISC metadata. Both records are preserved from the community baseline.
