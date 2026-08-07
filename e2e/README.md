# LibreChat e2e

The mock e2e profile is the safest default for generated tests. It starts LibreChat with `e2e/config/librechat.e2e.yaml`, injects an in-process fake LLM (via `LIBRECHAT_TEST_RUN_HOOK`), creates an authenticated e2e user, and avoids real provider credentials.

## Stream Stores and Shards

The mock profile uses the in-memory generation stream store by default. To exercise the same browser scenarios through a real Redis job store and pub/sub transport, start Redis on port 6379 and run:

```sh
npm run e2e:mock:redis
```

Memory mode explicitly disables Redis. Redis mode defaults to database 15 with a `LibreChatE2E` key prefix, and fails closed: the test server pings Redis and verifies that the generation job manager did not silently fall back to memory. Override `REDIS_URI` or `E2E_REDIS_KEY_PREFIX` when needed.

CI runs the complete mock suite in both stream modes. Each mode is split across four Playwright shards, while each shard keeps one worker so tests do not contend for the shard's authenticated user and database:

```sh
npx playwright test --config=e2e/playwright.config.mock.ts --shard=1/4
```

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
