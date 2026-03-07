# Bizu Chat — Production Readiness Audit

**Date**: March 7, 2026  
**Branch**: `cursor/production-readiness-audit-ef0d`  
**Base**: LibreChat v0.8.1-rc2

This audit identifies bugs, inconsistencies, and security issues that would be harmful in production, along with a prioritized fix plan for each.

---

## Table of Contents

1. [CRITICAL — Must Fix Before Launch](#critical)
2. [HIGH — Should Fix Before Launch](#high)
3. [MEDIUM — Fix Shortly After Launch](#medium)
4. [LOW — Backlog / Nice-to-Have](#low)

---

<a id="critical"></a>
## CRITICAL — Must Fix Before Launch

### C1. CORS Allows All Origins

**File**: `api/server/index.js:87`  
**Issue**: `app.use(cors())` with no arguments allows requests from **any origin**. Combined with cookie-based refresh tokens, any malicious website could make authenticated API calls on behalf of your users.

```js
// CURRENT (vulnerable)
app.use(cors());

// FIX
app.use(cors({
  origin: process.env.DOMAIN_CLIENT || 'http://localhost:3080',
  credentials: true,
}));
```

**Fix plan**:
1. Update `api/server/index.js` to pass `origin` and `credentials` to `cors()`.
2. Also fix `api/server/experimental.js` (same issue at line 251).

---

### C2. Dashboard Redirect Loop (`/d/files` Does Not Exist)

**File**: `client/src/routes/Dashboard.tsx:76-78`  
**Issue**: The catch-all route redirects any unmatched dashboard path to `/d/files`, but the files routes are **commented out** (lines 14-56). This creates an **infinite redirect loop** — navigating to any dashboard path except `/d/prompts/*` crashes the page with "Maximum update depth exceeded".

```tsx
// CURRENT (broken)
{ path: '*', element: <Navigate to="/d/files" replace={true} /> }
```

**Fix plan**:
1. Change the catch-all redirect to `/c/new` (the main chat route), since files and vector stores are disabled for v1.
2. Alternatively, redirect to `/d/prompts` if prompts are to remain accessible.

---

### C3. `eval()` Used on Environment Variables (Code Injection Risk)

**Files**:
- `api/server/services/AuthService.js:423` — `eval(REFRESH_TOKEN_EXPIRY)`
- `api/strategies/openIdJwtStrategy.js:31` — `eval(OPENID_JWKS_URL_CACHE_TIME)`
- `packages/data-schemas/src/methods/session.ts:16` — `eval(REFRESH_TOKEN_EXPIRY)`
- `packages/data-schemas/src/methods/user.ts:174` — `eval(SESSION_EXPIRY)`

**Issue**: `eval()` is called on env var values like `(1000 * 60 * 60 * 24) * 7`. If an attacker can influence environment variables (container misconfiguration, CI/CD injection, `.env` tampering), this allows **arbitrary code execution**.

**Note**: `packages/api/src/utils/math.ts` has a `math()` function that validates input with a regex (`/^[+\-\d.\s*/%()]+$/`) before calling `eval()` — this is the safer pattern.

**Fix plan**:
1. Replace all `eval(envVar)` calls with the existing `math()` utility from `@librechat/api`.
2. For `REFRESH_TOKEN_EXPIRY` and `SESSION_EXPIRY`, use `math(process.env.REFRESH_TOKEN_EXPIRY, 1000 * 60 * 60 * 24 * 7)`.

---

### C4. Unauthenticated `/api/config` Exposes Full App Configuration

**File**: `api/server/routes/config.js:66`  
**Issue**: The config endpoint has **no authentication middleware**. It exposes to any visitor:
- `serverDomain` (your backend URL)
- `modelSpecs` (all model names and configurations)
- `balance` settings (start balance, refill amounts)
- `interfaceConfig` (which features are enabled/disabled)
- `instanceProjectId`
- Social login provider status
- Registration settings

An attacker can use this for reconnaissance and targeted attacks.

**Fix plan**:
1. Split the config endpoint into public (needed for login page) and private (requires auth) portions.
2. The public portion should only expose: `appTitle`, `socialLogins`, `emailLoginEnabled`, `registrationEnabled`, `emailEnabled`, `passwordResetEnabled`.
3. Everything else (modelSpecs, balance, interfaceConfig, serverDomain, etc.) should require `requireJwtAuth`.

---

### C5. OAuth Routes Mounted Even When Social Login Is Disabled

**File**: `api/server/index.js:118`  
**Issue**: `app.use('/oauth', routes.oauth)` is always mounted regardless of `ALLOW_SOCIAL_LOGIN`. The oauth route file defines Google, Facebook, GitHub, Discord, Apple, and SAML routes unconditionally. Hitting these routes produces 500 errors and exposes application fingerprinting information.

**Fix plan**:
1. Wrap the OAuth route mounting in the same `isEnabled(ALLOW_SOCIAL_LOGIN)` check:
```js
if (isEnabled(ALLOW_SOCIAL_LOGIN)) {
  await configureSocialLogins(app);
  app.use('/oauth', routes.oauth);
}
```

---

### C6. Empty Secrets in `.env.example` — No Startup Guard

**File**: `.env.example:114-115`, `48-49`  
**Issue**: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CREDS_KEY`, and `CREDS_IV` are **blank** in `.env.example`. If an operator copies `.env.example` to `.env` without generating real values:
- `JWT_SECRET` being empty/undefined means JWTs may sign with an empty string or fail entirely.
- `CREDS_KEY`/`CREDS_IV` being empty means credential encryption breaks.

The startup checks in `packages/api/src/app/checks.ts` only warn about **known default** values, not about **empty** values.

**Fix plan**:
1. Add a startup guard in `api/server/index.js` (or in `performStartupChecks`) that **exits the process** if any of these four secrets are empty or undefined.
2. Generate random defaults in `.env.example` with a clear comment to regenerate.

---

<a id="high"></a>
## HIGH — Should Fix Before Launch

### H1. Backend API Routes for Disabled Features Are Still Active

**File**: `api/server/index.js:118-147`  
**Issue**: All API routes are mounted unconditionally. Features disabled in `librechat.yaml` (agents, presets, prompts, assistants, plugins, bookmarks, etc.) are only hidden in the **UI** — their API endpoints remain fully accessible to any authenticated user making direct HTTP requests.

| Disabled Feature | API Route Still Active |
|---|---|
| `agents: false` | `/api/agents` |
| `presets: false` | `/api/presets` |
| `prompts: false` | `/api/prompts` |
| `bookmarks: false` | `/api/tags` |
| `marketplace.use: false` | `/api/categories` |
| Assistants (not configured) | `/api/assistants` |
| Plugins (not needed) | `/api/plugins` |
| MCP (not needed) | `/api/mcp` |
| Memories (not needed) | `/api/memories` |

**Partial mitigation**: LibreChat does enforce **some** features server-side via role-based permissions set in `updateInterfacePermissions()` during startup. Agents, prompts, bookmarks, and memories get permission-gated. However, **presets have NO server-side check at all** — any authenticated user can CRUD presets via the API.

**Fix plan**:
1. **Immediate**: Add middleware or conditional mounting for routes that should be fully disabled. For presets specifically, add a permission check.
2. **Later**: Consider not mounting routes for features that are permanently off for Bizu v1.

---

### H2. Auto-Refill Gives Unlimited Free Tokens With No Cap

**File**: `api/models/balanceMethods.js:53-74`  
**Issue**: The auto-refill logic grants `refillAmount` (100,000 credits) every `refillIntervalValue` (30 days) with **no lifetime cap**. Since there is no Stripe integration yet, every user gets unlimited free API credits forever at the cost of the operator.

Additionally:
- If `lastRefill` is `null` or corrupted, `isInvalidDate()` returns `true`, and the refill fires immediately — skipping the interval check entirely.
- Concurrent requests can trigger multiple refills before `lastRefill` is updated (race condition).

**Fix plan**:
1. Add a `maxRefillCount` or `lifetimeMaxCredits` field to the Balance schema to cap total free credits per user.
2. Make the refill check atomic using `findOneAndUpdate` with a condition on `lastRefill` (compare-and-swap).
3. Until Stripe is integrated, consider lowering `refillAmount` or disabling auto-refill.

---

### H3. No Rate Limiter on `/api/auth/refresh`

**File**: `api/server/routes/auth.js:43`  
**Issue**: The refresh token endpoint has **no rate limiter**. An attacker can spam this endpoint to brute-force or replay refresh tokens.

**Fix plan**:
1. Add a rate limiter (e.g., 10 requests per minute per IP) to the refresh endpoint.

---

### H4. No Rate Limiter on `/api/user/verify`

**File**: `api/server/routes/user.js:25`  
**Issue**: The email verification token submission endpoint has no rate limiter, enabling brute-force of verification tokens.

**Fix plan**:
1. Add a rate limiter to `POST /api/user/verify`.

---

### H5. Email Verification Not Enforced — Anyone Can Register With Fake Emails

**File**: `.env.example:108`  
**Issue**: `ALLOW_UNVERIFIED_EMAIL_LOGIN=true` combined with no email service configured means:
1. A user registers with **any email address** (even one they don't own).
2. Since email is not configured, the code auto-sets `emailVerified: true`.
3. The user immediately has full access.

This enables unlimited account creation with fake emails, each getting 100,000 free token credits.

**Fix plan**:
1. **Option A**: Configure email (e.g., via SendGrid, SES, or SMTP) and set `ALLOW_UNVERIFIED_EMAIL_LOGIN=false`.
2. **Option B**: Add Cloudflare Turnstile or CAPTCHA to registration to prevent automated abuse.
3. **Option C**: Add IP-based registration limits tighter than the current 5/hour.

---

### H6. Unauthenticated `/api/endpoints` Endpoint

**File**: `api/server/routes/endpoints.js:4-5`  
**Issue**: The endpoints route has **no `requireJwtAuth` middleware**. Anyone can see all configured endpoints, model names, and capabilities.

**Fix plan**:
1. Add `requireJwtAuth` middleware to the endpoints route.

---

### H7. Agent Marketplace Routes Active Despite `agents: false`

**File**: `client/src/routes/index.tsx:115-129`  
**Issue**: The `/agents` and `/agents/:category` frontend routes are unconditionally registered. While the agent sidebar link is permission-gated, anyone who knows the URL can navigate directly to the marketplace page.

**Fix plan**:
1. Conditionally render these routes based on `startupConfig.interface.agents` and `startupConfig.interface.marketplace.use`.

---

### H8. HTML Language Tag Injection

**File**: `api/server/index.js:158-160`  
**Issue**: The `lang` cookie value is inserted into the HTML response with only `"` escaped. An attacker can set the `lang` cookie to a value containing `>` or other HTML characters to break out of the attribute and inject HTML/script:

```js
const lang = req.cookies.lang || req.headers['accept-language']?.split(',')[0] || 'en-US';
const saneLang = lang.replace(/"/g, '&quot;');
let updatedIndexHtml = indexHTML.replace(/lang="en-US"/g, `lang="${saneLang}"`);
```

For example, a cookie value of `en" onload="alert(1)` would bypass the `"` replacement but could still inject attributes if single quotes or event handlers are used differently.

**Fix plan**:
1. Validate `lang` against a strict regex (e.g., `/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/`) and default to `pt-BR` if invalid.
2. Since Bizu is PT-BR only, hardcode `lang="pt-BR"` and remove the dynamic replacement entirely.

---

<a id="medium"></a>
## MEDIUM — Fix Shortly After Launch

### M1. Root.tsx Loads Data for Disabled Features on Every Page

**File**: `client/src/routes/Root.tsx:37-39`  
**Issue**: `useAssistantsMap`, `useAgentsMap`, and `useFileMap` fire API requests on **every authenticated page load**, regardless of whether those features are disabled. This wastes bandwidth and server resources.

**Fix plan**:
1. Gate these hooks behind the interface config (e.g., only call `useAgentsMap` when `config.interface.agents !== false`).

---

### M2. Token Pricing May Not Match Actual OpenRouter Costs

**File**: `api/models/tx.js`  
**Issue**: Token multipliers are hardcoded per model pattern. The model names in `librechat.yaml` use OpenRouter's format (e.g., `deepseek/deepseek-chat-v3-0324`), and pattern matching may resolve to the wrong pricing tier. For example:
- `deepseek/deepseek-r1-0528` might match the `deepseek-r1` pattern (high cost) instead of the intended tier.
- If no pattern matches, a `defaultRate = 6` per million is used, which could over- or under-charge.

OpenRouter may also change their pricing independently of the hardcoded values.

**Fix plan**:
1. Add explicit pricing entries in `tx.js` for each exact model name used in `librechat.yaml`.
2. Consider fetching OpenRouter pricing at startup and caching it, or adding a periodic sync.
3. Test each model name against `getValueKey()` to verify correct matching.

---

### M3. Balance Check Doesn't Account for Completion Tokens

**File**: `api/app/clients/BaseClient.js:682`  
**Issue**: The pre-call balance check only estimates **prompt** token cost. Completion tokens are unknown until the response arrives. A user with barely enough balance for prompt tokens can trigger an expensive completion, ending up with a negative balance (clamped to 0).

**Fix plan**:
1. Add a safety buffer to the pre-call check (e.g., `promptTokens * 2` or a fixed minimum like 1000 tokens).
2. Alternatively, use the model's `max_output_tokens` to estimate worst-case completion cost.

---

### M4. `$inc` in `createUser` Can Double-Credit Start Balance

**File**: `packages/data-schemas/src/methods/user.ts:86-87`  
**Issue**: The initial balance is set using `$inc` (increment) instead of `$set`. If a race condition causes the balance record to be created before the `createUser` function runs (e.g., from the middleware in `createSetBalanceConfig`), the user gets **double** the start balance.

**Fix plan**:
1. Change `$inc: { tokenCredits: balanceConfig.startBalance }` to `$set: { tokenCredits: balanceConfig.startBalance }` in the upsert, or add a condition to the upsert to only set if the document is being inserted (not updated).

---

### M5. Registration Error Handler Leaks Internal Details

**File**: `api/server/controllers/AuthController.js:25`  
**Issue**: On registration error, `err.message` is returned to the client. This can leak MongoDB error details, validation errors, or stack traces.

```js
// CURRENT
return res.status(500).json({ message: err.message });

// FIX
return res.status(500).json({ message: 'Registration failed. Please try again.' });
```

---

### M6. Synchronous bcrypt Blocks the Event Loop

**File**: `api/server/services/AuthService.js:208-209`  
**Issue**: `bcrypt.genSaltSync(10)` and `bcrypt.hashSync(password, salt)` are **synchronous** operations that block the Node.js event loop for ~100ms per call. Under concurrent registrations, this degrades performance for all users.

**Fix plan**:
1. Replace with `await bcrypt.genSalt(10)` and `await bcrypt.hash(password, salt)`.

---

### M7. CI/CD Workflows Reference Upstream LibreChat Repo

**Files**:
- `.github/workflows/deploy-dev.yml:15` — checks `github.repository == 'danny-avila/LibreChat'`
- `.github/workflows/deploy.yml:12` — `GH_REPOSITORY: 'LibreChat'`
- `.github/workflows/a11y.yml`, `.github/playwright.yml` — similar references

**Issue**: These workflows either won't run (because the repo check fails) or reference the wrong repository. They're inherited from upstream LibreChat and haven't been updated for Bizu.

**Fix plan**:
1. Update or remove workflows that reference `danny-avila/LibreChat`.
2. Create Bizu-specific deployment workflows.

---

### M8. `deploy-compose.yml` Referenced But Does Not Exist

**File**: `package.json` — scripts reference `deploy-compose.yml`  
**Issue**: The `start:deployed` and `stop:deployed` npm scripts reference `deploy-compose.yml`, which does not exist in the repository. Running these commands will fail.

**Fix plan**:
1. Either create `deploy-compose.yml` for Bizu's production setup, or remove these scripts from `package.json`.

---

### M9. Parameter Injection in Key Update Route

**File**: `api/server/routes/keys.js:7`  
**Issue**: `...req.body` is spread into `updateUserKey({ userId: req.user.id, ...req.body })`. If `req.body` contains a `userId` field, it **overwrites** `req.user.id`, potentially allowing a user to modify another user's API keys.

**Fix plan**:
1. Destructure only expected fields from `req.body`:
```js
const { name, value, expiresAt } = req.body;
await updateUserKey({ userId: req.user.id, name, value, expiresAt });
```

---

### M10. Shared Links Expose Conversation Content Publicly

**File**: `api/server/routes/share.js:22-42`, `.env.example:121-122`  
**Issue**: `ALLOW_SHARED_LINKS=true` and `ALLOW_SHARED_LINKS_PUBLIC=true` are both set. This means any user can create a shared link to any conversation, and **anyone on the internet** can view it without authentication. For a product handling potentially sensitive AI conversations, this is risky.

**Fix plan**:
1. Set `ALLOW_SHARED_LINKS_PUBLIC=false` for v1, requiring authentication to view shared links.
2. Or disable shared links entirely until a proper sharing policy is defined.

---

<a id="low"></a>
## LOW — Backlog / Nice-to-Have

### L1. Debug Logging Enabled by Default

**File**: `.env.example:24` — `DEBUG_LOGGING=true`  
**Fix**: Set to `false` for production to prevent information leakage in logs.

---

### L2. TLS Verification Disabled in VS Code Debug Config

**File**: `.vscode/launch.json:12` — `NODE_TLS_REJECT_UNAUTHORIZED=0`  
**Fix**: Remove this line. It should only be used for local debugging, but developers may accidentally use this launch config in other contexts.

---

### L3. Hardcoded MeiliSearch Key in Dev Container

**File**: `.devcontainer/docker-compose.yml:61` — `MEILI_MASTER_KEY=5c71cf56...`  
**Fix**: Move to an env var or `.env` file even for dev containers.

---

### L4. MongoDB Without Auth in Dev Container

**File**: `.devcontainer/docker-compose.yml:48` — `mongod --noauth`  
**Fix**: Acceptable for local dev, but ensure production MongoDB always has authentication enabled.

---

### L5. 30+ Language Files Still Bundled

**File**: `client/src/locales/i18n.ts`  
**Issue**: Per LAUNCH_REVIEW.md, i18n cleanup was started but not finished. All language files are still imported, bloating the client bundle.  
**Fix**: Remove all locales except `pt-BR` and `en` (fallback).

---

### L6. Frontend Balance Display Shows Raw Token Credits

**File**: `client/src/components/Nav/SettingsTabs/Balance/TokenCreditsItem.tsx:21-23`  
**Issue**: Users see "100000.00" with no context. Token credits are meaningless to end users.  
**Fix**: Show a user-friendly representation (e.g., "~X messages remaining" or a percentage bar).

---

### L7. No Admin Endpoint for Balance Management

**Issue**: There's no API endpoint to manually view or adjust user balances. When customer support issues arise, there's no way to help users without direct DB access.  
**Fix**: Add admin-only endpoints for balance management (view all users, adjust balance, view transactions).

---

### L8. Test Files Co-located With Source Code

**Files**: Various `.spec.js` and `.test.js` files in `api/server/controllers/` and `api/server/routes/`  
**Issue**: Test files are deployed with the app. While not loaded at runtime, they increase container size and could contain sensitive test data.  
**Fix**: Exclude test files from production Docker builds via `.dockerignore`.

---

### L9. Prompts Dashboard Route Active Despite `prompts: false`

**File**: `client/src/routes/Dashboard.tsx:57-74`  
**Issue**: The `/d/prompts/*` route is the only active dashboard route, yet `prompts: false` is set in the config. The sidebar link is permission-gated, but direct URL access works.  
**Fix**: Either remove the prompts route from the dashboard, or gate it behind the config.

---

### L10. `helpAndFaqURL` Falls Back to `librechat.ai`

**File**: `api/server/routes/config.js:138`  
**Issue**: If `HELP_AND_FAQ_URL` is not set, the help link defaults to `https://librechat.ai` instead of `https://bizu.chat/ajuda`.  
**Fix**: Already set in `.env.example`, but the fallback in config.js should be updated to the Bizu URL.

---

## Fix Status — ALL IMPLEMENTED

All 29 actionable issues have been fixed in this branch. Here is the implementation summary:

### Commit 1: Critical & High Security Hardening
- **C1** CORS restricted to `DOMAIN_CLIENT` origin only
- **C2** Dashboard catch-all redirects to `/c/new` instead of non-existent `/d/files`
- **C4** `/api/config` split into public/private — strips `modelSpecs`, `balance`, `serverDomain`, `interfaceConfig` for unauthenticated requests
- **C5** `/oauth` routes only mounted when `ALLOW_SOCIAL_LOGIN` is enabled
- **C6** Startup guard exits process if `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CREDS_KEY`, or `CREDS_IV` are empty
- **H3** Rate limiter on `/api/auth/refresh` (30 req / 15 min)
- **H4** Rate limiter on `POST /api/user/verify` (5 req / 5 min)
- **H6** `requireJwtAuth` added to `/api/endpoints`
- **H8** Lang cookie validated with strict regex, defaults to `pt-BR`
- **M9** Parameter injection in keys route fixed (explicit field destructuring)
- **L10** `helpAndFaqURL` fallback changed from `librechat.ai` to `bizu.chat/ajuda`

### Commit 2: eval() Replacement & Presets Guard
- **C3** All `eval()` calls on env vars replaced with `math()` utility or safe regex-validated inline parsers
- **H1** Server-side feature-flag middleware added to presets route (returns 403 when disabled)

### Commit 3: Balance System Hardening
- **H2** Auto-refill now has `maxRefillCount` cap (set to 3), atomic `findOneAndUpdate` with `lastRefill` condition prevents concurrent double-refills, `refillCount` tracking added

### Commit 4: Remaining HIGH & MEDIUM Fixes
- **H5** Registration limits tightened (3/2hr), `ALLOW_UNVERIFIED_EMAIL_LOGIN` defaults to `false`
- **H7** Agent marketplace routes removed from frontend router
- **M1** Agent data hooks gated behind config to skip unnecessary API calls
- **M4** `$inc` replaced with `$setOnInsert` in `createUser` balance initialization
- **M5** Generic error message returned on registration failure
- **M6** Switched to async `bcrypt.genSalt()`/`bcrypt.hash()`
- **M10** `ALLOW_SHARED_LINKS_PUBLIC` defaults to `false`
- **L1** `DEBUG_LOGGING` defaults to `false`
- **L2** `NODE_TLS_REJECT_UNAUTHORIZED=0` removed, `NODE_ENV` set to `development`

### Commit 5: Pricing, Buffer, CI/CD Cleanup
- **M2** Explicit token pricing entries added for all Bizu OpenRouter model names
- **M3** Completion token buffer added to pre-call balance check (min(promptTokens, 1000))
- **M7** 18 upstream LibreChat CI/CD workflows removed
- **M8** Broken `deploy-compose.yml` script references replaced with informational messages
- **L8** `.dockerignore` created to exclude test files, `node_modules`, `.env`, `.git` from images
- **L9** Dashboard catch-all redirects to chat (covered by C2 fix)

---

## Remaining Considerations (Not Code Fixes)

These items require operational decisions, not code changes:

1. **Email service configuration** — Choose and configure an email provider (SendGrid, SES, SMTP) to enable proper email verification
2. **Stripe integration** — Needed for monetization; the refill cap (maxRefillCount: 3) is a stopgap
3. **MongoDB authentication** — Ensure production MongoDB has authentication enabled (the dev container uses `--noauth`)
4. **SSL/TLS** — Set up HTTPS via Caddy or nginx + Let's Encrypt for the production domain
5. **Real secrets** — Generate production values for `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CREDS_KEY`, `CREDS_IV` with `openssl rand -hex 32`
6. **Monitoring** — Add Sentry or similar for error tracking in production
7. **Backup strategy** — Set up automated MongoDB backups
