# Woodland Failure Verification Summary

**Timestamp:** 2026-02-28 15:14:39
**Verification ID:** `20260228-151439`

## Commands Run
- `npm run test:woodland:stub -- --detectOpenHandles`
- `npm run test:woodland:real -- --detectOpenHandles`

## Results
### Stub mode
- Test Suites: **5 passed, 5 total**
- Tests: **36 passed, 36 total**
- Snapshots: **0 total**
- Time: **0.945 s**

### Real mode (strict)
- Test Suites: **2 passed, 2 total**
- Tests: **16 passed, 16 total**
- Snapshots: **0 total**
- Time: **11.342 s**

## Open Handle Check
- Result: **NONE detected** (`--detectOpenHandles` clean)

## Evidence Files
- `test-results/verification-stub-20260228-151439.log`
- `test-results/verification-real-20260228-151439.log`
- `test-results/.latest-verification-ts`

## Conclusion
All currently reproducible Woodland failures are resolved in both stub and strict real test workflows.
