# LibreChat e2e

The mock e2e profile is the safest default for generated tests. It starts LibreChat with `e2e/config/librechat.e2e.yaml`, points custom endpoints at the local mock LLM server, creates an authenticated e2e user, and avoids real provider credentials.

## Recording Tests

Use Playwright codegen when you want to turn an exploratory browser session into a draft test:

```sh
npm run e2e:record
```

That command builds the app, starts the mock LLM and LibreChat test server when needed, writes `e2e/storageState.json`, and opens Playwright codegen at `/c/new`. The npm script uses `http://localhost:3333` so it does not collide with a normal dev server on `3080`. Raw recordings are written to `e2e/recordings/` and ignored by git.

For a real local LibreChat config instead of the mock LLM profile:

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
