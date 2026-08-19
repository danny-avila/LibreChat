---
name: codex-pr-review-loop
description: Use when working a LibreChat PR that has Codex bot review feedback, especially when the user asks to audit or resolve Codex review comments, monitor CI, trigger @codex review, or repeat review cycles until no actionable findings remain. Ensures inline review threads are inspected, valid findings are fixed against this repo's workspace and style rules, CI is monitored, and repeated @codex review cycles continue until clean or repetitive.
---

# Codex PR Review Loop

Use this skill when a user asks to continue, finish, audit, or monitor a LibreChat PR that has Codex bot review feedback.

## Core Rule

Inline GitHub PR review threads are the source of truth. Do not rely only on top-level PR comments, REST issue comments, or notifications.

Codex posts each finding as an inline review thread. The top-level `💡 Codex Review` comment is a summary wrapper — it names the reviewed commit but frequently carries no findings of its own. A PR can show three Codex review summaries and still have every actual finding sitting in threads you have not read.

The bot's login differs by API surface. Match both:

- GraphQL: `author.login == "chatgpt-codex-connector"`
- REST: `user.login == "chatgpt-codex-connector[bot]"`

## Tooling

Reach GitHub whichever way the session allows:

- **`gh` CLI** (local development) — use `gh api graphql` for review threads.
- **GitHub MCP tools** (Claude Code on the web, where `gh` is not installed) — `pull_request_read` with `get_review_comments` for threads, `get_reviews` for review bodies and their reviewed commit, `add_reply_to_pull_request_comment`, `add_issue_comment`, `get_check_runs`.

Exact queries and their MCP equivalents are in [GITHUB.md](GITHUB.md).

**Fork PRs.** Most LibreChat PRs arrive from contributor forks. Confirm push access to the head repository before promising fixes. Without it this skill is audit-and-reply only: post findings as thread replies and let the author push. Never force-push a contributor's branch.

## Initial Audit

1. Identify the PR number, repo, contributor fork, and branch.
2. Inspect the current worktree and branch.
3. Read `CLAUDE.md`, `AGENTS.md`, and `CONTEXT.md` before judging any finding. Many Codex comments are architecture or style calls this repo has already settled, and the domain vocabulary in `CONTEXT.md` is the right language for replies.
4. Fetch PR review threads using GraphQL `reviewThreads`.
5. For every Codex bot inline comment, read `path`, `line`, `body`, `createdAt`, `isOutdated`, and thread ID.
6. Determine whether each finding applies to the current code.
7. Treat stale or outdated comments as informational unless the issue still exists.
8. Do not begin a new `@codex review` cycle until existing latest inline comments are audited.

## Fix Workflow

For each valid finding:

1. Read the relevant source, tests, and the guidance files above.
2. **Route the fix to the correct workspace before writing it.** New backend code is TypeScript in `packages/api`; `/api` receives only the thinnest JS wrapper; database models and schemas belong in `packages/data-schemas`; shared API types, endpoints, and data-service calls belong in `packages/data-provider`. A Codex finding against `/api` JS is often a signal that the logic itself belongs in `packages/api`.
3. Implement the smallest correct fix aligned with repo patterns:
   - Reuse existing types — check `packages/data-provider` before defining a new one. No `any`; avoid `Record<string, unknown>` and `as unknown as T`.
   - User-facing strings go through `useLocalize()`, with new keys added only to `client/src/locales/en/translation.json`.
   - Appearance changes compose `@librechat/client` primitives and semantic theme roles — never raw palette utilities, hex/RGB values, or light/dark-specific literals in feature components.
   - Any change that mutates user documents must invalidate the auth user document cache for the affected users, for single-user and bulk role/user mutations alike.
   - Consolidate passes over shared collections; prefer `Map`/`Set` lookups over repeated `find`/`includes`.
4. Add or update tests when the behavior is security-sensitive, auth-related, tenant-related, or previously missed by coverage. Exercise real code paths — `mongodb-memory-server` for database behavior, real `@modelcontextprotocol/sdk` exports for MCP — rather than mocking the thing under test.
5. Run the focused checks in the table below for every touched workspace.
6. Commit and push to the PR branch.
7. Immediately request a fresh Codex review of the exact pushed head. Do not wait for CI, GitHub indexing, or branch protection checks before re-requesting review.
8. Reply directly to the Codex review thread with the commit hash, what changed, and what tests cover it.

For invalid findings:

1. Verify against current code.
2. Reply directly to the Codex review thread with a concise rationale. When the finding contradicts a settled convention, cite the rule — the relevant section of `CLAUDE.md` or `AGENTS.md`, the definition in `CONTEXT.md`, or the existing test that pins the behavior.
3. Do not change code only to satisfy an invalid comment.

### Local checks before push

| Touched | Run |
|---|---|
| `api/**` | `cd api && npx jest <pattern>` |
| `packages/api/**` | `cd packages/api && npx jest <pattern>` |
| `packages/data-provider/**` | `cd packages/data-provider && npx jest <pattern>`, then `npm run build:data-provider` if types or exports changed |
| `packages/data-schemas/**` | `cd packages/data-schemas && npx jest <pattern>`, then `npm run build:data-schemas` if types or exports changed |
| `client/**`, `packages/client/**` | `cd client && npx jest <pattern>` |

Always run, against the changed files only — this is exactly what the `Static Checks` workflow does:

```bash
npx eslint --no-error-on-unmatched-pattern --config eslint.config.mjs <changed files>
npx prettier --check --no-error-on-unmatched-pattern -- <changed files>
node scripts/sort-imports.mts --check <changed files>
```

Fix with `npx prettier --write <files>` and `npm run sort-imports -- <files>`. Import order is enforced in CI, so a fix that reads fine still fails the build if its imports are not sorted per the `CLAUDE.md` rules.

## Codex Bot Loop

After resolving current findings:

1. Read the PR's current remote `headRefOid` immediately before posting. Do not infer it from the local branch or an earlier read.
2. Create a top-level PR comment as soon as the fix commit is pushed, naming that full head SHA explicitly:
   ```txt
   @codex review

   Please review the current PR head <full-head-sha>. Confirm that this exact commit is the reviewed commit and ignore findings that apply only to earlier heads.
   ```
   This is required even when CI or branch protection checks are still running. Triggering Codex immediately overlaps review time with CI time and keeps the feedback loop short. Only delay this if the PR is in a broken state where Codex cannot inspect the pushed commit.
3. Poll the trigger comment for 1-2 minutes.
   - If it gets an `eyes` reaction, continue.
   - If it does not react, delete the trigger comment and retry.
4. After the reaction, poll manually in the current thread — explicit `sleep` calls where the harness allows them, otherwise the harness's own wait or monitor primitive. Do not create an automation or scheduled reminder for the polling loop unless the user explicitly asks for one.
5. Poll for at least 10-15 minutes for new inline review threads, PR reviews, and top-level PR comments.
6. Verify the bot review body's `Reviewed commit` matches the requested full head SHA. A review of an earlier head is not an exact-head clean result, even when its comments remain relevant.
7. A 👍 reaction on the trigger comment with no new review is Codex's clean signal — it comments when it has suggestions and reacts 👍 when it does not. Treat that as a clean result for the requested head, but still confirm no inline threads landed.
8. If Codex posts findings, audit and resolve all valid ones, push fixes, and immediately request another exact-head review; do not wait for CI before re-requesting review.
9. Stop the Codex review loop when Codex reports no major issues on the requested exact head, or when it gives only repeated/already-addressed findings and no new inline review threads appear during the review polling window.
10. Track CI and GitHub indexing separately from the Codex loop. Report pending or failed checks, but do not keep the Codex review loop open solely because CI is still running.

Respect any review-cycle cap the user sets. If a later non-substantive push makes the reviewed SHA stale after the cap is reached, report that fact rather than silently starting another cycle.

If the user authorizes one additional review after the cap, do not spend it immediately. First complete the high-level self-review below, fix and push every validated cross-seam defect it finds, and only then request Codex against the resulting exact remote head. The extra request is one cycle; findings from it do not silently authorize another request.

## Invariant Closeout

Do not treat repeated Codex rounds as an instruction to patch comments independently forever. After two actionable rounds, or sooner when one local fix exposes another boundary defect, pause before the next request and review the whole changed subsystem by invariant.

Group findings by the underlying lifecycle boundary and trace each boundary end to end:

- stable identity across retry, replay, continuation, and duplicate delivery;
- ownership and authorization at every request, replica, user, role, and parent/child boundary — every query scoped to the authenticated principal, and permission semantics unchanged when reads are parallelized;
- cache coherence against durable state: the auth user document cache, conversation and message caches, and config caches must be invalidated by every mutation that can change what they hold;
- process-local versus durable state, including restart and rolling-deploy behavior;
- ambiguous versus definite external outcomes and the corresponding compensation rules;
- admission, claim, settlement, acknowledgement, cleanup, expiry, and cancellation transitions — including stream abort, resume, and client disconnect;
- per-user and per-request lifecycle of external connections such as MCP servers;
- bounded memory, payload, query, and fan-out behavior under long waits, large message arrays, or many replicas.

Where `CONTEXT.md` already names the boundary — the agent run envelope, a subagent thread, a theme definition — trace it under that name and hold the diff to the definition recorded there.

Read the complete diff and adjacent callers/tests for those invariants, add failure-injection or transition tests at the deepest ownership seam, then push one coherent fix round. This architecture pass supplements independent finding validation; it does not authorize unrelated refactoring or scope expansion.

Before declaring the high-level self-review complete:

1. Read the full base-to-head diff, not only files named by prior findings.
2. Trace each durable or externally visible operation from admission through retry, replay, settlement, cleanup, and rollout.
3. Separate transport-level facts from logical-operation facts; for example, a definite HTTP response does not necessarily prove an idempotent logical operation was never admitted.
4. Check every limit at the final consumer, not only at each producer or replica.
5. Check compatibility in both mixed-version directions: old consumer/new producer and new consumer/old producer. Require a staged capability gate when a rolling deployment cannot be wire-compatible.
6. Summarize the recurring finding patterns and the invariant that closes each class. Do not request another review while the summary still identifies an untested transition.

The self-review is a gate, not a request for broad refactoring. Fix merge-blocking invariant violations in the PR; record architectural deepening opportunities as follow-ups unless the current interface cannot be made correct locally.

## CI Monitoring

Monitor PR checks after every push.

CI monitoring must not block a fresh `@codex review` request. Always request review immediately after pushing a fix, then watch CI in parallel or as a separate follow-up.

Map a failing check to the local command that reproduces it:

| Check | Reproduce locally |
|---|---|
| `Backend Unit Tests` | `npm run test:api`, `npm run test:packages:api`, `npm run test:packages:data-provider`, `npm run test:packages:data-schemas` |
| `Frontend Unit Tests` | `npm run test:client` |
| `Static Checks` | the eslint / prettier / sort-imports trio above, plus `npm run test:config` |
| `Cache Integration Tests` | `cd packages/api && npm run test:cache-integration` |
| `Agents Integration Tests` | `cd packages/api && npm run test:agents-integration` |
| `Playwright E2E Tests` | the `e2e/` suite |

`Static Checks` also runs unused-i18n-key detection and `depcheck` gates that no local lint run covers. A translation key added without a use, or a dependency added to a `package.json` without an import, fails there and nowhere else.

If CI fails:

1. Open the failing job/log.
2. Fix valid failures.
3. Run the matching local check when feasible.
4. Commit and push.
5. Immediately request another exact-head Codex review using the full remote `headRefOid`, then continue CI monitoring, unless the user has capped review cycles.

## Completion Report

Final response should include:

- Latest pushed commit
- Workspaces touched and where the fix landed
- Local tests/lint run
- CI status
- Codex review result, and how many review cycles were spent
- Any invalid findings and why they were rejected
