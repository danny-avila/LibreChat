# Native BYOM acceptance

Run one deterministic, opt-in acceptance test through the real LibreChat UI →
authenticated Code API → outbound paired `@librechat/code` CLI → native SRT path.
Only the model is a fixture. No paid model credentials are needed.

## Prerequisites

- A built LibreChat checkout, including its client and workspace packages, with
  development dependencies and Playwright Chromium installed.
- A built `LibreChat-AI/code-interpreter` checkout with service dependencies and
  `packages/code` dependencies installed. Build both the service and code package.
  The standalone service build currently also needs its async Python template:
  `cp service/src/matplotlib-async.py service/.build-service/src/matplotlib-async.py`.
- Node 24, `redis-server`, and the native SRT prerequisites for your platform.
  macOS uses Seatbelt; Linux requires Bubblewrap and Socat. `rg` must be on PATH.
  The code package's existing native-runtime documentation is authoritative.
- MongoDB Memory Server can use its cached binary or download one on the first run.

From the LibreChat root:

```sh
BYOM_CODE_REPO=/absolute/path/to/code-interpreter node e2e/byom/run.mjs
```

Optional: `BYOM_REDIS_BIN` selects an absolute Redis executable,
`BYOM_CODE_CLI` selects a separately built worker CLI, and
`E2E_CHROMIUM_CHANNEL=chrome` uses an installed Chrome instead of Playwright Chromium.
The worker package/toolchain must be readable under its native sandbox policy;
do not relax that policy to make the test pass.

## What must pass

1. Self-service enrollment through LibreChat and real CLI pairing for two workers.
2. Native SRT capability reported by each worker, plus approved sandboxed Bash.
3. Standalone approved `create_file` physically writes the expected bytes.
4. A subsequent `read_file` returns those bytes through LibreChat.
5. Approved `edit_file` persists; a browser reload and another turn see the edit.
6. Rejected creation leaves no file, and creation has no side effect before approval.
7. Selecting worker B does not expose worker A's file; B's write leaves A unchanged.
8. Stopping B produces a persisted tool failure, not success or fallback to A.

Assertions inspect **tool outputs**, not echoed arguments or the model's final prose.
The default hosted Code API URL is deliberately pointed at an invalid local route,
so an accidental routing regression can never send fixtures to a production endpoint.

## Isolation and evidence

Every run creates its own MongoDB, Redis, Code API, LibreChat, two worker identities,
and workspaces. Ports are dynamically assigned, not the usual development ports.
Listeners are loopback-only. No existing database, launchd worker, pairing, or project
directory is reused. Children receive an allowlisted environment; checkout `.env`
keys are neutralized. Mutations require real UI approval; reads are explicitly allowed.

The command stops its children on success, failure, SIGINT, and SIGTERM. The private
temporary run directory is printed and retained for debugging; it contains test-only
identity files and logs, so do not publish it. Playwright traces, screenshots, and
videos are disabled to avoid recording authentication or pairing material. A successful
test attaches a small assertion summary. Exit status is nonzero on failure.

This is not a whole-suite runner and is not enabled implicitly in ordinary CI.
Run it after relevant routing, approval, worker, or dependency changes. It proves the
tested native workflow, not fleet load capacity, sandbox escape resistance, remote
Git authentication, or attachment/artifact transport. Windows should run it inside
WSL2; a macOS pass does not certify WSL2/Linux support.

## Dependency

Requires LibreChat #15675 (standalone create-file routing). Keep the acceptance PR
stacked on that fix until it lands in `dev`, then retarget to `dev`. Do not merge the
acceptance branch into an already-merged feature branch.
