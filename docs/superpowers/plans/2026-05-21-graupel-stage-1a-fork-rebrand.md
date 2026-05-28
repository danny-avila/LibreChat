# Graupel Stage 1a — Fork + Rebrand + Code Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the LibreChat repository into a Graupel-branded AI workspace with zero user-facing LibreChat references. Keep only Google/GitHub/Local auth and the 5 MVP model providers (OpenAI, Anthropic, Google, xAI, DeepSeek). Remove Bedrock/Vertex/Ollama/Assistants endpoints and Discord/Apple/Facebook/SAML/LDAP/OpenID login strategies.

**Architecture:** Mechanical brand replacement + surgical code deletion. Internal package scopes (`@librechat/*`) and `EModelEndpoint` enum values stay intact — they're internal plumbing and old data depends on them. Implementations and UI entry points for cut features are removed.

**Tech Stack:** Node.js monorepo (Express + Vite + React + TypeScript), MongoDB, Tailwind CSS.

**Spec:** [2026-05-21-graupel-stage-1-fork-rebrand.md](../specs/2026-05-21-graupel-stage-1-fork-rebrand.md)

---

## Prerequisites (User Manual Steps)

Before starting any code tasks, the developer must complete these infrastructure steps:

- [ ] Fork `danny-avila/LibreChat` on GitHub → rename to `lidongyu/graupel-chat`
- [ ] Clone: `git clone git@github.com:lidongyu/graupel-chat.git && cd graupel-chat`
- [ ] Add upstream: `git remote add upstream git@github.com:danny-avila/LibreChat.git && git fetch upstream`
- [ ] Verify: `git remote -v` shows origin (`lidongyu/graupel-chat`) + upstream (`danny-avila/LibreChat`)
- [ ] Install + build: `npm run smart-reinstall` — confirm zero errors before any changes
- [ ] Create branch: `git checkout -b stage-1/fork-rebrand`

---

## Codebase Context

This is a monorepo with these workspaces (root `package.json` → `"workspaces": ["api", "client", "packages/*"]`):

| Workspace | npm name | Purpose |
|---|---|---|
| `api/` | `@librechat/backend` | Express server (JS, legacy) |
| `client/` | `@librechat/frontend` | React SPA (TypeScript) |
| `packages/api/` | `@librechat/api` | New backend code (TypeScript) |
| `packages/client/` | `@librechat/client` | Shared frontend utils |
| `packages/data-provider/` | `librechat-data-provider` | Shared types + API endpoints |
| `packages/data-schemas/` | `@librechat/data-schemas` | Mongoose schemas + models |

**Do NOT rename** `@librechat/*` package scopes — they appear in hundreds of imports across every workspace. Internal naming is explicitly kept per spec to avoid risk.

**Testing:** `cd api && npx jest <pattern>` for backend; `cd packages/data-schemas && npx jest <pattern>` for schemas. Full suite: `npm run test` from root (if available) or run per-workspace.

---

## Task List

### Task 1: Repository Documentation — UPSTREAM.md

**Files:**
- Create: `UPSTREAM.md`

- [ ] **Step 1: Create UPSTREAM.md**

```markdown
# Upstream Sync Strategy

This repository is a commercial fork of [LibreChat](https://github.com/danny-avila/LibreChat), renamed to **Graupel**.

## Sync Policy

- The `upstream` remote points to `danny-avila/LibreChat`
- **Only cherry-pick** security fixes and critical bugfixes from upstream
- **Do not** periodically merge `upstream/main` — the codebases have diverged intentionally
- Monthly: review upstream changelog, decide if any commit is worth cherry-picking

## Commands

```bash
# Fetch upstream
git fetch upstream

# Cherry-pick a specific fix
git cherry-pick <commit-hash>

# View divergence
git log --oneline upstream/main..HEAD | head -20
```

## History

- Forked from LibreChat at commit `XXXXXXX` on YYYY-MM-DD
- Reason: commercial SaaS product (Graupel) targeting overseas English market
```

- [ ] **Step 2: Update the fork commit hash and date**

Run: `git log --oneline upstream/main -1`

Replace `XXXXXXX` and `YYYY-MM-DD` with the actual values.

- [ ] **Step 3: Commit**

```bash
git add UPSTREAM.md
git commit -m "docs: add upstream sync strategy (UPSTREAM.md)"
```

---

### Task 2: Brand Strings — package.json + HTML + env

**Files:**
- Modify: `package.json` (root)
- Modify: `client/index.html`
- Modify: `.env.example`

- [ ] **Step 1: Update root package.json name**

In `package.json`, change `"name": "LibreChat"` to `"name": "graupel-chat"`. Leave all other fields (workspaces, scripts, dependencies) untouched. Do NOT change workspace package names (`@librechat/*`).

- [ ] **Step 2: Update client/index.html**

In `client/index.html`, make two changes:
- Line with `<meta name="description" ...>`: change content to `"Graupel — One subscription, all top AI models"`
- Line with `<title>LibreChat</title>`: change to `<title>Graupel</title>`

- [ ] **Step 3: Update .env.example APP_TITLE**

In `.env.example`, find `APP_TITLE=LibreChat` (around line 743) and change to `APP_TITLE=Graupel`.

- [ ] **Step 4: Update translation.json**

In `client/src/locales/en/translation.json`, find the one LibreChat reference:
```json
"com_agents_mcp_trust_subtext": "Custom connectors are not verified by LibreChat"
```
Change `LibreChat` to `Graupel`.

- [ ] **Step 5: Verify no user-visible LibreChat in these files**

Run:
```bash
rg -i 'librechat' package.json client/index.html .env.example client/src/locales/en/translation.json
```
Expected: zero hits (root package.json `name` is now `graupel-chat`).

- [ ] **Step 6: Commit**

```bash
git add package.json client/index.html .env.example client/src/locales/en/translation.json
git commit -m "chore: replace LibreChat brand strings with Graupel"
```

---

### Task 3: Brand Strings — README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace README.md with Graupel README**

The existing README has ~40 LibreChat references. Don't find-and-replace — write a minimal new README:

```markdown
# Graupel

> Your AI Workspace — one subscription, all top AI models.

Graupel is a multi-model AI workspace SaaS. Access GPT-5, Claude Opus, Gemini Pro, Grok, DeepSeek and more in one place.

## Development

```bash
npm run smart-reinstall   # Install deps + build
npm run backend:dev       # Start backend (port 3080)
npm run frontend:dev      # Start frontend dev server (port 3090)
```

## Architecture

See [CLAUDE.md](CLAUDE.md) for the full workspace structure, code style guide, and development commands.

## Fork History

Forked from [LibreChat](https://github.com/danny-avila/LibreChat). See [UPSTREAM.md](UPSTREAM.md) for sync strategy.

## License

See [LICENSE](LICENSE).
```

- [ ] **Step 2: Delete README.zh.md**

The Chinese README has ~30 LibreChat references and targets a market we don't serve. Delete it:
```bash
rm -f README.zh.md
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git rm -f README.zh.md 2>/dev/null || true
git commit -m "docs: replace README with Graupel version, remove Chinese README"
```

---

### Task 4: Visual Assets — Placeholder Logo

**Files:**
- Modify: `client/public/assets/logo.svg`

- [ ] **Step 1: Replace logo.svg with Graupel placeholder**

Overwrite `client/public/assets/logo.svg` with:

```svg
<svg width="180" height="40" viewBox="0 0 180 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Hexagon "soft hail" icon -->
  <polygon points="18,4 30,10 30,22 18,28 6,22 6,10" fill="#0ea5e9" stroke="#0284c7" stroke-width="1.5"/>
  <polygon points="18,11 24,14 24,20 18,23 12,20 12,14" fill="#e0f2fe" opacity="0.9"/>
  <circle cx="18" cy="16" r="2.5" fill="#0284c7" opacity="0.4"/>
  <!-- Wordmark -->
  <text x="40" y="26" font-family="Inter, -apple-system, BlinkMacSystemFont, sans-serif" font-size="22" font-weight="600" fill="#0f172a" letter-spacing="-0.02em">Graupel</text>
</svg>
```

- [ ] **Step 2: Verify logo renders**

Run: `npm run frontend:dev` (or open the SVG file directly in a browser) and confirm the logo shows a hexagon icon + "Graupel" text.

- [ ] **Step 3: Commit**

```bash
git add client/public/assets/logo.svg
git commit -m "art: replace logo with Graupel placeholder SVG"
```

---

### Task 5: Visual Assets — Favicon + PWA Icons

**Files:**
- Modify: `client/public/assets/favicon-16x16.png`
- Modify: `client/public/assets/favicon-32x32.png`
- Modify: `client/public/assets/apple-touch-icon-180x180.png`
- Modify: `client/public/assets/icon-192x192.png`
- Modify: `client/public/assets/maskable-icon.png`

- [ ] **Step 1: Generate favicon set from the hexagon icon**

Use the hexagon from logo.svg to generate PNG favicons. The fastest approach:

```bash
# Install sharp-cli if not available
npx sharp-cli -i client/public/assets/logo.svg -o /tmp/graupel-icon.png --width 512 --height 512

# Or use ImageMagick if available:
# convert -background none -resize 512x512 client/public/assets/logo.svg /tmp/graupel-icon.png
```

If neither tool works, create a simple 512×512 PNG with the hexagon icon (ice-blue `#0ea5e9` hexagon on transparent background) using any method available, then resize:

```bash
# From the 512px source, generate all sizes:
npx sharp-cli -i /tmp/graupel-icon.png -o client/public/assets/favicon-16x16.png --width 16 --height 16
npx sharp-cli -i /tmp/graupel-icon.png -o client/public/assets/favicon-32x32.png --width 32 --height 32
npx sharp-cli -i /tmp/graupel-icon.png -o client/public/assets/apple-touch-icon-180x180.png --width 180 --height 180
npx sharp-cli -i /tmp/graupel-icon.png -o client/public/assets/icon-192x192.png --width 192 --height 192
npx sharp-cli -i /tmp/graupel-icon.png -o client/public/assets/maskable-icon.png --width 512 --height 512
```

**Note:** If `sharp-cli` or `convert` aren't available, skip this task and mark it as blocked — the developer will provide assets manually. The old LibreChat icons will remain until then.

- [ ] **Step 2: Commit**

```bash
git add client/public/assets/favicon-*.png client/public/assets/apple-touch-icon-*.png client/public/assets/icon-*.png client/public/assets/maskable-icon.png
git commit -m "art: replace favicon and PWA icons with Graupel hexagon"
```

---

### Task 6: Visual Assets — Brand Color

**Files:**
- Modify: `client/src/style.css`
- Modify: `client/tailwind.config.cjs`

- [ ] **Step 1: Replace CSS variable in style.css**

In `client/src/style.css`, find all instances of `--brand-purple: #ab68ff` and replace with `--brand-blue: #0ea5e9`. There are 3 occurrences (light theme ~line 58, dark theme ~line 70, and ~line 133). Use find-and-replace:

```
Old: --brand-purple: #ab68ff;
New: --brand-blue: #0ea5e9;
```

Also search for any other references to `brand-purple` in the same file and rename to `brand-blue`.

- [ ] **Step 2: Update tailwind.config.cjs**

In `client/tailwind.config.cjs`, around line 88, find:
```js
'brand-purple': 'var(--brand-purple)',
```
Replace with:
```js
'brand-blue': 'var(--brand-blue)',
```

- [ ] **Step 3: Update all brand-purple references in client/**

Run:
```bash
rg 'brand-purple' client/src/ --glob '!node_modules' -l
```

For each file found, replace `brand-purple` with `brand-blue`. This may include component files that use the Tailwind class `text-brand-purple` or `bg-brand-purple`.

- [ ] **Step 4: Verify no remaining brand-purple references**

Run:
```bash
rg 'brand-purple' client/ --glob '!node_modules'
```
Expected: zero hits.

- [ ] **Step 5: Commit**

```bash
git add client/src/style.css client/tailwind.config.cjs
git add -u client/src/  # stage any modified component files
git commit -m "style: replace brand-purple with brand-blue (ice blue #0ea5e9)"
```

---

### Task 7: Delete Frontend Social Login Providers

**Files:**
- Modify: `client/src/components/Auth/SocialLoginRender.tsx`
- Modify: `client/src/components/Auth/LoginForm.tsx`

- [ ] **Step 1: Update SocialLoginRender.tsx**

In `client/src/components/Auth/SocialLoginRender.tsx`:

1. Remove these entries from the `providerComponents` map: `discord`, `facebook`, `apple`, `openid`, `saml`
2. Keep only: `github`, `google`
3. Remove unused icon imports: `DiscordIcon`, `FacebookIcon`, `AppleIcon`, `OpenIDIcon`, `SamlIcon` (from `@librechat/client` or wherever they're imported)
4. Remove any references to `startupConfig.openidImageUrl`, `startupConfig.openidLabel`, `startupConfig.samlImageUrl`, `startupConfig.samlLabel`

The remaining `providerComponents` should only have `github` and `google` entries.

- [ ] **Step 2: Remove LDAP check from LoginForm.tsx**

In `client/src/components/Auth/LoginForm.tsx`, find:
```ts
const useUsernameLogin = config?.ldap?.username;
```
Remove this line and any UI logic that uses `useUsernameLogin` (it likely toggles the login field between "email" and "username" labels). After removal, the login form should always show the email field.

- [ ] **Step 3: Verify no remaining references to deleted providers in Auth/**

Run:
```bash
rg -i 'discord|facebook|apple|openid|saml|ldap' client/src/components/Auth/ --glob '!node_modules'
```
Expected: zero hits (or only innocuous string references in i18n keys that are never rendered).

- [ ] **Step 4: Commit**

```bash
git add client/src/components/Auth/SocialLoginRender.tsx client/src/components/Auth/LoginForm.tsx
git commit -m "feat: remove Discord/Facebook/Apple/OpenID/SAML/LDAP from login UI"
```

---

### Task 8: Delete Backend Social Login Strategy Files

**Files:**
- Delete: `api/strategies/discordStrategy.js`
- Delete: `api/strategies/facebookStrategy.js`
- Delete: `api/strategies/appleStrategy.js`
- Delete: `api/strategies/appleStrategy.test.js` (if exists)
- Delete: `api/strategies/samlStrategy.js`
- Delete: `api/strategies/samlStrategy.spec.js` (if exists)
- Delete: `api/strategies/ldapStrategy.js`
- Delete: `api/strategies/ldapStrategy.spec.js` (if exists)
- Delete: `api/strategies/openidStrategy.js`
- Delete: `api/strategies/openidStrategy.spec.js` (if exists)
- Delete: `api/strategies/openIdJwtStrategy.js`
- Delete: `api/strategies/openIdJwtStrategy.spec.js` (if exists)
- Modify: `api/strategies/index.js`

- [ ] **Step 1: Delete strategy files**

```bash
cd api/strategies
rm -f discordStrategy.js facebookStrategy.js appleStrategy.js samlStrategy.js ldapStrategy.js openidStrategy.js openIdJwtStrategy.js
rm -f appleStrategy.test.js samlStrategy.spec.js ldapStrategy.spec.js openidStrategy.spec.js openIdJwtStrategy.spec.js
```

- [ ] **Step 2: Update api/strategies/index.js barrel export**

Replace the entire file with:

```js
const passportLogin = require('./localStrategy');
const googleLogin = require('./googleStrategy');
const { googleAdminLogin } = googleLogin;
const githubLogin = require('./githubStrategy');
const { githubAdminLogin } = githubLogin;
const jwtLogin = require('./jwtStrategy');

module.exports = {
  passportLogin,
  googleLogin,
  googleAdminLogin,
  githubLogin,
  githubAdminLogin,
  jwtLogin,
};
```

- [ ] **Step 3: Verify only kept strategies remain**

```bash
ls api/strategies/*.js | grep -v node_modules | sort
```

Expected files: `githubStrategy.js`, `googleStrategy.js`, `index.js`, `jwtStrategy.js`, `localStrategy.js`, `process.js`, `socialLogin.js`, `validators.js`.

- [ ] **Step 4: Commit**

```bash
git add -A api/strategies/
git commit -m "feat: delete Discord/Facebook/Apple/SAML/LDAP/OpenID strategy files"
```

---

### Task 9: Clean Backend Social Login Wiring

**Files:**
- Modify: `api/server/socialLogins.js`
- Modify: `api/server/routes/oauth.js`
- Modify: `api/server/routes/admin/auth.js`

- [ ] **Step 1: Simplify api/server/socialLogins.js**

This file imports all social strategies and conditionally registers them via `passport.use()`. Remove all imports and conditional blocks for: `facebookLogin`, `facebookAdminLogin`, `discordLogin`, `discordAdminLogin`, `setupOpenId`, `openIdJwtLogin`, `appleLogin`, `appleAdminLogin`, `setupSaml`.

Keep only: `googleLogin`, `googleAdminLogin`, `githubLogin`, `githubAdminLogin` (from `~/strategies`).

Remove any `express-session` setup for OpenID or SAML (they use `express-session` with provider-specific cache stores).

The resulting file should only have Google and GitHub conditional blocks.

- [ ] **Step 2: Simplify api/server/routes/oauth.js**

Remove the route blocks for: `/facebook`, `/openid`, `/discord`, `/apple`, `/saml` (both initiation and callback routes for each).

Keep only: `/google` + `/google/callback`, `/github` + `/github/callback`, and the `/error` route.

- [ ] **Step 3: Simplify api/server/routes/admin/auth.js**

Remove admin OAuth routes for: `/oauth/discord`, `/oauth/facebook`, `/oauth/apple`, `/oauth/openid`, `/oauth/saml` (both initiation and callback for each).

Keep: `/login/local`, `/verify`, `/oauth/google` + callback, `/oauth/github` + callback, `/oauth/exchange`, `/oauth/refresh`.

For `/oauth/openid/check` route — remove it (OpenID is deleted).

For `/oauth/refresh` — if it's specifically for OpenID token reuse (`OPENID_REUSE_TOKENS`), remove it too. If it serves other purposes, keep it.

- [ ] **Step 4: Verify no remaining references to deleted strategies in routes**

```bash
rg -i 'discord|facebook|apple|openid|saml' api/server/routes/oauth.js api/server/routes/admin/auth.js api/server/socialLogins.js
```
Expected: zero hits.

- [ ] **Step 5: Commit**

```bash
git add api/server/socialLogins.js api/server/routes/oauth.js api/server/routes/admin/auth.js
git commit -m "feat: remove deleted social login wiring from routes and orchestrator"
```

---

### Task 10: Delete LDAP Backend Wiring

**Files:**
- Delete: `api/server/services/Config/ldap.js`
- Delete: `api/server/middleware/requireLdapAuth.js`
- Delete: `api/server/routes/__tests__/ldap.spec.js`
- Modify: `api/server/index.js`
- Modify: `api/server/experimental.js`
- Modify: `api/server/routes/auth.js`
- Modify: `api/server/routes/config.js`
- Modify: `api/server/middleware/index.js`

- [ ] **Step 1: Delete LDAP-specific files**

```bash
rm -f api/server/services/Config/ldap.js
rm -f api/server/middleware/requireLdapAuth.js
rm -f api/server/routes/__tests__/ldap.spec.js
```

- [ ] **Step 2: Clean api/server/index.js**

Find and remove:
1. The import: `const { jwtLogin, ldapLogin, passportLogin } = require('~/strategies');` — change to `const { jwtLogin, passportLogin } = require('~/strategies');`
2. The LDAP conditional block (~lines 173-176):
```js
/* LDAP Auth */
if (process.env.LDAP_URL && process.env.LDAP_USER_SEARCH_BASE) {
  passport.use(ldapLogin);
}
```

- [ ] **Step 3: Clean api/server/experimental.js**

Same changes as Step 2 — this is a parallel entry point. Find and remove `ldapLogin` import and the LDAP conditional block (~lines 364-366).

- [ ] **Step 4: Clean api/server/routes/auth.js**

Find the LDAP auth ternary (~line 40-48):
```js
const ldapAuth = !!process.env.LDAP_URL && !!process.env.LDAP_USER_SEARCH_BASE;
// ...
ldapAuth ? middleware.requireLdapAuth : middleware.requireLocalAuth,
```

Replace with just `middleware.requireLocalAuth` — remove the `ldapAuth` variable and the ternary. The login route should always use local auth.

- [ ] **Step 5: Clean api/server/routes/config.js**

Remove:
1. Import: `const { getLdapConfig } = require('~/server/services/Config/ldap');`
2. The `const ldap = getLdapConfig();` call
3. The `if (ldap) { payload.ldap = ldap; }` block
4. The line that disables registration when LDAP is active: update `registrationEnabled` to remove the `!ldap?.enabled &&` guard (registration should just check `process.env.ALLOW_REGISTRATION`)

- [ ] **Step 6: Clean api/server/middleware/index.js**

Remove `requireLdapAuth` from the middleware exports/imports.

- [ ] **Step 7: Verify no remaining LDAP references in api/server/**

```bash
rg -i 'ldap' api/server/ --glob '!node_modules' --glob '!__tests__'
```
Expected: zero hits (test files in `__tests__` may still have incidental references in mock setups — address those if they cause test failures).

- [ ] **Step 8: Commit**

```bash
git add -A api/server/services/Config/ldap.js api/server/middleware/requireLdapAuth.js api/server/routes/__tests__/ldap.spec.js
git add api/server/index.js api/server/experimental.js api/server/routes/auth.js api/server/routes/config.js api/server/middleware/index.js
git commit -m "feat: remove LDAP authentication support"
```

---

### Task 11: Clean .env.example — Remove Deleted Provider Vars

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Remove env var sections for deleted providers**

In `.env.example`, remove the following sections entirely (including surrounding comments):

| Provider | Approximate lines | Key prefix |
|---|---|---|
| Discord | ~500-503 | `DISCORD_*` |
| Facebook | ~505-508 | `FACEBOOK_*` |
| Apple | ~523-528 | `APPLE_*` |
| OpenID | ~530-578 | `OPENID_*` |
| SAML | ~596-620 | `SAML_*` |
| LDAP | ~637-651 | `LDAP_*` |

**Tip:** Search for each prefix block header comment and delete from there to the next section.

- [ ] **Step 2: Verify no remaining deleted provider vars**

```bash
rg -i 'DISCORD_|FACEBOOK_|APPLE_|OPENID_|SAML_|LDAP_' .env.example
```
Expected: zero hits.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: remove Discord/Facebook/Apple/OpenID/SAML/LDAP env vars from .env.example"
```

---

### Task 11b: Deferred Items — OG Image + Manifest

These items are mentioned in the spec but don't have existing files to replace:

- **OG image** (`client/public/og-image.png`): Does not exist in the codebase. Defer to Stage 4 (marketing pages) where proper OG images will be created for each page.
- **manifest.webmanifest**: Does not exist. Defer to Stage 4 or create during 1b deployment.

No code changes in this task — this is a tracking note.

---

### Task 12: Hide Deleted Endpoints from Frontend

**Files:**
- Modify: `client/src/hooks/Endpoint/Icons.tsx`

- [ ] **Step 1: Remove assistants/bedrock icons from the icon map**

In `client/src/hooks/Endpoint/Icons.tsx`, find the `icons` record (~lines 61-72) and remove these entries:
```ts
[EModelEndpoint.assistants]: AssistantAvatar,
[EModelEndpoint.azureAssistants]: AssistantAvatar,
[EModelEndpoint.bedrock]: Bedrock,
```

Keep: `azureOpenAI`, `openAI`, `anthropic`, `google`, `custom`, `agents`, `unknown`.

Also remove the unused `Bedrock` wrapper component and `AssistantAvatar` component if they're defined in the same file and not used elsewhere. Remove their imports too (`BedrockIcon`, `AssistantIcon`, etc.) — but only if they have no other consumers. Verify with grep:

```bash
rg 'AssistantAvatar|Bedrock' client/src/ --glob '!node_modules' -l
```

- [ ] **Step 2: Verify frontend build compiles**

```bash
npm run build:data-provider && cd client && npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/Endpoint/Icons.tsx
git commit -m "feat: remove Assistants and Bedrock from frontend endpoint icons"
```

---

### Task 13: Delete Assistants Backend Implementation

**Files:**
- Delete: `api/server/services/Endpoints/assistants/` (4 files)
- Delete: `api/server/services/Endpoints/azureAssistants/` (3 files)
- Delete: `api/server/controllers/assistants/` (6 files)
- Delete: `api/server/routes/assistants/` (8+ files)
- Modify: `api/server/routes/index.js`
- Modify: `api/server/middleware/buildEndpointOption.js`
- Modify: `api/server/middleware/buildEndpointOption.spec.js`
- Delete: `api/server/middleware/abortRun.js`
- Modify: `api/server/middleware/abortMiddleware.js`
- Modify: `api/server/middleware/abortMiddleware.spec.js`
- Modify: `api/server/routes/convos.js`
- Modify: `api/server/routes/__tests__/convos.spec.js`
- Modify: `api/server/routes/__tests__/convos-duplicate-ratelimit.spec.js`
- Modify: `api/server/routes/__test-utils__/convos-route-mocks.js`

- [ ] **Step 1: Delete implementation directories**

```bash
rm -rf api/server/services/Endpoints/assistants/
rm -rf api/server/services/Endpoints/azureAssistants/
rm -rf api/server/controllers/assistants/
rm -rf api/server/routes/assistants/
```

- [ ] **Step 2: Remove assistants route mount from api/server/routes/index.js**

Find and remove:
```js
const assistants = require('./assistants');
```
And remove `assistants` from the exported object (~line 67).

- [ ] **Step 3: Clean api/server/middleware/buildEndpointOption.js**

Remove the imports:
```js
const azureAssistants = require('~/server/services/Endpoints/azureAssistants');
const assistants = require('~/server/services/Endpoints/assistants');
```

Remove the map entries:
```js
[EModelEndpoint.assistants]: assistants.buildOptions,
[EModelEndpoint.azureAssistants]: azureAssistants.buildOptions,
```

- [ ] **Step 4: Delete api/server/middleware/abortRun.js**

This file is 100% assistants-specific (uses OpenAI `threads.runs.cancel` API). Delete it entirely:

```bash
rm -f api/server/middleware/abortRun.js
```

- [ ] **Step 5: Clean api/server/middleware/abortMiddleware.js**

This file imports `abortRun` and delegates to it when the endpoint is an assistants endpoint. Remove the assistants path:

1. Remove import: `const { abortRun } = require('./abortRun');`
2. Remove import: `isAssistantsEndpoint` from the `librechat-data-provider` import (line 2) — only if it's not used elsewhere in the file
3. In the `abortMessage` function, remove the early-return block:
```js
if (isAssistantsEndpoint(endpoint)) {
  return await abortRun(req, res);
}
```

The remaining `GenerationJobManager.abortJob` path handles all non-assistants endpoints and will be the only abort path.

Also update `api/server/middleware/abortMiddleware.spec.js`: remove the `jest.mock('./abortRun', ...)` block and any test cases that test the assistants abort path.

- [ ] **Step 6: Clean api/server/routes/convos.js**

Remove the two entries from the endpoint module map (~lines 25-26):
```js
[EModelEndpoint.azureAssistants]: require('~/server/services/Endpoints/azureAssistants'),
[EModelEndpoint.assistants]: require('~/server/services/Endpoints/assistants'),
```

- [ ] **Step 7: Clean test files**

In `api/server/middleware/buildEndpointOption.spec.js`: remove any test cases for `assistants` or `azureAssistants` endpoints.

In `api/server/routes/__tests__/convos.spec.js` and `convos-duplicate-ratelimit.spec.js`: remove test cases and mock setups that reference assistants. Also check `api/server/routes/__test-utils__/convos-route-mocks.js` for assistants mock entries and remove them.

Run:
```bash
rg 'assistants|azureAssistants' api/server/middleware/buildEndpointOption.spec.js api/server/routes/__tests__/convos*.js api/server/routes/__test-utils__/ 2>/dev/null
```
Fix any remaining references.

- [ ] **Step 8: Check for other assistants imports in api/**

```bash
rg 'Endpoints/assistants|Endpoints/azureAssistants|controllers/assistants|routes/assistants' api/ --glob '!node_modules' -l
```

If any files remain, update them to remove the dead imports. Common candidates:
- `api/server/services/Files/process.js` — may reference assistants controllers for file processing. Remove the assistants-specific import and code path.

- [ ] **Step 9: Run backend tests**

```bash
cd api && npx jest --passWithNoTests 2>&1 | tail -20
```
Expected: all tests pass (deleted test files won't run; modified tests should still pass).

- [ ] **Step 10: Commit**

```bash
git add -A api/server/services/Endpoints/assistants/ api/server/services/Endpoints/azureAssistants/ api/server/controllers/assistants/ api/server/routes/assistants/
git add -A api/server/middleware/abortRun.js
git add api/server/routes/index.js api/server/middleware/buildEndpointOption.js api/server/middleware/buildEndpointOption.spec.js api/server/middleware/abortMiddleware.js api/server/middleware/abortMiddleware.spec.js api/server/routes/convos.js
git add api/server/routes/__tests__/ api/server/routes/__test-utils__/
git commit -m "feat: remove Assistants and Azure Assistants endpoint implementation"
```

---

### Task 14: Remove Vertex/Bedrock from Config Loading

**Files:**
- Modify: `packages/data-schemas/src/app/endpoints.ts`
- Modify: `packages/data-schemas/src/app/index.ts`
- Delete: `packages/data-schemas/src/app/assistants.ts`
- Delete: `packages/data-schemas/src/app/vertex.ts`

- [ ] **Step 1: Delete schema config files**

```bash
rm -f packages/data-schemas/src/app/assistants.ts
rm -f packages/data-schemas/src/app/vertex.ts
```

- [ ] **Step 2: Update packages/data-schemas/src/app/endpoints.ts**

Remove the imports:
```ts
import { azureAssistantsDefaults, assistantsConfigSetup } from './assistants';
import { vertexConfigSetup } from './vertex';
```

Remove the 4 conditional blocks for assistants/azureAssistants (~lines 25-43):
```ts
if (endpoints?.[EModelEndpoint.azureOpenAI]?.assistants) { ... }
if (endpoints?.[EModelEndpoint.azureAssistants]) { ... }
if (endpoints?.[EModelEndpoint.assistants]) { ... }
```

Simplify the Anthropic block (~lines 47-60) — remove Vertex sub-config:
```ts
// Before (complex):
if (endpoints?.[EModelEndpoint.anthropic]) {
  const anthropicConfig = endpoints[EModelEndpoint.anthropic] as TAnthropicEndpoint;
  const vertexConfig = vertexConfigSetup(config);
  loadedEndpoints[EModelEndpoint.anthropic] = {
    ...anthropicConfig,
    ...(vertexConfig?.modelNames && { models: vertexConfig.modelNames }),
    ...(vertexConfig && { vertexConfig }),
  };
}

// After (simple):
if (endpoints?.[EModelEndpoint.anthropic]) {
  loadedEndpoints[EModelEndpoint.anthropic] = endpoints[EModelEndpoint.anthropic];
}
```

Remove `EModelEndpoint.bedrock` from the `endpointKeys` array (~line 66):
```ts
// Before:
const endpointKeys = [
  EModelEndpoint.openAI,
  EModelEndpoint.google,
  EModelEndpoint.custom,
  EModelEndpoint.bedrock,
];

// After:
const endpointKeys = [
  EModelEndpoint.openAI,
  EModelEndpoint.google,
  EModelEndpoint.custom,
];
```

- [ ] **Step 3: Update packages/data-schemas/src/app/index.ts**

Remove: `export * from './vertex';`

The file should now export: `agents`, `interface`, `memory`, `service`, `specs`, `turnstile`, `web`, `resolution`.

- [ ] **Step 4: Build data-schemas to verify**

```bash
cd packages/data-schemas && npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 5: Run data-schemas tests**

```bash
cd packages/data-schemas && npx jest --passWithNoTests 2>&1 | tail -20
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A packages/data-schemas/src/app/assistants.ts packages/data-schemas/src/app/vertex.ts
git add packages/data-schemas/src/app/endpoints.ts packages/data-schemas/src/app/index.ts
git commit -m "feat: remove Assistants/Vertex/Bedrock from endpoint config loading"
```

---

### Task 15: Create graupel.yaml.example

**Files:**
- Create: `graupel.yaml.example`

- [ ] **Step 1: Create simplified config**

Create `graupel.yaml.example` at the project root. This replaces `librechat.example.yaml` as the reference config. Include only the 5 MVP providers. **Do not add `costTier` yet** (Stage 3 work).

```yaml
# Graupel Configuration
# Copy this file to `graupel.yaml` and adjust values.

version: 1.3.11

cache: true

# File storage: use S3-compatible (Cloudflare R2)
fileStrategy: "s3"

interface:
  endpointsMenu: true
  modelSelect: true
  parameters: true
  presets: false

registration:
  socialLogins:
    - google
    - github

endpoints:
  # OpenAI — GPT-5 family
  openAI:
    titleConvo: true
    titleModel: "gpt-5-mini"
    summarize: true
    summaryModel: "gpt-5-mini"
    # models are fetched from OpenAI API automatically

  # Anthropic — Claude family
  anthropic:
    titleConvo: true
    titleModel: "claude-haiku-4-5"
    summarize: true
    summaryModel: "claude-haiku-4-5"

  # Google — Gemini family
  google:
    titleConvo: true
    titleModel: "gemini-2.5-flash"
    summarize: true
    summaryModel: "gemini-2.5-flash"

  # Custom endpoints for providers without native support
  custom:
    # xAI — Grok family
    - name: "xAI"
      apiKey: "${XAI_API_KEY}"
      baseURL: "https://api.x.ai/v1"
      models:
        default: ["grok-4", "grok-3-mini"]
      titleConvo: true
      titleModel: "grok-3-mini"
      modelDisplayLabel: "xAI"

    # DeepSeek
    - name: "DeepSeek"
      apiKey: "${DEEPSEEK_API_KEY}"
      baseURL: "https://api.deepseek.com/v1"
      models:
        default: ["deepseek-chat", "deepseek-reasoner"]
      titleConvo: true
      titleModel: "deepseek-chat"
      modelDisplayLabel: "DeepSeek"
```

- [ ] **Step 2: Update .env.example to reference new config file**

Search `.env.example` for any reference to `librechat.yaml` or `LIBRECHAT_YAML` and update to `graupel.yaml` / `GRAUPEL_YAML` (if such an env var exists). If no such env var exists, no change needed.

```bash
rg -n 'librechat.yaml\|LIBRECHAT_YAML' .env.example
```

- [ ] **Step 3: Commit**

```bash
git add graupel.yaml.example
git commit -m "chore: add graupel.yaml.example with MVP-only endpoints"
```

---

### Task 16: Docker — Rename Containers

**Files:**
- Modify: `docker-compose.yml`
- Modify: `deploy-compose.yml`

- [ ] **Step 1: Update docker-compose.yml**

Find and replace:
- `container_name: LibreChat` → `container_name: graupel`
- Any `MONGO_URI` value containing `/LibreChat` → `/graupel` (database name)
- Any service names like `librechat-api` → `graupel-api` if present
- Image references `registry.librechat.ai/...` → leave as-is for now (these are the base images from upstream; we'll build our own in 1b)

- [ ] **Step 2: Update deploy-compose.yml**

Same pattern:
- `container_name: LibreChat-API` → `container_name: graupel-api`
- `container_name: LibreChat-NGINX` → `container_name: graupel-nginx` (if present)
- `MONGO_URI` database name: `/LibreChat` → `/graupel`

- [ ] **Step 3: Verify no remaining LibreChat container names**

```bash
rg -i 'container_name.*librechat\|/LibreChat' docker-compose.yml deploy-compose.yml
```
Expected: zero hits.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml deploy-compose.yml
git commit -m "chore: rename Docker containers and DB name from LibreChat to Graupel"
```

---

### Task 17: GitHub Actions — Deploy Workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create deploy workflow**

```yaml
name: Deploy to Coolify

on:
  push:
    branches: [main]

jobs:
  trigger-coolify:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Coolify deploy
        run: |
          curl -fsS -X POST "${{ secrets.COOLIFY_DEPLOY_WEBHOOK }}" \
            -H "Content-Type: application/json" \
            --max-time 30
```

**Note:** The `COOLIFY_DEPLOY_WEBHOOK` secret must be configured in the GitHub repo settings (Settings → Secrets → Actions). This is a 1b infrastructure step — the workflow file is ready but won't fire until the secret is set.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add Coolify deploy workflow (trigger on push to main)"
```

---

### Task 18: Final Verification

- [ ] **Step 1: Full LibreChat grep — user-visible surfaces**

```bash
rg -i 'librechat' \
  --glob '!node_modules' \
  --glob '!*.lock' \
  --glob '!UPSTREAM.md' \
  --glob '!CLAUDE.md' \
  --glob '!docs/superpowers/**' \
  --glob '!.git' \
  . | grep -v '@librechat/' | grep -v 'librechat-data-provider' | grep -v 'registry.librechat.ai'
```

This filters out:
- Internal package imports (`@librechat/*`, `librechat-data-provider`)
- Upstream container registry references (`registry.librechat.ai`)
- Fork documentation (`UPSTREAM.md`, `CLAUDE.md`, design specs)

**Expected:** Zero remaining user-visible LibreChat references. If any appear:
- In code comments → remove the comment or update to Graupel
- In docs/ → update if user-facing, ignore if internal spec
- In config → update

- [ ] **Step 2: Build all workspaces**

```bash
npm run build
```
Expected: all workspaces build successfully with zero errors.

- [ ] **Step 3: Run full test suite**

```bash
cd api && npx jest --passWithNoTests 2>&1 | tail -5
cd ../packages/api && npx jest --passWithNoTests 2>&1 | tail -5
cd ../packages/data-schemas && npx jest --passWithNoTests 2>&1 | tail -5
cd ../packages/data-provider && npx jest --passWithNoTests 2>&1 | tail -5
```
Expected: all suites pass. If specific tests fail due to removed code references, fix them (likely missed mock cleanup or stale fixture references).

- [ ] **Step 4: Start backend and verify it boots**

```bash
npm run backend 2>&1 &
sleep 5
curl -s http://localhost:3080/healthz
kill %1
```
Expected: backend starts without require() errors; healthz returns 200.

- [ ] **Step 5: Start frontend dev server and verify**

```bash
npm run frontend:dev &
sleep 10
curl -s http://localhost:3090/ | head -5
kill %1
```
Expected: frontend loads, `<title>Graupel</title>` visible in HTML.

- [ ] **Step 6: Final commit for any fixes**

If Steps 1-5 revealed issues, fix them and commit:
```bash
git add -A
git commit -m "fix: address verification issues from Stage 1a final sweep"
```

- [ ] **Step 7: Push for review**

```bash
git push -u origin stage-1/fork-rebrand
```

Create a PR: `gh pr create --title "Stage 1a: Fork + Rebrand + Code Cleanup" --body "..."`

---

## Summary of Commits

| # | Message | Scope |
|---|---|---|
| 1 | `docs: add upstream sync strategy (UPSTREAM.md)` | Repo setup |
| 2 | `chore: replace LibreChat brand strings with Graupel` | Brand |
| 3 | `docs: replace README with Graupel version` | Brand |
| 4 | `art: replace logo with Graupel placeholder SVG` | Visual |
| 5 | `art: replace favicon and PWA icons with Graupel hexagon` | Visual |
| 6 | `style: replace brand-purple with brand-blue` | Visual |
| 7 | `feat: remove Discord/Facebook/Apple/OpenID/SAML/LDAP from login UI` | Auth cleanup |
| 8 | `feat: delete Discord/Facebook/Apple/SAML/LDAP/OpenID strategy files` | Auth cleanup |
| 9 | `feat: remove deleted social login wiring from routes and orchestrator` | Auth cleanup |
| 10 | `feat: remove LDAP authentication support` | Auth cleanup |
| 11 | `chore: remove deleted provider env vars from .env.example` | Config |
| 12 | `feat: remove Assistants and Bedrock from frontend endpoint icons` | Endpoint cleanup |
| 13 | `feat: remove Assistants and Azure Assistants endpoint implementation` | Endpoint cleanup |
| 14 | `feat: remove Assistants/Vertex/Bedrock from endpoint config loading` | Endpoint cleanup |
| 15 | `chore: add graupel.yaml.example with MVP-only endpoints` | Config |
| 16 | `chore: rename Docker containers and DB name` | Docker |
| 17 | `ci: add Coolify deploy workflow` | CI |
| 18 | `fix: address verification issues from Stage 1a final sweep` | Verification |
