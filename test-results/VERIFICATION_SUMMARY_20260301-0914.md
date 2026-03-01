# Woodland Regression Verification Summary

**Timestamp:** 2026-03-01 09:14 (local)
**Verification ID:** `20260301-0914`

## Commands Executed
1. `npm run test:woodland:stub`
2. `npm run test:woodland:real`

## Captured Command Outputs (Result Lines)

### 1) `npm run test:woodland:stub`
```text
> LibreChat@v0.8.2-rc3 test:woodland:stub
> cross-env NODE_ENV=test jest --config ./jest.woodland.config.js tests/agents/woodland api/app/clients/agents/Woodland --runInBand

PASS  tests/agents/woodland/product_engine_prompts.spec.js
PASS  api/app/clients/agents/Woodland/airtable_qa_scenarios.spec.js
PASS  tests/agents/woodland/qa_scenarios.spec.js
PASS  tests/agents/woodland/additional-failures.spec.js
PASS  tests/agents/woodland/accuracy.spec.js

Test Suites: 5 passed, 5 total
Tests:       36 passed, 36 total
Snapshots:   0 total
Time:        0.664 s, estimated 1 s
```

### 2) `npm run test:woodland:real`
```text
> LibreChat@v0.8.2-rc3 test:woodland:real
> cross-env NODE_ENV=test USE_REAL_FUNCTIONS_AGENT=1 WOODLAND_STRICT_REAL_EVAL=1 jest --config ./jest.woodland.config.js tests/agents/woodland/product_engine_prompts.spec.js tests/agents/woodland/accuracy.spec.js --runInBand

Test Suites: 2 passed, 2 total
Tests:       16 passed, 16 total
Snapshots:   0 total
Time:        19.007 s
```

## Final Pass Matrix

| Suite | Mode | Status | Suites | Tests |
|---|---|---|---:|---:|
| Woodland full regression (`tests/agents/woodland` + `api/app/clients/agents/Woodland`) | Stub | ✅ PASS | 5/5 | 36/36 |
| Woodland strict real regression (`product_engine_prompts` + `accuracy`) | Real | ✅ PASS | 2/2 | 16/16 |

## Aggregate Totals
- **Total suites passed:** 7/7
- **Total tests passed:** 52/52
- **Failures:** 0

## Notes
- The warning `--localstorage-file was provided without a valid path` appeared during runs but did not affect pass/fail outcomes.
- Runs used the Woodland-specific Jest config: `jest.woodland.config.js`.
