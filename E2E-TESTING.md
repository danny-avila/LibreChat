# E2E Testing Quick Reference

## Setup (One-Time)

```bash
# 1. Install Playwright browsers
npx playwright install chromium

# 2. Ensure LibreChat running in dev mode (already configured)
podman-compose up -d api

# 3. Ensure HIVE API running
# (check at http://localhost:8000/health)

# 4. Generate authentication
node generate-auth.js
```

## Running Tests

```bash
# All tests (headless, background)
npm run e2e

# Specific test file
npm run e2e -- e2e/specs/nav.spec.ts

# Single test by name
npm run e2e -- e2e/specs/nav.spec.ts -g "Navigation bar"

# Show browser (for watching/debugging)
npm run e2e:headed -- e2e/specs/nav.spec.ts

# Debug with inspector
npm run e2e:debug -- e2e/specs/nav.spec.ts
```

## Demo Step Tests

```bash
# Run Step 1 only
npm run e2e -- e2e/specs/demo-steps-1-6-focused.spec.ts -g "Step 1"

# Run all steps
npm run e2e -- e2e/specs/demo-steps-1-6-focused.spec.ts

# Run complete flow
npm run e2e -- e2e/specs/demo-steps-1-6-focused.spec.ts -g "Complete Flow"
```

## Troubleshooting

### Tests see login page
```bash
# Regenerate auth
node generate-auth.js
```

### Session expired
```bash
# Remove old session and regenerate
rm e2e/storageState.json
node generate-auth.js
```

### LibreChat not responding
```bash
# Check status
curl http://localhost:3080

# Check logs
podman logs LibreChat -f

# Restart
podman-compose restart api
```

## Key Files

- `e2e/storageState.json` - Auth session (regenerate if expired)
- `generate-auth.js` - Auth generator script
- `e2e/specs/demo-steps-1-6-focused.spec.ts` - Demo tests
- `e2e/playwright.config.local.ts` - Test configuration
- `docker-compose.override.yml` - Dev mode enabled here

## Why It Works Now

LibreChat runs in development mode (`NODE_ENV=development`) which sets cookies with `secure: false`, allowing them to work over HTTP (`http://localhost:3080`).

See [docs/senticor/E2E-Tests-SOLUTION.md](docs/senticor/E2E-Tests-SOLUTION.md) for detailed explanation.
