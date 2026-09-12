# LibreChat e2e

The mock e2e profile is the safest default for generated tests. It starts LibreChat with `e2e/config/librechat.e2e.yaml`, injects an in-process fake LLM (via `LIBRECHAT_TEST_RUN_HOOK`), creates an authenticated e2e user, and avoids real provider credentials.

## Stream Stores and Shards

The mock profile uses the in-memory generation stream store by default. To exercise the same browser scenarios through a real Redis job store and pub/sub transport, start Redis on port 6379 and run:

```sh
npm run e2e:mock:redis
```

Memory mode explicitly disables Redis. Redis mode defaults to database 15 with a `LibreChatE2E` key prefix, and fails closed: the test server pings Redis and verifies that the generation job manager did not silently fall back to memory. Override `REDIS_URI` or `E2E_REDIS_KEY_PREFIX` when needed.

Pull request CI runs the complete mock suite in memory mode across three shards, plus a
focused Redis transport suite. The Redis suite covers streaming fidelity, steering,
interrupts, resumptions, HITL approvals, completion, thread folding, model icons, and usage:

```sh
npx playwright test --config=e2e/playwright.config.mock.ts --shard=1/3
npm run e2e:mock:redis:transport
```

The nightly schedule and manual workflow dispatch run the complete mock suite in both stream
modes across two shards per mode. Every shard keeps one worker so tests do not contend for its
authenticated user and database.

## Property-based browser testing

Bombadil explores randomized sequences across the core chat loop, message branches,
parallel multi-conversation responses, model changes, reloads, and sidebar conversation
lifecycle operations:

```sh
npm run e2e:bombadil
```

Set `BOMBADIL_TIME_LIMIT` for longer local or scheduled runs. Failures leave a
reproducible trace under `e2e/.generated/bombadil-output`; rerun it with:

```sh
BOMBADIL_REPRODUCE=e2e/.generated/bombadil-output npm run e2e:bombadil:run
```

Reproducing a real violation is expected to fail the Playwright test. Before a
new run overwrites the active output, the harness archives it under
`e2e/.generated/bombadil-history/`. Reproduction can diverge when streaming
timing changes; Bombadil reports that explicitly.

The harness uses the credential-free mock-LLM profile, so exploration never sends
billable provider requests.

CI runs the broad property exploration for five minutes in the non-blocking
`Bombadil Property Exploration` workflow. If a property fails, download the
`bombadil-reproduction-*` artifact into
`e2e/.generated/bombadil-output/`, then reproduce it locally:

```sh
BOMBADIL_REPRODUCE=e2e/.generated/bombadil-output npm run e2e:bombadil:run
```

The accompanying `bombadil-diagnostics-*` artifact contains the captured CI log,
Playwright HTML report, and Playwright test results. A Bombadil failure produces
a workflow warning but does not block merge.

The default instruments inline JavaScript only because instrumenting LibreChat's
full Vite bundle can exceed Bombadil's driver timeout during stateful runs. Set
`BOMBADIL_INSTRUMENT_JAVASCRIPT=files,inline` for shorter coverage-guided
experiments.

The branch reload, fork submission, model/conversation, HITL pause/resume, and
mid-run steering lifecycle properties can be run independently:

```sh
npm run e2e:bombadil:branch-reload
npm run e2e:bombadil:fork-lifecycle
npm run e2e:bombadil:model-lifecycle
npm run e2e:bombadil:hitl
npm run e2e:bombadil:steering
```

These focused commands are diagnostic properties: they exit nonzero when they
reproduce a product invariant violation. Reproduce a focused trace with its
matching `:run` script and output directory, for example:

```sh
BOMBADIL_REPRODUCE=e2e/.generated/bombadil-output-hitl npm run e2e:bombadil:hitl:run
```

HITL drives a real `ask_user_question` checkpoint through the answer/resume
controller, reloads while the question is paused, answers it once, and reloads
the completed conversation. Steering submits an in-flight steer during a slow
MCP-backed run, checks that it moves exactly once from the composer anchor into
the response at the tool boundary, and reloads the applied state. The model
lifecycle property is the passing control. The branch reload and fork
properties preserve their minimal failing traces.

## Recording Tests

Use Playwright codegen when you want to turn an exploratory browser session into a draft test:

```sh
npm run e2e:record
```

That command builds the app, starts the LibreChat test server (with an in-process fake LLM) when needed, writes `e2e/storageState.json`, and opens Playwright codegen at `/c/new`. The npm script uses `http://localhost:3333` so it does not collide with a normal dev server on `3080`. Raw recordings are written to `e2e/recordings/` and ignored by git.

For a real local LibreChat config instead of the mock profile:

```sh
npm run e2e:record:local
```

Useful direct options:

```sh
node e2e/setup/record.js --url=http://localhost:3080/c/new
node e2e/setup/record.js --profile=local --no-output
node e2e/setup/record.js --auth-only
node e2e/setup/record.js --output=e2e/recordings/settings-draft.spec.ts
```

## LLM-Assisted Loop

1. Start `npm run e2e:record`.
2. Let the LLM use Computer Use to operate the headed Playwright browser.
3. Stop codegen after the workflow is captured.
4. Move the useful parts from `e2e/recordings/` into a committed spec under `e2e/specs/mock/`.
5. Replace brittle generated selectors with role, label, text, or `data-testid` locators.
6. Add assertions that prove the behavior, not just the clicked path.
7. Run the finished spec with `npm run e2e:mock -- <spec name>`.

Generated recordings are a draft, not the final test. The committed version should use the shared helpers in `e2e/specs/mock/helpers.ts` where possible, wait on network or visible UI state instead of fixed sleeps, and keep test data deterministic.
