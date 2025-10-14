# E2E Tests - Solution Summary

**Date**: 2025-10-14
**Status**: ✅ RESOLVED

---

## Problem

E2E tests were failing because LibreChat was running in production mode (`NODE_ENV=production`), which sets `secure: true` on cookies. Playwright tests access `http://localhost:3080` (HTTP), and browsers won't send secure cookies over HTTP connections.

**Result**: All tests showed the login page instead of authenticated state.

---

## Root Cause Analysis

### Discovery Process

1. Checked existing E2E tests - they all expect authenticated state via `storageState.json`
2. Found tests were seeing login page despite valid storage state
3. Discovered cookies had `secure: true` flag
4. Searched web - found Playwright GitHub issue confirming secure cookies won't work over HTTP
5. Traced cookie setting in `api/server/services/AuthService.js`:
   ```javascript
   // Line 32
   const isProduction = process.env.NODE_ENV === 'production';

   // Lines 389, 395
   res.cookie('refreshToken', refreshToken, {
     httpOnly: true,
     secure: isProduction,  // ← This was the issue
     sameSite: 'strict',
   });
   ```
6. Checked docker-compose command: `npm run backend`
7. Found in `package.json`:
   ```json
   "backend": "cross-env NODE_ENV=production node api/server/index.js"
   ```

### Why Official E2E Tests Work

LibreChat's official E2E tests (currently disabled) use `playwright.config.ts` which:
- Sets `NODE_ENV=CI` in webServer config
- Starts its own LibreChat instance
- That instance sets `secure: false` (because NODE_ENV !== 'production')

---

## Solution

### ✅ Implemented Fix

Modified `docker-compose.override.yml` to run LibreChat in development mode:

```yaml
services:
  api:
    # Use development mode for better debugging and E2E test compatibility
    # (sets NODE_ENV=development, which disables secure cookies for HTTP)
    command: npm run backend:dev

    volumes:
      # ... rest of config
```

### Benefits of Development Mode

1. ✅ **E2E tests work** - Cookies have `secure: false`
2. ✅ **Better debugging** - More verbose logging
3. ✅ **Hot reload** (with nodemon) - Faster development iteration
4. ✅ **Better error messages** - Stack traces and detailed errors

### Result

**Before** (production mode):
```json
{
  "name": "refreshToken",
  "secure": true,     // ❌ Won't work with http://
  "sameSite": "Strict"
}
```

**After** (development mode):
```json
{
  "name": "refreshToken",
  "secure": false,    // ✅ Works with http://
  "sameSite": "Strict"
}
```

---

## Verification

### Test Results

```bash
# Navigation test
npm run e2e -- e2e/specs/nav.spec.ts -g "Navigation bar"
✅ 1 passed (2.4s)

# Settings modal test
npm run e2e -- e2e/specs/nav.spec.ts -g "Settings modal"
✅ 1 passed (3.6s)
```

### Auth Storage Regeneration

Run this anytime you need fresh auth:
```bash
node generate-auth.js
```

Cookies will automatically have `secure: false` in dev mode.

---

## Files Modified

### 1. `docker-compose.override.yml`
Added `command: npm run backend:dev` to api service.

**Why**: Uses `NODE_ENV=development` instead of `NODE_ENV=production`.

### 2. Created Helper Scripts

**`generate-auth.js`** - Automated authentication storage generation:
```bash
node generate-auth.js
# Generates e2e/storageState.json with valid session
```

**`setup-e2e-tests.sh`** - Complete E2E setup script:
```bash
./setup-e2e-tests.sh
# Checks LibreChat, HIVE, creates user, generates auth
```

### 3. Created Test Files

**`e2e/specs/demo-steps-1-6-focused.spec.ts`** - New focused tests for Steps 1-6

### 4. Updated Test Config

**`e2e/playwright.config.local.ts`**:
- Disabled webServer (use running container)
- Disabled globalSetup/globalTeardown (auth already generated)

**`e2e/config.local.ts`**:
- Updated test user to `sales-demo@senticor.de`

---

## Running E2E Tests

### Prerequisites

1. LibreChat running in dev mode (✅ configured)
2. HIVE API running at localhost:8000
3. Test user exists: `sales-demo@senticor.de`
4. Storage state generated: `e2e/storageState.json`

### Commands

```bash
# Run all tests
npm run e2e

# Run specific test file
npm run e2e -- e2e/specs/nav.spec.ts

# Run single test by name
npm run e2e -- e2e/specs/nav.spec.ts -g "Navigation bar"

# Run with visible browser (for debugging)
npm run e2e:headed -- e2e/specs/nav.spec.ts

# Debug mode with inspector
npm run e2e:debug -- e2e/specs/nav.spec.ts
```

### Test Structure

Tests run **headless by default** (in background) - you can use your machine while they run!

To show browser:
```bash
# Use headed mode
npm run e2e:headed -- e2e/specs/nav.spec.ts

# Or set environment variable
HEADED=true npm run e2e -- e2e/specs/demo-steps-1-6-focused.spec.ts
```

---

## Known Limitations

### 1. Demo Tests Timeout

The demo tests that interact with AI agents may timeout because:
- MCP tool calls take time (5-30 seconds per call)
- AI responses can be slow
- Multiple sequential messages compound the delay

**Solution**: Increase test timeouts in test files:
```typescript
test('Step 1: ...', async ({ page }) => {
  test.setTimeout(180000);  // 3 minutes for AI + MCP
  // ...
});
```

### 2. Existing integrationsbericht Tests

The existing test files (`integrationsbericht-demo.spec.ts`, etc.) may need updates:
- Some use `headless: false` (should be configurable)
- Some have hardcoded timeouts that are too short
- They were written before this auth fix

**Recommendation**: Use `demo-steps-1-6-focused.spec.ts` as template for new tests.

---

## Alternative Approaches Considered

### Option A: Manual Cookie Editing (What we tried first)
```bash
cat e2e/storageState.json | jq '.cookies |= map(.secure = false)' > tmp
mv tmp e2e/storageState.json
```

**Pros**: Quick fix
**Cons**: Manual, needs to be done after every auth regeneration

### Option B: Use HTTPS Locally
**Pros**: Matches production
**Cons**: Complex setup (certs, DNS, config), overkill for E2E

### Option C: Modify AuthService.js
Change `secure: isProduction` to `secure: process.env.NODE_ENV === 'production'`

**Pros**: More explicit
**Cons**: Code change in core file, unnecessary (already uses this logic)

### ✅ Option D: Development Mode (Chosen)
**Pros**:
- Simple config change
- Provides other dev benefits
- No code modifications
- Matches how official E2E tests work

**Cons**: Container runs differently than production (acceptable for local dev)

---

## Production Deployment Notes

For production deployments, ensure:

1. **Use production mode**:
   ```yaml
   services:
     api:
       command: npm run backend  # NOT backend:dev
       environment:
         - NODE_ENV=production
   ```

2. **Use HTTPS**:
   - Configure reverse proxy (nginx, Caddy)
   - Secure cookies will work correctly over HTTPS

3. **E2E tests in CI**:
   - Use `npm run e2e:ci` which uses `playwright.config.ts`
   - That config sets `NODE_ENV=CI` for its test server
   - Or run E2E against staging environment with HTTPS

---

## Troubleshooting

### Issue: Tests still see login page

**Check**:
```bash
# 1. Verify storage state exists and has cookies
ls -lh e2e/storageState.json
cat e2e/storageState.json | jq '.cookies[] | {name, secure}'

# 2. Verify cookies are secure: false
# Should show: "secure": false

# 3. Regenerate if needed
rm e2e/storageState.json
node generate-auth.js

# 4. Verify LibreChat is in dev mode
podman logs LibreChat 2>&1 | grep "NODE_ENV"
# or check if backend:dev is running
podman inspect LibreChat | jq '.[0].Config.Cmd'
```

### Issue: LibreChat not starting

**Check**:
```bash
# View logs
podman logs LibreChat -f

# Restart container
podman-compose restart api

# Check if port is in use
lsof -i :3080
```

### Issue: HIVE API not accessible

**Check**:
```bash
# Verify HIVE is running
curl http://localhost:8000/health

# Check MCP mounts
podman exec LibreChat ls -la /app/mcp-servers/honeycomb
```

---

## Success Metrics

✅ **Before**: 0% of E2E tests passing (all failed at auth)
✅ **After**: E2E infrastructure working, tests can authenticate

### Test Results
- ✅ Navigation tests: Passing (2-4s)
- ✅ Settings modal: Passing (3-4s)
- 🟡 Demo Step tests: Need timeout adjustments for AI/MCP operations

### Time Savings
- **Old auth method**: Manual login before each test run
- **New auth method**: Automatic, persisted, regenerate once when needed

---

## Next Steps

### Immediate
1. ✅ Development mode configured
2. ✅ Auth storage working
3. ✅ Basic tests passing
4. 🔄 Add timeout adjustments to demo tests

### Short-term
1. Run existing integrationsbericht tests
2. Fix timeout issues
3. Update tests to use headless mode by default
4. Complete Steps 7-8 tests

### Long-term
1. CI/CD integration
2. Automated test runs on PR
3. Test coverage metrics
4. Performance benchmarks

---

## References

- **LibreChat Cookie Code**: `api/server/services/AuthService.js:32,389,395`
- **Playwright Secure Cookies Issue**: https://github.com/microsoft/playwright/issues/5215
- **Storage State Docs**: https://playwright.dev/docs/auth
- **Package Scripts**: `package.json` (lines for backend, backend:dev)

---

**Status**: ✅ **RESOLVED AND DOCUMENTED**

**Impact**: E2E tests now functional for local development

**Maintenance**: Regenerate auth if session expires (rarely needed)
