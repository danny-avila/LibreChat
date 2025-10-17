# E2E Testing Setup

## Quick Start

### 1. Set up E2E test credentials

```bash
# Copy the example file
cp .env.e2e.example .env.e2e

# Edit .env.e2e and set your test credentials
# Use any text editor: nano, vim, vscode, etc.
nano .env.e2e
```

Set these values:
```bash
E2E_USER_EMAIL=sales-demo@senticor.de
E2E_USER_PASSWORD=<your-test-password>
E2E_BASE_URL=http://localhost:3080
```

**Important:**
- `.env.e2e` is in `.gitignore` and will NOT be committed to git
- Use a test-only password, not a production password
- This file is shared by all E2E tests and the auth generator

### 2. Generate authentication state

```bash
# Generate auth storage for Playwright tests
node generate-auth.js
```

This will:
- Read credentials from `.env.e2e`
- Login to LibreChat
- Save authentication state to `e2e/storageState.json`

### 3. Run E2E tests

```bash
# Run all E2E tests
npm run e2e

# Run specific test
npm run e2e -- e2e/specs/demo-steps-1-6-focused.spec.ts

# Run with UI (headed mode)
npm run e2e:headed
```

## File Structure

```
├── .env.e2e.example          # Template (committed to git)
├── .env.e2e                  # Your credentials (gitignored)
├── generate-auth.js          # Auth generator (reads .env.e2e)
├── e2e/
│   ├── test-user.js          # Shared test user config
│   ├── storageState.json     # Generated auth state (gitignored)
│   └── specs/
│       ├── demo-steps-1-6-focused.spec.ts
│       ├── demo-integrationsbericht-complete.spec.ts
│       └── ...
```

## Security

### What's committed to git:
- `.env.e2e.example` - Template with placeholders
- All test spec files - Using `require('../test-user')`
- `generate-auth.js` - Reads from `.env.e2e`
- `e2e/test-user.js` - Reads from `.env.e2e`

### What's NOT committed (gitignored):
- `.env.e2e` - Your actual test credentials
- `e2e/storageState.json` - Generated auth state

## Troubleshooting

### Error: "E2E_USER_PASSWORD not set"
- Make sure you copied `.env.e2e.example` to `.env.e2e`
- Make sure you set `E2E_USER_PASSWORD` in `.env.e2e`

### Login fails
- Check that the demo user exists in LibreChat
- Verify the password in `.env.e2e` is correct
- Check LibreChat is running at the URL in `E2E_BASE_URL`

### Tests can't find DEMO_USER
- Make sure `.env.e2e` exists in the root directory
- Check that `e2e/test-user.js` exists

## Creating Test User

If the test user doesn't exist yet:

```bash
# Create the demo user manually
npm run create-user

# Or let the test auto-register on first run
# (some tests have auto-registration logic)
```

## More Information

See detailed E2E testing documentation:
- [E2E-TESTING.md](docs/senticor/E2E-TESTING.md)
- [README-INTEGRATIONSBERICHT-TESTS.md](e2e/specs/README-INTEGRATIONSBERICHT-TESTS.md)
