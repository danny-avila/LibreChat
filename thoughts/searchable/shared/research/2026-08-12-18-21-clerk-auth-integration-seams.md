---
date: 2026-08-12T18:21:24-04:00
researcher: maceo
git_commit: cc84c390a6debcf51e10f904ab6512630c48a056
branch: main
repository: silmari-chat
topic: "Seams, interfaces, and pre/postconditions for adding Clerk as an auth provider"
tags: [research, codebase, auth, oauth, jwt, session, clerk, passport, frontend-auth]
status: complete
last_updated: 2026-08-12
last_updated_by: maceo
---

# Research: Seams, interfaces, and pre/postconditions for adding Clerk as an auth provider

**Date**: 2026-08-12T18:21:24-04:00
**Researcher**: maceo
**Git Commit**: cc84c390a6debcf51e10f904ab6512630c48a056
**Branch**: main
**Repository**: silmari-chat

## Research Question

Research the codebase to find the seams, interfaces, and needed preconditions and postconditions relevant to adding Clerk as an identity provider to this LibreChat fork's existing authentication system — scoped to the integration shape discussed immediately prior in this session: Clerk plugs in alongside the existing OAuth-provider pattern (new `User` field, find-or-create, hand off to the existing JWT/session machinery) rather than replacing it wholesale.

## Summary

This repo (a LibreChat fork) has a single, consistently repeated pattern for adding a login method: a Passport strategy factory maps a provider's profile shape into `{email, id, avatarUrl, username, name, emailVerified}`, a shared `socialLogin()` factory (`api/strategies/socialLogin.js`) does find-by-provider-ID-then-by-email against the `User` collection and calls `createSocialUser()` on a miss, and a shared `setAuthTokens()` (`api/server/services/AuthService.js:653`) issues LibreChat's own access/refresh tokens and cookies regardless of how the underlying identity was established. Every existing provider (Google, GitHub, Discord, Facebook, Apple, SAML, generic OpenID) is a thin instantiation of this same seam — confirmed end-to-end for Discord, including its Passport route registration, config-flag exposure, and frontend button.

Two structurally different existing "final step" patterns exist for handing a verified identity to the browser: the **OAuth-redirect pattern** (`api/server/controllers/auth/oauth.js`'s `oauthHandler` — sets cookies, does a full-page `res.redirect`, no JSON body) and the **local-login pattern** (`api/server/controllers/auth/LoginController.js` — same `setAuthTokens()` call, but responds `200 {token, user}` as JSON). Because Clerk authenticates entirely client-side and would hand the browser a token to POST to the backend (not a server-initiated redirect), the local-login pattern's `{token, user}` JSON contract is the one a new Clerk entry point would need to match on the wire — but the codebase does not have an example of a *non-redirect* provider login today; this JSON contract only currently exists for the local email/password path.

On the frontend, `AuthContext`'s `login()` (`client/src/hooks/AuthContext.tsx:170-172`) is hard-wired to fire its own local-login mutation — it does not accept an already-fetched `{token, user}` result. The only existing frontend seams that accept an externally-obtained token are `setUserContext()` (accepts `{token, user, isAuthenticated, redirect}` directly, not exported from context today) and a `tokenUpdated` window `CustomEvent` (`AuthContext.tsx:253-268`) that requires a `user` already present in memory, making it unsuitable for a first-time login.

Two backend-config toggles already exist and directly bear on "hide local login without ripping it out": `ALLOW_EMAIL_LOGIN` (`api/server/routes/config.js:24,90`) gates whether the local email/password form renders at all, and each social provider's button independently gates on that provider's own `CLIENT_ID`/`CLIENT_SECRET` env-var presence — so a Clerk-only login surface falls out of *not setting* the other providers' env vars plus `ALLOW_EMAIL_LOGIN=false`, without new frontend gating logic beyond adding a Clerk button/component itself.

No existing generic OAuth2/OIDC token-verification helper exists in `packages/api` to extend — the only real JWT/JWKS signature verification in the whole repo lives in the legacy JS strategy layer (`api/strategies/openIdJwtStrategy.js` via `jwks-rsa`+`passport-jwt`, `api/strategies/openidStrategy.js` via `openid-client`), not in the TypeScript `packages/api/src/oauth/` or `packages/api/src/auth/` modules (which handle SSRF-safe endpoint validation, Action-OAuth token exchange, and post-verification OpenID claim/issuer resolution, but never verify a token's signature themselves). A Clerk token-verification helper would be new code; `packages/api/src/crypto/` (sibling to the existing `jwt.ts`) is the structurally closest existing home, per its own barrel-export convention (`packages/api/src/index.ts:36` → `packages/api/src/crypto/index.ts`).

No prior research or historical notes on auth architecture, OAuth, OIDC, SSO, or third-party auth providers exist anywhere in `thoughts/` — the directory's 10 existing files are entirely about the BAML/Railway work from this repository's other recent sessions.

## Detailed Findings

### 1. The find-or-create seam every existing provider plugs into

- **`api/strategies/socialLogin.js:8-107`** — factory `socialLogin(provider, getProfileDetails, options)` returns a Passport verify callback `(accessToken, refreshToken, idToken, profile, cb)`.
  - **Precondition**: `getProfileDetails({idToken, profile})` must return `{email, id, avatarUrl, username, name, emailVerified}` (`:12`). `providerKey` is derived as `` `${provider}Id` `` (`:28`) and must match a real `User` schema field.
  - Domain allow-list check runs **twice** — once against `baseConfig` before lookup (`:17-26`), once against a tenant-resolved `appConfig` after lookup (`:44-56`) — both failures short-circuit with no DB write.
  - **Lookup**: `findUser({ [providerKey]: id })` first if `id` is a string (`:32-34`); on miss, `findUser({ email: email?.trim() })` (`:38`).
  - **Postcondition branches**: same-provider match → `handleExistingUser(...)` then `cb(null, existingUser)` (the **pre-lookup** lean object, not re-fetched) (`:58-60`); different-provider email collision → `cb(Error{code:AUTH_FAILED, provider:existingUser.provider})`, no write (`:61-69`); no match + `options.existingUsersOnly` → `cb(null, false, {message:'User does not exist'})` (`:71-76`, used by the `*Admin` strategy variants); no match + `ALLOW_SOCIAL_REGISTRATION` unset → `cb(Error{code:AUTH_FAILED})`, no write (`:78-87`); no match + registration allowed → `createSocialUser(...)` then `cb(null, newUser)` (`:89-100`).
  - Whole body wrapped in try/catch; any throw becomes `cb(err)` (`:101-104`).

- **`api/strategies/process.js:79-120`** — `createSocialUser({email, avatarUrl, provider, providerKey, providerId, username, name, appConfig, emailVerified})`.
  - **Precondition**: caller supplies all of the above; `email` is the only one the schema itself will reject on absence (see §5).
  - **Postcondition**: builds `update = {email, avatar:avatarUrl, provider, [providerKey]:providerId, username, name, emailVerified}` (`:90-98`), calls `createUser(update, balanceConfig)` (`:101`, from `~/models`) which returns a raw `ObjectId`. If the configured file strategy isn't `local` (`:103`), resizes/uploads an avatar and issues a follow-up `updateUser` (`:106-116`). Returns `getUserById(newUserId)` — a fresh lean read, not the doc `createUser` produced.

- **`api/strategies/discordStrategy.js`** (concrete instantiation) — `getProfileDetails` maps `profile.email/id/username/global_name` and hardcodes `emailVerified: true` (unlike Google, which reads the provider's real verified flag). `getDiscordConfig` reads `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET` and builds `callbackURL = ${DOMAIN_SERVER}${DISCORD_CALLBACK_URL}`.

### 2. The `User` schema's actual write constraints

[`packages/data-schemas/src/schema/user.ts`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/packages/data-schemas/src/schema/user.ts) (verified directly):

- **`email`** (`:36-42`) is the *only* field with `required: true` and no default — a Mongoose `ValidationError` on any create/save without it.
- `emailVerified` (`:43-47`) and `provider` (`:59-63`) are `required: true` but both have defaults (`false`, `'local'`) so omitting them at the call site is safe.
- All provider-ID fields — `googleId`, `facebookId`, `openidId`(+`openidIssuer`), `samlId`, `ldapId`, `githubId`, `discordId`, `appleId` (`:68-94`) — are plain optional `String`, no default.
- `idOnTheSource` (`:161-164`, sparse) exists as a generic external-source-identifier field "for consistency with TPrincipal schema" — not currently populated by any of the OAuth strategies read in this pass, only by the OpenID path per the earlier `openid.ts` findings.
- Indexes (`:173-201`): `{email:1, tenantId:1}` unique; `{role:1, tenantId:1}`; `{idOnTheSource:1, openidIssuer:1, tenantId:1}` (non-unique); then a loop building `{[field]:1, tenantId:1}` unique-partial (`$exists`) indexes for every provider-ID field in `oAuthIdFields` **except** `openidId`, which instead gets a compound `{openidId:1, openidIssuer:1, tenantId:1}` unique-partial index. A hypothetical `clerkId` field would need the same treatment as the simple case (single-field unique-partial index scoped by `tenantId`) to follow the established pattern.

### 3. Session/JWT issuance — the seam that stays untouched regardless of how identity was established

- **`setAuthTokens(userId, res, _session=null, req=null)`** — `api/server/services/AuthService.js:653-694` (verified directly).
  - **Precondition**: `userId` must resolve to a real, persisted `User` — `getUserById(userId)` (`:670`) feeds `generateToken(user, sessionExpiry)` (`packages/data-schemas/src/methods/user.ts:378-395`), which throws `'No user provided'` on a missing user.
  - **Postcondition**: creates or reuses a `Session` doc (`createSession`/`generateRefreshToken`, `packages/data-schemas/src/methods/session.ts`), sets `refreshToken` (httpOnly, `sameSite:strict`) and `token_provider` (`'librechat'`, same flags) cookies (`:674-685`), conditionally sets CloudFront signed cookies (`:687`), and **returns the access-token string** — it does not itself send an HTTP response.
  - Called from exactly 4 production sites, confirmed via grep: `LoginController.js:19`, `AuthController.js:274,288` (refresh flows), `TwoFactorAuthController.js:53`, `oauth.js:80` (`oauthHandler`) — plus direct unit-test invocations in `AuthService.spec.js` that exercise the function itself, not a bypass of any of those call sites.

- **`loginController`** — `api/server/controllers/auth/LoginController.js` (verified directly, full file):
  - **Precondition**: `req.user` set by prior Passport middleware; 400 if absent.
  - **Postcondition**: if `req.user.twoFactorEnabled`, responds `200 {twoFAPending:true, tempToken}` with **no** tokens issued; otherwise strips `password`/`totpSecret`/`__v`, calls `setAuthTokens(req.user._id, res, null, req)`, responds **`200 {token, user}`** — the exact JSON shape (`packages/data-provider/src/types.ts:585-590`, `TLoginResponse: {token?, user?, twoFAPending?, tempToken?}`) a JSON-response-style new provider would need to match.

- **`oauthHandler`** — `createOAuthHandler(redirectUri)` in `api/server/controllers/auth/oauth.js:20-28`, mounted after `passport.authenticate('<provider>', {session:false})` on every `/api/oauth/<provider>/callback` route.
  - **Precondition**: `req.user` already a persisted `User` doc (set by the strategy's verify callback).
  - **Postcondition**: either the admin-exchange-code branch (mints a JWT + one-time code, redirects with `?code=...`, no cookies) or the standard branch — `setAuthTokens(req.user._id, res, null, req)` then an **unconditional `res.redirect(redirectUri)`** — no JSON body ever returned on this path.

- Production mounts (grep-confirmed): `app.use('/api/auth', preAuthTenantMiddleware, routes.auth)` (`api/server/index.js:272`) and `app.use('/oauth', preAuthTenantMiddleware, routes.oauth)` (`api/server/index.js:270`).

### 4. `requireJwtAuth` — unaffected by how a session started

`api/server/middleware/requireJwtAuth.js` (verified directly, full file) enforces `Authorization: Bearer <JWT>` signed with `JWT_SECRET` via the `jwt` Passport strategy (or `['openidJwt','jwt']` fallback gated by a `token_provider` cookie + `OPENID_REUSE_TOKENS`). Postcondition: `req.user` set to the strategy result, then chained into `tenantContextMiddleware`. This middleware only ever sees LibreChat's own issued JWTs — a Clerk-originated session becomes indistinguishable from any other session the moment `setAuthTokens` hands back a token, so this file has no dependency on which provider produced the original identity.

### 5. Config-flag exposure pattern (backend → frontend)

`api/server/routes/config.js`, `buildPreLoginPayload()` (verified directly, `:55-111`):

- Each OAuth-style flag is a presence check on that provider's env vars, e.g. `discordLoginEnabled: !!process.env.DISCORD_CLIENT_ID && !!process.env.DISCORD_CLIENT_SECRET` (`:73`), recomputed fresh on every `GET /api/config` request (no caching of this payload itself, though the underlying `librechat.yaml`-derived app config *is* cached — see below).
- **`emailLoginEnabled`** (`:23-24,90`): `process.env.ALLOW_EMAIL_LOGIN === undefined || isEnabled(process.env.ALLOW_EMAIL_LOGIN)` — defaults to enabled, but `ALLOW_EMAIL_LOGIN=false` flips it off. This is the existing, ready-made toggle for hiding the local email/password form.
- **`socialLoginEnabled`** (`:92`): `isEnabled(process.env.ALLOW_SOCIAL_LOGIN)` — the master switch `SocialLoginRender` checks before rendering *any* social button (per prior sub-agent pass, `SocialLoginRender.tsx:120-138`).
- `librechat.yaml`'s `registration.socialLogins` array (`librechat.example.yaml:239`, schema at `packages/data-provider/src/config.ts:2144-2149`, default list at `config.ts:21`) is a separate allow-list consumed alongside the per-provider `*LoginEnabled` flags — a provider button only renders if *both* its own flag is true *and* its name appears in this array. This YAML-derived app config is cached indefinitely after first load (`packages/api/src/app/service.ts:119-232`, `ensureBaseConfig`) and only invalidated by explicit admin-config-mutation calls, not hot-reloaded per request.
- Frontend type: `TStartupConfig` (`packages/data-provider/src/config.ts:1565-1580`) declares each `*LoginEnabled` flag as a non-optional `boolean` — a new `clerkLoginEnabled` field would need adding here.

### 6. TypeScript backend (`packages/api`) — what already exists vs. what's missing

- `packages/api/src/oauth/` (`validation.ts`, `tokens.ts`, `callback.ts`, `csrf.ts`, `failure.ts`) is entirely **Action-OAuth and OpenID-callback plumbing** — SSRF-safe URL validation, a generic authorization-code/refresh-token *exchange* client (no signature verification), CSRF/session cookie helpers for the redirect dance, and Passport error-log normalization. None of it verifies a token's signature or claims.
- `packages/api/src/auth/openid.ts` is the TS home for **post-verification** OpenID user resolution (`findOpenIDUser`, `getOpenIdEmail`, `normalizeOpenIdIssuer`, `isUserIssuerAllowed`) — consumed directly by the legacy `openidStrategy.js`/`openIdJwtStrategy.js` via `require('@librechat/api')`. It does not perform the JWT/JWKS verification itself.
- The actual signature verification for OpenID tokens lives entirely in the JS strategy layer: `openIdJwtStrategy.js` (`jwks-rsa` + `passport-jwt`) and `openidStrategy.js` (`openid-client`) — outside `packages/api` entirely.
- **No generic, provider-agnostic "verify this third-party JWT" helper exists in `packages/api` today.** The closest structural sibling for a new one is `packages/api/src/crypto/jwt.ts` (same directory, same "small framework-agnostic crypto helper" shape) — confirmed via `packages/api/src/index.ts:36` (`export * from './crypto'`) and `packages/api/src/crypto/index.ts` re-exporting `jwt.ts`; a new module must be added to that local `index.ts` to become consumable from `/api` via `require('@librechat/api')`.
- Every subdirectory under `packages/api/src/` used by the legacy JS auth layer was confirmed as production-called (not test-only/dead) via direct `require('@librechat/api')` grep: `oauth/tokens.ts` ← `ActionService.js`/action routes; `oauth/callback.ts`+`failure.ts` ← `routes/oauth.js`; `oauth/csrf.ts` ← `routes/mcp.js`/`routes/actions.js`/`socialLogins.js`/`AuthService.js`; `auth/openid.ts` ← `openidStrategy.js`/`openIdJwtStrategy.js`/`AuthController.js`; `auth/password.ts` (`comparePassword`) ← `localStrategy.js`; `auth/domain.ts` ← four strategy files plus several services/middleware.

### 7. Frontend auth context — the contract a new login path must satisfy

`client/src/hooks/AuthContext.tsx` (verified directly, `:40-312`):

- **`login(data: TLoginUser)`** (`:170-172`) is *not* a generic "accept a login result" function — it calls `loginUser.mutate(data)`, i.e. it always performs its own POST to `/api/auth/login`. A Clerk-originated `{token, user}` cannot be handed to `login()`.
- **`setUserContext`** (`:70-100`, `lodash.debounce` 50ms) is the actual state-transition function: takes `{token, isAuthenticated, user, redirect?}`, calls `setUser`/`setToken`/`setTokenHeader(token)`/`setIsAuthenticated`, flips on `queriesEnabled` if authenticating, and conditionally navigates. It is defined inside `AuthContextProvider` and **not currently exposed** on the context value (`memoedValue`, `:270-297` only exposes `user, token, error, login, logout, setError, roles, isAuthenticated`).
- The existing `loginUser` mutation's `onSuccess` (`:103-112`) is the concrete precedent for how a login result reaches `setUserContext`: destructure `{user, token, twoFAPending, tempToken}`, branch on `twoFAPending`, else `setUserContext({token, isAuthenticated:true, user, redirect:'/c/new'})`.
- A `tokenUpdated` window `CustomEvent` listener (`:253-268`) also calls `setUserContext({token: event.detail, isAuthenticated:true, user})`, but reads `user` from the *current* closure — this exists for silent-refresh token rotation (dispatched by `packages/data-provider/src/request.ts`'s response interceptor, `dispatchTokenUpdatedEvent`), and is unsuitable for a first-time login since no `user` is yet in memory.
- `silentRefresh()` (`:174-222`) runs on mount whenever `token == null || !isAuthenticated` and POSTs `/api/auth/refresh`; on success it calls the same `setUserContext` pattern; on failure it navigates to the login page. This is the mechanism that picks up a session after an OAuth-redirect-style login (where the browser never directly received `{token, user}` in JS), relying on the httpOnly `refreshToken` cookie `setAuthTokens` already set.

### 8. Frontend login page composition

- `client/src/components/Auth/AuthLayout.tsx:87-90` wraps the route's `children` (ultimately `Login.tsx`) and conditionally renders `<SocialLoginRender startupConfig={startupConfig} />` after it, gated on the current pathname including `login`/`register` but not `2fa`.
- `Login.tsx:104-111` renders `<LoginForm onSubmit={login} .../>` only if `startupConfig?.emailLoginEnabled === true`; `login` here is `AuthContext`'s function, passed by reference, called by `LoginForm`'s submit handler with the raw `{email, password}` form values.
- `SocialLoginRender.tsx` (per earlier sub-agent pass, cross-checked against the Discord walkthrough) maps `startupConfig.socialLogins` (the YAML allow-list array) through a `providerComponents` object keyed by provider name, each short-circuited on that provider's own `*LoginEnabled` boolean; unlisted or disabled providers render nothing.
- `SocialButton.tsx` (existing providers) is a bare `<a href="${serverDomain}/oauth/${oauthPath}">` — clicking it does a full browser navigation into the server-redirect OAuth dance. There is no existing example of a button that instead runs client-side JS (fetch/XHR) before talking to the backend, which is what a Clerk sign-in component would need to do differently from every current social button.

### 9. Complete existing template: Discord, end to end

Verified as a single connected chain (`api/server/routes/oauth.js:158-177` → `api/strategies/discordStrategy.js` → `api/server/socialLogins.js:93-96` conditional `passport.use()` registration → `.env.example:689-692` env vars → `api/server/routes/config.js:73` flag → `client/src/components/Auth/SocialLoginRender.tsx:28-39` button → `librechat.example.yaml:239` allow-list entry). Every gate (Passport registration, config flag, YAML list membership) keys off the same `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET` presence check, duplicated independently in `socialLogins.js:93` and `config.js:73` rather than computed once and shared.

## Code References

- [`api/strategies/socialLogin.js#L8-L107`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/api/strategies/socialLogin.js#L8-L107) — shared find-or-create Passport verify-callback factory
- [`api/strategies/process.js#L79-L120`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/api/strategies/process.js#L79-L120) — `createSocialUser`
- [`api/strategies/discordStrategy.js`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/api/strategies/discordStrategy.js) — concrete provider wiring example
- [`api/strategies/googleStrategy.js`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/api/strategies/googleStrategy.js) — concrete provider wiring example (real `emailVerified` from provider, vs. Discord's hardcoded `true`)
- [`packages/data-schemas/src/schema/user.ts#L36-L42`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/packages/data-schemas/src/schema/user.ts#L36-L42), [`#L59-L63`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/packages/data-schemas/src/schema/user.ts#L59-L63), [`#L68-L94`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/packages/data-schemas/src/schema/user.ts#L68-L94), [`#L173-L201`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/packages/data-schemas/src/schema/user.ts#L173-L201) — `User` schema required fields and per-provider unique-partial indexes
- [`packages/data-schemas/src/methods/user.ts#L151-L162`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/packages/data-schemas/src/methods/user.ts#L151-L162), [`#L198-L256`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/packages/data-schemas/src/methods/user.ts#L198-L256) — `findUser`, `createUser`
- [`api/server/services/AuthService.js#L653-L694`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/api/server/services/AuthService.js#L653-L694) — `setAuthTokens`
- [`api/server/controllers/auth/LoginController.js`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/api/server/controllers/auth/LoginController.js) — JSON-response login contract (`{token, user}`)
- [`api/server/controllers/auth/oauth.js#L20-L85`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/api/server/controllers/auth/oauth.js#L20-L85) — redirect-response OAuth callback contract
- [`api/server/middleware/requireJwtAuth.js`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/api/server/middleware/requireJwtAuth.js) — post-login protected-route middleware (provider-agnostic)
- [`api/server/routes/config.js#L23-L24`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/api/server/routes/config.js#L23-L24), [`#L55-L111`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/api/server/routes/config.js#L55-L111) — `emailLoginEnabled`/`socialLoginEnabled`/per-provider flag computation
- [`api/server/routes/oauth.js#L158-L177`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/api/server/routes/oauth.js#L158-L177) — Discord route registration, template for route wiring
- [`api/server/index.js#L270`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/api/server/index.js#L270), [`#L272`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/api/server/index.js#L272) — production mount points for `/oauth` and `/api/auth`
- [`packages/api/src/index.ts#L8`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/packages/api/src/index.ts#L8), [`#L33`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/packages/api/src/index.ts#L33), [`#L36`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/packages/api/src/index.ts#L36) — barrel exports for `auth`, `oauth`, `crypto`
- [`packages/api/src/crypto/jwt.ts`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/packages/api/src/crypto/jwt.ts) — closest existing sibling for a new token-verification helper
- [`packages/api/src/auth/openid.ts`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/packages/api/src/auth/openid.ts) — post-verification OpenID claim/issuer resolution (pattern reference, not reusable verifier)
- [`client/src/hooks/AuthContext.tsx#L70-L100`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/client/src/hooks/AuthContext.tsx#L70-L100), [`#L103-L126`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/client/src/hooks/AuthContext.tsx#L103-L126), [`#L170-L172`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/client/src/hooks/AuthContext.tsx#L170-L172), [`#L253-L268`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/client/src/hooks/AuthContext.tsx#L253-L268) — `setUserContext`, `loginUser` mutation `onSuccess`, `login`, `tokenUpdated` listener
- [`client/src/data-provider/Auth/mutations.ts#L32-L56`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/client/src/data-provider/Auth/mutations.ts#L32-L56) — `useLoginUserMutation` (request/response shape template)
- [`packages/data-provider/src/types.ts#L578-L583`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/packages/data-provider/src/types.ts#L578-L583), [`#L585-L590`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/packages/data-provider/src/types.ts#L585-L590) — `TLoginUser`, `TLoginResponse`
- [`packages/data-provider/src/headers-helpers.ts#L7-L13`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/packages/data-provider/src/headers-helpers.ts#L7-L13) — `setTokenHeader`
- [`packages/data-provider/src/request.ts#L238-L295`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/packages/data-provider/src/request.ts#L238-L295), [`#L339-L416`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/packages/data-provider/src/request.ts#L339-L416) — refresh-before-request and 401-recovery interceptors
- [`client/src/routes/Root.tsx#L46`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/client/src/routes/Root.tsx#L46), [`#L76-L78`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/client/src/routes/Root.tsx#L76-L78) — `isAuthenticated` render gate
- [`client/src/components/Auth/AuthLayout.tsx#L87-L90`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/client/src/components/Auth/AuthLayout.tsx#L87-L90), [`Login.tsx#L104-L111`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/client/src/components/Auth/Login.tsx#L104-L111), [`SocialLoginRender.tsx`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/client/src/components/Auth/SocialLoginRender.tsx) — login-page composition and button gating
- [`packages/data-provider/src/config.ts#L21`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/packages/data-provider/src/config.ts#L21), [`#L1565-L1580`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/packages/data-provider/src/config.ts#L1565-L1580), [`#L2144-L2149`](https://github.com/tha-hammer/silmari-chat/blob/cc84c390a6debcf51e10f904ab6512630c48a056/packages/data-provider/src/config.ts#L2144-L2149) — `defaultSocialLogins`, `TStartupConfig`, `registration` YAML schema

## Architecture Documentation

- **Provider-agnostic identity, provider-specific lookup key**: the `User` document's identity is always resolved by a `provider` string plus one dedicated `<provider>Id` field; `email` is the only field the schema itself requires, making it the universal fallback lookup key across every strategy.
- **Session issuance is fully decoupled from identity establishment**: `setAuthTokens` takes only a `userId` — it has no awareness of *how* that user was authenticated. Every provider, once it has a persisted `User._id`, converges on the same function.
- **Two disjoint response contracts already coexist** for "a login just succeeded": a full-page-redirect contract (OAuth providers, cookies-only, browser picks up the session via `silentRefresh` on next mount) and a JSON-body contract (local email/password, `{token, user}` returned synchronously to the calling mutation). No current provider uses a third shape (client-side-obtained-token-POSTed-to-backend).
- **Config-flag computation is duplicated per gate, not centralized**: whether a provider is "enabled" is independently recomputed in at least three places for every existing provider (Passport registration guard in `socialLogins.js`, `*LoginEnabled` flag in `config.js`, and the provider's inclusion in the `socialLogins` YAML array) — there is no single source of truth function called from all three.
- **The YAML-derived app config is a long-lived in-memory cache**, invalidated only by explicit admin mutations — env vars, by contrast, are read fresh on every `/api/config` request.

## Workflow Closure Map

The research question is interface/seam-shaped rather than a single existing behavior, but the **local email/password login** chain is the closest existing production behavior to the JSON-response contract a Clerk entry point would need, and is mapped here as the concrete template.

```
browser submits LoginForm
  -> POST /api/auth/login  (api/server/routes/auth.js, mounted at api/server/index.js:272)
  -> passport 'local' strategy verifies credentials (api/strategies/localStrategy.js)
  -> loginController (api/server/controllers/auth/LoginController.js:5-26)
       -> setAuthTokens(req.user._id, res, null, req)  (api/server/services/AuthService.js:653-694)
            -> createSession / generateRefreshToken  (packages/data-schemas/src/methods/session.ts)
            -> res.cookie('refreshToken', ...), res.cookie('token_provider', 'librechat', ...)
       -> res.status(200).send({ token, user })
  -> client: useLoginUserMutation onSuccess (client/src/hooks/AuthContext.tsx:103-112)
       -> setUserContext({ token, isAuthenticated: true, user, redirect: '/c/new' })
  -> isAuthenticated flips true -> client/src/routes/Root.tsx:76-78 renders the authenticated shell
```

| Node | file:line | Production-called? |
|---|---|---|
| Route registration | `api/server/index.js:272` (`app.use('/api/auth', ...)`) | production-called (grep-confirmed, only mount) |
| `loginController` | `api/server/controllers/auth/LoginController.js:5` | production-called via `api/server/routes/auth.js` |
| `setAuthTokens` | `api/server/services/AuthService.js:653` | production-called from 4 sites (`LoginController.js:19`, `AuthController.js:274,288`, `TwoFactorAuthController.js:53`, `oauth.js:80`); also directly unit-tested in `AuthService.spec.js` (tests the function itself, not a bypass of the listed call sites) |
| `useLoginUserMutation` | `client/src/data-provider/Auth/mutations.ts:32` | production-called from `AuthContext.tsx:103` |
| `setUserContext` | `client/src/hooks/AuthContext.tsx:70` | production-called from `loginUser.onSuccess` (`:111`), `logoutUser` handlers (`:139,148`), `silentRefresh` (`:201`), and the `tokenUpdated` listener (`:256`) |
| Observable result | `client/src/routes/Root.tsx:76-78` (`isAuthenticated` gate) | production-called (route tree root) |

**Depths / highest touched node for a hypothetical Clerk addition**: a new entry point would add a new *first* node (a `POST /api/auth/clerk` route + controller) feeding into the **existing, unchanged** `setAuthTokens` node — i.e. the highest node such a change would touch is the route/controller layer; `setAuthTokens` downstream through `Root.tsx` stays exactly as-is. On the frontend, the highest node a Clerk mutation would need to reach is `setUserContext` — but `setUserContext` is not currently exported from `AuthContext`'s public value, only its `loginUser.onSuccess` call site is (a real gap between "what exists" and "what a new caller needs," documented factually here, not prescribed).

**Error behavior observed**: every error branch in `socialLogin.js` (domain-not-allowed, provider-collision, registration-disabled) short-circuits the Passport `cb(err)` before any DB write — none of them are silent/swallowed; they surface as Passport authentication failures, which `requireJwtAuth`/route-level `passport.authenticate` callers turn into HTTP error responses.

Structured `ClosureMap` (JSON) and staged closure-adapter scaffold were intentionally **not emitted** for this map: the `apps/closure-oracle/` apparatus and `references/closure-test-framework.md` these outputs are meant to feed do not exist anywhere in this repository (confirmed absent by direct filesystem search) or in the `SAI_DIR` skills tree consulted for the citation-verification/closure-mapping scripts referenced by the research workflow. Emitting a JSON block or an adapter file pointed at infrastructure that isn't present here would document something that doesn't exist rather than the repository's actual current state.

## Historical Context (from thoughts/)

None. `thoughts/` contains 10 files total, all related to the BAML/Railway deployment work from other recent sessions in this repository (`thoughts/shared/handoffs/general/*baml*`, `thoughts/shared/research/*baml*`, `thoughts/shared/plans/*baml*`). No document anywhere in the tree mentions authentication architecture, OAuth, OIDC/SSO, JWT/session design, or any third-party auth provider (Clerk, Auth0, SuperTokens, or otherwise).

## Related Research

None found.

## Open Questions

These are gaps in the current codebase relative to the shape of the question asked (preconditions/postconditions needed), not proposed answers:

- The codebase has two disjoint "login succeeded" response contracts (redirect-based vs. JSON-based) and no example of a third, client-side-token-POST contract — which existing contract a new entry point should structurally resemble is not determined by anything in the code today.
- `setUserContext` (the actual state-transition function a new login path needs) is not currently exposed on `AuthContext`'s public value — only reachable today via the existing `loginUser` mutation's `onSuccess` closure or the `tokenUpdated` event (which requires a pre-existing `user`in memory).
- No generic third-party JWT/JWKS verification helper exists in `packages/api` — the two structurally closest existing homes (`packages/api/src/crypto/`, sibling to `jwt.ts`; `packages/api/src/oauth/`, sibling to `validation.ts`/`tokens.ts`) each match a different framing of what such a helper is (a crypto primitive vs. an OAuth-flow component), and the codebase's existing pattern doesn't resolve which framing fits a new provider whose SDK (unlike every current provider) would likely own its own verification logic.
- The `oAuthIdFields` unique-index loop in `packages/data-schemas/src/schema/user.ts:177-201` is a fixed array — a new provider-ID field is not picked up automatically; nothing in the schema file is a registry a new provider self-registers into.
