# Clerk Authentication Integration — Revised TDD Implementation Plan

**Status:** implementation-ready; backend, frontend, and lifecycle re-audits clean  
**Updated:** 2026-08-12  
**Tracking:** Beads issue `AF-dao4`  
**Source research:** `thoughts/searchable/shared/research/2026-08-12-18-21-clerk-auth-integration-seams.md`  
**Review incorporated:** `thoughts/searchable/shared/plans/2026-08-12-20-05-tdd-clerk-auth-integration-REVIEW.md`

## Outcome

Add Clerk as an optional browser identity provider while preserving LibreChat as the authorization and session authority. A Clerk session token establishes an external identity; a tenant-scoped LibreChat `User`, `Session`, access JWT, refresh cookie, ban policy, balance policy, registration policy, and optional local 2FA still determine application access.

The feature is complete only when the browser actually performs `getToken() -> POST /api/auth/clerk -> setUserContext`, a real mounted route persists the correct user and session records, Clerk lifecycle events revoke correlated LibreChat sessions, and all enabled deployments create and verify the required production indexes before becoming ready.

## Corrections Locked by the Review

These are implementation contracts, not optional refinements:

- All new backend identity, policy-orchestration, verification, and handler code is TypeScript under `packages/api/src/auth/clerk/`. Legacy `api/` files are thin composition adapters or minimal extensions to existing session/2FA code. No Clerk business logic is added to `api/strategies/process.js` or a new JavaScript controller.
- A default Clerk session token is not treated as an email source. It supplies `sub`, `sid`, `jti`, `azp`, `sts`, and timing/issuer claims. On a local `clerkId` miss, the backend fetches the Clerk Backend User and requires its primary email address to be explicitly verified before any email-based link or create.
- Token verification uses the configured PEM `CLERK_JWT_KEY`, rejects a missing or disallowed `azp`, rejects `sts === 'pending'`, and does not invent an `aud` requirement that default Clerk session tokens do not provide. `CLERK_AUTHORIZED_PARTIES` is mandatory.
- Linking is a conditional, atomic, tenant-scoped data-schema operation. It never overwrites `provider`, never accepts a different Clerk subject for an already-linked email, and always invalidates the auth user-document cache after a mutation.
- A missing tenant means an explicit legacy tenantless predicate `{ tenantId: { $exists: false } }`; it never means an unscoped lookup.
- `clerkId` is internal, immutable through public/user-update APIs, and omitted from every public serializer, MCP environment projection, and client `TUser`. A Clerk deletion tombstones the binding rather than silently making the email eligible for a different subject.
- `MONGO_AUTO_INDEX=false` is supported. Enabled startup performs targeted, awaited User and Session index assurance and fails readiness on a duplicate preflight, an incompatible existing index, or index-creation failure. It never calls `syncIndexes()` in production.
- `checkBan` must see the resolved existing `req.user` before any link/create/session write. Domain and registration policy use the resolved app configuration. `setBalanceConfig` runs only after `req.user` is final.
- Existing local 2FA remains mandatory for linked users. The signed 2FA temporary token carries only trusted Clerk correlation claims, never the original Clerk token.
- Every Clerk token ID (`jti`) is exchangeable for at most one LibreChat Session per tenant. A durable consumed-token claim outlives Session deletion/rollback until every token or 2FA capability carrying that `jti` has expired, and a durable revoked-`sid` fence blocks exchanges even when the webhook arrives before login. A replay is `409 CLERK_TOKEN_REPLAYED`; the client may obtain one uncached token and retry once.
- Clerk-derived LibreChat sessions have an absolute lifetime of `min(SESSION_EXPIRY, 15 minutes from issuance)`. Refresh cannot extend that deadline. Verified Clerk webhooks revoke sessions sooner; the short ceiling bounds missed or delayed webhooks.
- Logout attempts both local and Clerk sign-out, and Clerk `session.ended`, `session.revoked`, and `user.deleted` webhooks terminate correlated local sessions.
- The UI uses current `@clerk/react`, is visible independently of generic `socialLoginEnabled`, and does not navigate to the final application destination until LibreChat authentication succeeds. Clerk may return an external flow only to the `/login` bridge. It does not use deprecated `afterSignInUrl` or the old `@clerk/clerk-react` package.
- HTTP errors are stable codes, never raw exceptions. The implementation compares enum members, not the incorrect uppercase literal `'AUTH_FAILED'`, and public user responses are allowlisted so `refreshToken`, `clerkId`, tombstone state, and other internal fields cannot leak.

## Current-State Constraints

- `packages/api` builds CommonJS and externalizes third-party packages. Therefore `@clerk/backend` must be available both while the package builds/tests and at runtime in `api`.
- `preAuthTenant` establishes async-local tenant scope before `/api/auth`, but the new identity methods also encode tenant predicates explicitly so a missing or broken ambient scope cannot broaden a query.
- `updateUser` already invalidates the auth user-document cache. New conditional and bulk Clerk mutations must preserve that behavior themselves because they cannot safely be assembled from a read followed by generic `updateUser`.
- Existing `setAuthTokens` creates a Session before it sets cookies/JWTs, while refresh currently permits a multi-day lifetime. The Clerk path needs correlation fields, an absolute expiry cap, and rollback on a late response/JWT failure.
- Existing Login stores and validates the final redirect through `sessionStorage` and `isSafeRedirect`. Clerk must reuse that path; Clerk's return URL is only the base-aware `/login` bridge page.
- Automatic index creation may be disabled in production. A schema declaration and `syncIndexes()` test are not a rollout strategy.

## Scope

Included:

- fail-closed Clerk startup configuration and public startup-config projection;
- verified Clerk token and authoritative Backend User normalization;
- tenant-safe lookup, atomic linking, user creation race convergence, deletion tombstones, and auth-cache invalidation;
- correlated Session storage, replay defense, absolute lifetime, local 2FA preservation, logout, and webhook revocation;
- strict shared API types, endpoint/service/mutation/context contracts;
- a current Clerk React provider, sign-in modal, browser exchange bridge, safe redirects, localization, and accessibility;
- real-Mongo data tests, package contract tests, mounted-route closure tests, and a client integration closure.

Excluded:

- disabling `POST /api/auth/login`; `ALLOW_EMAIL_LOGIN=false` remains a UI decision;
- replacing LibreChat authorization, access JWTs, refresh cookies, balance logic, or local 2FA with Clerk equivalents;
- automatic profile synchronization on `user.updated`;
- automatic reassignment of a deleted Clerk identity to another subject;
- destructive deletion of the LibreChat User or its conversations when Clerk deletes a user;
- adding Clerk to generic OpenID or `socialLogins` YAML configuration.

## Fixed Contracts

### 1. Startup configuration

When Clerk is enabled, all five values are required after trimming:

- `CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_JWT_KEY`
- `CLERK_AUTHORIZED_PARTIES`
- `CLERK_WEBHOOK_SIGNING_SECRET`

`CLERK_AUTHORIZED_PARTIES` is a comma-separated list of normalized origins. Reject credentials, wildcards, paths, queries, fragments, and invalid URLs. Require HTTPS outside development; allow HTTP only for loopback development origins. Deduplicate origins.

`resolveClerkAuthConfig(env)` returns one discriminated union:

```ts
type ClerkAuthConfig =
  | { enabled: false }
  | {
      enabled: true;
      publishableKey: string;
      secretKey: string;
      jwtKey: string;
      authorizedParties: readonly string[];
      webhookSigningSecret: string;
    };
```

Partial or malformed configuration throws a redacted startup configuration error. Only `enabled` and `publishableKey` may enter `GET /api/config`; secrets, authorized parties, and verification keys are server-only. Both public config and route composition consume this same resolved object.

Use exact dependency versions validated during the review:

- `@clerk/backend@3.16.4`: peer and dev dependency in `packages/api`; runtime dependency in `api`;
- `@clerk/react@6.14.1`: runtime dependency in `client`;
- `@clerk/localizations@4.15.1`: runtime dependency in `client` for the Clerk modal's supported locale mapping.

### 2. Token and profile normalization

`verifyClerkSessionToken(token, config)` uses `@clerk/backend`'s `verifyToken` with `jwtKey`, `authorizedParties`, and the named clock-skew policy. It then performs explicit runtime validation:

- `sub`, `sid`, `jti`, and `azp` are non-empty strings;
- `azp` equals a normalized allowed origin;
- `sts` is absent or not `pending`;
- numeric `iat` and `exp` are present, ordered, and span no more than `MAX_CLERK_TOKEN_LIFETIME_MS = 15 minutes`; `CLERK_CLOCK_SKEW_MS` is one named small tolerance shared by verification and claim retention;
- issuer and temporal claims passed SDK verification;
- no email or verification status is read from the session token;
- no `audience` option is configured unless a future custom token template explicitly adds that contract.

On a tenant-scoped `clerkId` hit, use the stored User email and do not call Clerk's User API. On a miss, call `GET https://api.clerk.com/v1/users/:sub` with `Authorization: Bearer <secret>`, `Clerk-API-Version: 2026-05-12`, an encoded subject path segment, and `CLERK_PROFILE_TIMEOUT_MS = 5_000` through an abortable transport. Narrow the JSON at runtime, select `primaryEmailAddressId`, and require the selected EmailAddress verification status to be explicitly `verified`. Normalize email using the same lowercase/trim rules as the User schema. A well-formed User without an explicitly verified primary email is a forbidden identity, not a create candidate; malformed/incompatible upstream JSON is an unavailable upstream.

Map upstream timeout/5xx/network/malformed-response failures to `503 CLERK_UNAVAILABLE`, upstream 429 to `429 CLERK_UPSTREAM_RATE_LIMITED`, an absent/deleted profile subject to `401 CLERK_TOKEN_INVALID`, and a well-formed profile without a verified primary email to `403 CLERK_LOGIN_FORBIDDEN`. Log no token, secret, or full email.

The normalized identity is:

```ts
interface VerifiedClerkIdentity {
  clerkId: string;
  clerkSessionId: string;
  clerkTokenId: string;
  authorizedParty: string;
  tokenIssuedAt: Date;
  tokenExpiresAt: Date;
  email?: string; // present only after authoritative profile verification
  emailVerified?: true;
  name?: string;
  username?: string;
  avatarUrl?: string;
}
```

### 3. Tenant and account-link state machine

All User reads use this exact scope:

```ts
const tenantScope = tenantId ? { tenantId } : { tenantId: { $exists: false } };
```

Resolve named values `userByClerkId` and, only after an authoritative verified profile, `userByEmail`. Use flat, exhaustive branches:

| `userByClerkId` | `userByEmail`                                    | Result                                                               |
| --------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| same user       | deliberately not loaded                          | Authenticate unless tombstoned; enforce domain with the stored email |
| none            | email user with same `clerkId`                   | Authenticate (race convergence)                                      |
| none            | email user with another `clerkId`                | `409 CLERK_IDENTITY_CONFLICT`; no write                              |
| none            | tombstoned email user                            | `409 CLERK_IDENTITY_CONFLICT`; no write                              |
| none            | unlinked email user and `emailVerified === true` | Atomically claim `clerkId`; preserve `provider`                      |
| none            | no email user and `emailVerified === true`       | Create a Clerk-origin User; converge duplicate races                 |
| none            | no authoritative verified email                  | `403 CLERK_LOGIN_FORBIDDEN`; no write                                |

Do not special-case `provider === 'clerk'`. Subject identity is `clerkId`, not provider plus email. Existing linked accounts retain their current provider and local-password/2FA semantics. Only brand-new users are created with `provider: 'clerk'`.

The only linker is a data-schema method:

```ts
type LinkClerkIdentityResult =
  | { status: 'linked'; user: IUser }
  | { status: 'already_linked'; user: IUser }
  | { status: 'conflict' }
  | { status: 'not_found' };

linkClerkIdentity({ userId, clerkId, tenantId }): Promise<LinkClerkIdentityResult>;
```

It uses one conditional update that matches `_id`, the exact tenant scope, absent `clerkId`, and absent `clerkDeletedAt`. It sets only `clerkId`; it never sets `provider`. On zero matches or `E11000`, it re-reads both subject and target by explicit tenant scope and maps deterministically to `already_linked`, `conflict`, or `not_found`. It invalidates the affected auth user-document cache after a successful write and after any converged write whose cached value could be stale.

Creation reuses an injected existing `createSocialUser` adapter only after policies pass. The adapter accepts an optional avatar URL and skips avatar retrieval when it is missing or invalid; a profile without an image is still creatable. Avatar retrieval/resize/storage is best effort after User creation: a valid URL failure is logged without the URL and returns the created User without an avatar rather than failing authentication or leaving an ambiguous response. `E11000` converges by re-reading tenant-scoped subject and email, never by retrying an unbounded create.

### 4. Stored User fields and exposure

Add to the canonical internal User model contract:

```ts
clerkId?: string;
clerkDeletedAt?: Date;
```

Reject `null`, empty, and whitespace-only `clerkId`. Add both fields to `IUser`; add `clerkId` to `UserFilterOptions` and both hand-written full-user result types in `packages/data-schemas/src/methods/user.ts`. Keep `clerkDeletedAt` `select: false` and include it only through an explicit identity/tombstone projection and result type. Narrow generic `updateUser` to `Omit<Partial<IUser>, 'clerkId' | 'clerkDeletedAt'>` and reject both keys at runtime for legacy JavaScript callers. Only the dedicated link/tombstone methods may mutate them; tests cover typed and runtime rejection.

Extract the existing `UserController` public allowlist into `packages/api/src/auth/user.ts`. Clerk responses and 2FA completion use this shared serializer. Keep `clerkId`, `clerkDeletedAt`, password/hash data, refresh tokens, reset tokens, MFA secrets, and other internal fields out. Do not add Clerk fields to `packages/api/src/utils/env.ts`'s MCP projection or the client `TUser`.

`user.deleted` does not unset `clerkId`. It atomically sets `clerkDeletedAt`, deletes every correlated Clerk Session, preserves `provider` and local data, and invalidates every affected auth-cache key. Login by that subject and future same-email/different-sub linking both fail closed. Relink/unlink requires a future explicit audited administrator workflow and is not exposed here.

### 5. Production indexes

Add a global `ClerkAuthClaim` model that does not use ambient tenant middleware and implements this exact discriminated union:

- `{ kind: 'consumed_token'; tenantScope; clerkTokenId; sourceClerkSessionId; sourceClerkUserId; expiration }`;
- `{ kind: 'session_state'; clerkSessionId; state: 'active'; revokedAt?: never; expiration }` or `{ kind: 'session_state'; clerkSessionId; state: 'revoked'; revokedAt: Date; expiration }`;
- `{ kind: 'user_state'; clerkUserId; state: 'active'; deletedAt?: never; expiration }` or `{ kind: 'user_state'; clerkUserId; state: 'deleted'; deletedAt: Date; expiration }`.

The consumed-token expiration is the accepted credential expiry plus clock skew. A 2FA capability lasts `min(original token remaining, MAX_CLERK_2FA_CAPABILITY_LIFETIME_MS = 5 minutes)`, so it never outlives the token. A revoked/deleted state expires no earlier than the event plus `MAX_CLERK_TOKEN_LIFETIME_MS + CLERK_CLOCK_SKEW_MS`; an active state is extended through the latest accepted token expiration. Discriminated validation forbids fields from other shapes and all partial, null, empty, or whitespace values. TTL cleanup occurs only after every credential represented by the state can no longer be accepted.

Declare and assure these exactly named indexes:

| Collection     | Key                                   | Options                                                                                 |
| -------------- | ------------------------------------- | --------------------------------------------------------------------------------------- |
| User           | `{ clerkId: 1, tenantId: 1 }`         | name `clerkId_1_tenantId_1`, unique, partial `{ clerkId: { $exists: true } }`           |
| Session        | `{ clerkTokenId: 1, tenantId: 1 }`    | name `clerkTokenId_1_tenantId_1`, unique, partial `{ clerkTokenId: { $exists: true } }` |
| Session        | `{ clerkSessionId: 1, tenantId: 1 }`  | name `clerkSessionId_1_tenantId_1`, partial `{ clerkSessionId: { $exists: true } }`     |
| Session        | `{ clerkUserId: 1, tenantId: 1 }`     | name `clerkUserId_1_tenantId_1`, partial `{ clerkUserId: { $exists: true } }`           |
| ClerkAuthClaim | `{ tenantScope: 1, clerkTokenId: 1 }` | name `tenantScope_1_clerkTokenId_1`, unique, partial `{ kind: 'consumed_token' }`       |
| ClerkAuthClaim | `{ clerkSessionId: 1 }`               | name `clerkSessionId_1`, unique, partial `{ kind: 'session_state' }`                    |
| ClerkAuthClaim | `{ clerkUserId: 1 }`                  | name `clerkUserId_1`, unique, partial `{ kind: 'user_state' }`                          |
| ClerkAuthClaim | `{ expiration: 1 }`                   | name `expiration_1`, `expireAfterSeconds: 0`                                            |

`ensureClerkIndexes(connection)`:

1. fails preflight on every present null/empty/whitespace Clerk User, Session, or claim field and scans for duplicate valid values using the exact key scopes, reporting only redacted IDs/counts;
2. examines existing index key order and options, failing on an incompatible same-name or equivalent index;
3. creates only the missing targeted indexes through `collection.createIndex` and the existing bounded retry utility;
4. re-reads and verifies the exact definitions;
5. is idempotent and supported on MongoDB plus DocumentDB 5.0/8.0 instance-based clusters with the live partial-index capability enabled; enabled startup fails closed on DocumentDB 3.6/4.0, elastic clusters, or any engine that cannot assure these unique partial indexes;
6. verifies multi-document transaction support and is awaited after database connection and before either normal or experimental server readiness when Clerk is enabled.

Tests may call `syncIndexes()` to exercise schema declarations. Production code may not.

### 6. Login policy and route order

`POST /api/auth/clerk` accepts only:

```ts
interface TClerkLoginRequest {
  clerkToken: string;
}

type TClerkLoginResponse =
  | { twoFAPending: true; tempToken: string }
  | { twoFAPending?: false; token: string; user: TUser };

type ClerkAuthErrorCode =
  | 'CLERK_REQUEST_INVALID'
  | 'CLERK_TOKEN_INVALID'
  | 'CLERK_LOGIN_FORBIDDEN'
  | 'CLERK_IDENTITY_CONFLICT'
  | 'CLERK_TOKEN_REPLAYED'
  | 'CLERK_LOGIN_RATE_LIMITED'
  | 'CLERK_UPSTREAM_RATE_LIMITED'
  | 'CLERK_UNAVAILABLE'
  | 'CLERK_LOGIN_FAILED';

interface TClerkAuthErrorResponse {
  code: ClerkAuthErrorCode;
}
```

No request field may select a tenant, email, subject, redirect, or authorization party. Tenant comes from `preAuthTenant`; identity comes from the verified token/profile. Validate `clerkToken` as the only body property and cap its UTF-8 size with `MAX_CLERK_TOKEN_BYTES = 16_384`.

The mounted route order is:

1. `logHeaders`
2. a Clerk-specific instance of the existing login-limiter factory whose handler records the normal violation and returns `429 { code: 'CLERK_LOGIN_RATE_LIMITED' }`
3. a Clerk-specific `checkBan({ mode: 'ipOnly' })` that never reads `req.body.email` and returns `403 { code: 'CLERK_LOGIN_FORBIDDEN' }`
4. strict body validation (`clerkToken` only, bounded non-empty string)
5. typed `prepareClerkLogin`: resolve config, verify token, resolve the authoritative profile if needed, load tenant-scoped candidates and app config, and set an existing candidate on `req.user` without writing
6. a Clerk-specific `checkBan({ mode: 'resolvedIdentity' })` so user/email bans are evaluated against the existing candidate placed in `req.user` before writes; preparation must set every exact-sub or email-match candidate, and the middleware never performs its own unscoped email lookup or reads request-body identity
7. typed `enforceClerkLoginPolicy`: apply registration/domain/appConfig policy without writing
8. typed `commitClerkLogin`: atomic link or create, assign final `req.user`
9. `setBalanceConfig`
10. typed `completeClerkLogin`: local 2FA or correlated Session/JWT/cookies and allowlisted response
11. stable error adapter

`ALLOW_SOCIAL_REGISTRATION=false` prevents only new User creation; it does not block an already-bound subject. Resolved base and tenant domain allow/deny rules apply on every Clerk login: exact-sub hits use the stored normalized User email without a Clerk profile call, while miss/link/create paths use the verified primary email. Tenant selection and app configuration use the same resolution rules as existing registration. Banned/locked candidates cannot link or authenticate. No User, Session, claim, cookie, balance mutation, or avatar fetch occurs before all applicable policies pass.

Both normal and experimental servers mount `app.use('/api/auth', preAuthTenantMiddleware, routes.auth)`. Add a mount-parity HTTP test proving a strict tenant header reaches the Clerk route in both entry points; the webhook remains separately system-scoped and ignores tenant headers.

### 7. Session, replay, 2FA, and late-failure contract

Add one discriminated Session option and schema contract:

```ts
interface ClerkSessionContext {
  authProvider: 'clerk';
  tenantScope: string;
  clerkSessionId: string;
  clerkTokenId: string;
  clerkUserId: string;
  tokenExpiresAt: Date;
  absoluteExpiresAt: Date;
}

type CreateSessionOptions =
  | { clerk?: never; expiration?: Date; expiresIn?: number }
  | { clerk: ClerkSessionContext; expiration?: never; expiresIn?: never };
```

When `authProvider === 'clerk'`, every Clerk correlation string and the absolute deadline is required, trimmed/non-empty, and persisted; `Session.expiration` must equal `absoluteExpiresAt`. When the provider is not Clerk, every Clerk-only field is forbidden. Schema validation and real method tests reject all partial/blank combinations.

For direct login, the data-schema-owned exchange runs one bounded-retry Mongo transaction:

1. verifies the tenant-scoped User is not tombstoned;
2. conditionally upserts/touches the unique `user_state` only when it is not `deleted` and the unique `session_state` only when it is not `revoked`; a duplicate caused by an existing forbidden state maps to the stable tombstone/revocation error;
3. inserts the durable consumed `(tenantScope, jti)` claim, mapping only its named duplicate-key constraint to `CLERK_TOKEN_REPLAYED` rather than allowing `createSession` to rewrite it as `CREATE_SESSION_FAILED`;
4. creates the correlated Session in the same transaction with:

- `authProvider: 'clerk'`
- `clerkSessionId = sid`
- `clerkTokenId = jti`
- `clerkUserId = sub`
- `absoluteExpiresAt = min(now + configured SESSION_EXPIRY, now + 15 minutes)`
- `expiration = absoluteExpiresAt`

The webhook transaction writes the same unique session/user state documents. The transaction commit is the lifecycle linearization point: if issuance commits first, the later webhook transaction deletes its Session; if the event commits first, issuance cannot upsert an active state and fails before cookies. Do not replace this with check-then-write or best-effort pre/post reads. After the transaction, confirm the returned committed Session immediately before preparing cookies/JWT response headers; this narrows but cannot eliminate the issuance-first response race. In that ordering the response may deliver a refresh cookie whose Session the webhook has already deleted and an access bearer valid only to the cap; refresh fails, which is the documented bounded behavior.

The consumed claim survives Session logout, webhook deletion, TTL cleanup, and late rollback until `max(tokenExpiresAt, twoFactorCapabilityExpiresAt) + CLERK_CLOCK_SKEW_MS`. Access-JWT, refresh-cookie, refresh-token/JWT, persisted `expiration`, and `absoluteExpiresAt` are all capped to the same remaining deadline. Refresh rejects/deletes an expired Session; `updateExpiration` rejects extension of Clerk Sessions. Existing non-Clerk sessions retain current behavior.

If `req.user.twoFactorEnabled === true`, do not create a Session/claim and do not set auth cookies. Return the existing two-factor-pending response. Extend the signed temporary token payload with `authProvider`, an exact `tenantScope` (including explicit `tenantless`), `clerkSessionId`, `clerkTokenId`, `clerkUserId`, `tokenExpiresAt`, and `absoluteExpiresAt`; never include the original Clerk token. The capability expires at the minimum of five minutes, original token expiry, and the Clerk session deadline. The final 2FA request must carry the same pre-auth tenant scope as the signed capability (wrong, missing, tenant/tenantless mismatch is 403), and all User/claim/Session methods use that signed exact scope rather than a new ambient fallback. Final issuance uses the same transaction and post-commit confirmation. A repeated final exchange of the same `jti` is `409 CLERK_TOKEN_REPLAYED`.

Extend `setAuthTokens` minimally to accept trusted `ClerkSessionContext` and return/track the created Session ID. The commit point is the first externally observable header flush (`res.headersSent`), not Session persistence. If Session persistence succeeds but JWT creation, cookie assembly, serialization, or the injected pre-flush failure occurs, delete that exact Session, keep the consumed-token claim, and clear both pending auth cookies. Once headers are sent, do not pretend cookies can be cleared or delete the backing Session; retain the correlated Session, emit a redacted post-commit failure event, and let normal revocation/expiry govern it. Add an injected failure seam after Session creation but before any flush; do not mock `setAuthTokens` in closure tests.

Identity and balance commit before session issuance are intentionally not rolled back on a late session failure: compensating a verified link/create could race another request and corrupt identity state. A pre-commit rejection has zero User/Balance/claim/Session deltas. A pre-flush late failure retains the confirmed User mutation, resulting Balance state, and consumed claim, deletes only its exact Session, sets no cookies, and permits a later login only with a fresh `jti`, which converges on the already-linked/created User.

### 8. Webhook and logout lifecycle

Mount `POST /api/auth/clerk/webhook` with `express.raw({ type: 'application/json' })` before global `express.json()` and URL-encoded parsers in both `api/server/index.js` and `api/server/experimental.js`. The route receives no tenant from headers. Import `verifyWebhook` from `@clerk/backend/webhooks`. Adapt the Express raw `Buffer`, original request URL/method, and exact webhook headers into a WHATWG `Request` without UTF-8 parse/reserialize or header loss; pass the configured signing secret through the supported verifier options. A byte-faithful signed fixture proves the adapter preserves the verified payload before any event narrowing or mutation. Execute cross-tenant revocation inside `runAsSystem`.

Supported events:

- `session.ended` and `session.revoked`: in one transaction upsert the global `session_state: revoked` and delete all Sessions with the event session ID;
- `user.deleted`: in one transaction set `user_state: deleted`, tombstone every User with the exact Clerk subject, fence every correlated live `sid`, and delete all Sessions with that subject; invalidate affected auth-cache entries after commit;
- unsupported or duplicate valid events: idempotent `204`.

Shared-state transaction serialization plus the post-commit confirmation makes event-before-exchange, pending-2FA revocation, and webhook-delete-then-replay fail closed. For event-during-exchange, event-first denies before cookies; issuance-first may complete the response, but the webhook removes refresh state and only the capped bearer window remains. Deleting a Session never deletes its consumed-`jti` claim. System-scoped `sid`/subject queries use the provider-ID-first indexes; tenant-specific reads still include the explicit tenant suffix.

Missing server configuration is `503`; invalid signature/body is `400`; no unverified payload reaches a model method. Add bounded structured telemetry for verification outcome, profile latency/outcome, link result/race convergence, replay, webhook event/result, and session rollback. Use tenant/user opaque IDs where needed; never record tokens, keys, signing headers, or full email addresses.

Browser logout attempts LibreChat logout and, when a Clerk session exists, signs out only the active Clerk session with `signOut({ sessionId })`. Do not give Clerk an independent redirect. AuthContext awaits both operations with `Promise.allSettled`, always clears local headers/state, prevents silent refresh from immediately restoring a session while logout is unresolved/failed, and is the sole owner of post-logout navigation. It surfaces a safe retryable error if either operation failed and remains idempotent. The headless server logout endpoint remains local-only; webhook/absolute expiry provides Clerk-side revocation coverage.

Cross-tab behavior is explicit: each tab may exchange its own fresh `jti` once and therefore may own a separate LibreChat Session correlated to the same Clerk `sid`; reposting the same `jti` in any tab is rejected. Clerk sign-out propagates through Clerk's browser state, and the signed `session.ended`/`session.revoked` event deletes every local Session for that `sid`. Because existing LibreChat access JWTs are not Session-introspected on every request, an already-issued access token can remain usable until its capped expiration; it is never valid for more than 15 minutes after exchange. If the webhook is lost, refresh still fails at the absolute deadline. Tests state this bounded residual authorization window instead of claiming immediate access-JWT revocation.

### 9. HTTP and cookie contract

| Status | Code                          | Meaning                                                         |
| ------ | ----------------------------- | --------------------------------------------------------------- |
| 400    | `CLERK_REQUEST_INVALID`       | malformed login body or webhook request                         |
| 401    | `CLERK_TOKEN_INVALID`         | invalid/expired token or subject claims                         |
| 403    | `CLERK_LOGIN_FORBIDDEN`       | unverified identity, ban, domain/registration policy, tombstone |
| 409    | `CLERK_IDENTITY_CONFLICT`     | subject/email belongs to conflicting Users                      |
| 409    | `CLERK_TOKEN_REPLAYED`        | tenant/token ID already exchanged                               |
| 429    | `CLERK_LOGIN_RATE_LIMITED`    | local login limiter rejected the request                        |
| 429    | `CLERK_UPSTREAM_RATE_LIMITED` | Clerk profile API rate limited                                  |
| 503    | `CLERK_UNAVAILABLE`           | enabled config unavailable, timeout, network, upstream 5xx      |
| 500    | `CLERK_LOGIN_FAILED`          | redacted unexpected internal or late-session failure            |

Every failure before the response commit point uses a strict `{ code: ClerkAuthErrorCode }` body and sets no auth cookies. A post-header transport failure cannot replace a delivered body/cookies; it follows the retain-and-log contract in Fixed Contract 7 and is not represented as a second HTTP response. A validated upstream 429 `Retry-After` integer may be forwarded after clamping it to 1–60 seconds; discard every other upstream header. A 2FA-pending response sets no auth cookies. A successful final exchange returns only `{ token, user }` plus the existing `refreshToken` and `token_provider` cookies with the attributes already owned by `setAuthTokens`. Compare `ErrorTypes.AUTH_FAILED` using the enum member/value (`'auth_failed'`), never uppercase prose. Do not spread Mongoose documents or internal service results into responses.

### 10. Shared browser contract

Add all compile surfaces before wiring UI:

- `TStartupConfig.clerkLoginEnabled: boolean` and `TStartupConfig.clerkPublishableKey?: string` in `packages/data-provider/src/config.ts`;
- `TClerkLoginRequest = { clerkToken: string }`, the response union, `ClerkAuthErrorCode`, and `TClerkAuthErrorResponse` in `packages/data-provider/src/types.ts`;
- `apiEndpoints.clerkLogin` in `packages/data-provider/src/api-endpoints.ts`;
- `dataService.loginClerk(request)` in `packages/data-provider/src/data-service.ts`;
- `MutationKeys.loginClerk` in `packages/data-provider/src/keys.ts`;
- one consistently named `useClerkLoginMutation` hook in `client/src/data-provider/Auth/mutations.ts`;
- `loginWithClerk(token): Promise<TClerkLoginResponse>` in `TAuthContext` and `AuthContextProvider`.

Extract the existing login mutation lifecycle and reuse it for local and Clerk login: `onMutate` disables queries, resets the default preset, clears app state, removes queries, and then calls the caller callback; success leaves query re-enable to `setUserContext`; error re-enables queries before the caller callback. Tests assert callback ordering and failure recovery. `loginWithClerk` is `useCallback`-stable, uses `mutateAsync`, and reuses the existing `setUserContext` and two-factor navigation behavior. It does not duplicate login success logic. The AuthContext memo dependency list includes it.

Add an unknown-safe `getClerkAuthErrorCode(error: unknown): ClerkAuthErrorCode | undefined` that narrows the Axios-shaped response without casts or optional-property assumptions. Only an exact `CLERK_TOKEN_REPLAYED` result enables the one uncached-token retry; malformed, missing, or different error bodies never do.

Add a startup-config-latched `ClerkAuthBoundary` around `RouterProvider` in `client/src/App.jsx`. While the first startup-config request is loading, show an accessible boot status and do not mount the router. On success, wrap the router in `ClerkProvider` only when the single server flag and publishable key say enabled, retain that complete configuration when auth mutations clear React Query, and expose optional Clerk session/sign-out state to AuthContext. On startup-config error, pass the router through without Clerk so the existing `StartupLayout`/`AuthLayout` query-error path can render. Never latch or publish a partial Clerk configuration.

Render `ClerkLogin` directly from `Login.tsx` when `clerkLoginEnabled && clerkPublishableKey`, independent of `emailLoginEnabled`, `socialLoginEnabled`, and `socialLogins`. Do not add Clerk to `defaultSocialLogins` or the YAML provider list.

The component uses the current Clerk `SignInButton` in modal mode. Define one deployment-base-aware `loginPage()` and configure the combined flow with `ClerkProvider signInUrl={loginPage()}` while intentionally leaving `signUpUrl` unset, so a sign-up transfer stays on `signInUrl#/create` rather than the Account Portal. Pass `forceRedirectUrl`, `fallbackRedirectUrl`, `signUpForceRedirectUrl`, and `signUpFallbackRedirectUrl` as `loginPage()` on `SignInButton`. Test both existing-user sign-in and new-user sign-up transfer. The final application redirect remains the existing sanitized sessionStorage/isSafeRedirect path.

The browser bridge is an explicit session-ID-keyed state machine:

1. wait for Clerk `isLoaded`;
2. if not signed in, show the accessible sign-in control;
3. if signed in and LibreChat is not authenticated, start one exchange for the current `sessionId`;
4. call `getToken()`, require a non-null token, and `await loginWithClerk(token)`, which posts `{ clerkToken: token }`;
5. on `CLERK_TOKEN_REPLAYED`, call `getToken({ skipCache: true })` and retry exactly once;
6. ignore stale completions if `sessionId` changes or the component unmounts;
7. do not start another exchange until explicit Retry after a transient failure; for a forbidden/conflicting or repeatedly failing identity, expose a localized `Use another account` action that calls Clerk `signOut({ sessionId })` without a redirect and resets the bridge on `/login`;
8. never redirect before LibreChat success or the existing 2FA completion path.

Provide English LibreChat label/status/error/retry/use-another-account translations and map the app's normalized locale to supported `@clerk/localizations` packs with English fallback. Localization reacts to `i18n.resolvedLanguage` changes without remounting the Clerk provider or router; only successful startup configuration is latched. The custom control has an accessible name, disabled/busy status, visible non-secret error summary, keyboard-operable Retry and account-switch actions, and managed focus after failure. Per repository policy, only the English LibreChat translation file is edited; Clerk's package supplies its own maintained modal localizations.

## System Diagrams, Sequence Flows & Interface Grammar

Diagrams and formal contract grammar for the architecture fixed above, cross-referenced to the ten Fixed Contracts. Nothing here introduces new decisions — it visualizes and formalizes what Fixed Contracts 1–10 already specify.

### System diagram

```mermaid
flowchart TB
    subgraph Browser
        Bridge["ClerkLogin bridge<br/>session-ID-keyed state machine"]
        Boundary["ClerkAuthBoundary<br/>ClerkProvider (client/src/App.jsx)"]
        AuthCtx["AuthContext<br/>loginWithClerk / setUserContext"]
    end

    subgraph LoginRoute["POST /api/auth/clerk — mounted in api/server/routes/auth.js"]
        direction TB
        M1["logHeaders"] --> M2["Clerk loginLimiter<br/>429 CLERK_LOGIN_RATE_LIMITED"]
        M2 --> M3["checkBan(ipOnly)<br/>403 CLERK_LOGIN_FORBIDDEN"]
        M3 --> M4["validate body: clerkToken only,<br/>≤16KiB, 400 CLERK_REQUEST_INVALID"]
        M4 --> M5["prepareClerkLogin<br/>verify + profile + candidate lookup,<br/>sets req.user, no writes"]
        M5 --> M6["checkBan(resolvedIdentity)"]
        M6 --> M7["enforceClerkLoginPolicy<br/>registration/domain/appConfig"]
        M7 --> M8["commitClerkLogin<br/>atomic link-or-create"]
        M8 --> M9["setBalanceConfig"]
        M9 --> M10["completeClerkLogin<br/>2FA branch or Session+JWT+cookies"]
    end

    subgraph WebhookRoute["POST /api/auth/clerk/webhook — express.raw, pre-JSON-parser mount"]
        W1["verifyWebhook (@clerk/backend/webhooks)"] --> W2["runAsSystem: revoke Session(s)<br/>or tombstone User"]
    end

    subgraph TypedPkg["packages/api/src/auth/clerk/*"]
        Config["config.ts<br/>resolveClerkAuthConfig"]
        Verify["verify.ts<br/>verifyClerkSessionToken"]
        Profile["profile.ts<br/>Backend User fetch, 5s abort"]
        Service["service.ts<br/>linkClerkIdentity decision table"]
        Handler["handler.ts<br/>prepare/policy/commit/complete factories"]
    end

    subgraph DB["MongoDB (mongodb-memory-server in tests)"]
        UserColl[("User<br/>+clerkId, +clerkDeletedAt")]
        SessionColl[("Session<br/>+authProvider:'clerk', +clerkSessionId/clerkTokenId/clerkUserId,<br/>+absoluteExpiresAt")]
        ClaimColl[("ClerkAuthClaim<br/>consumed_token / session_state / user_state,<br/>TTL on expiration")]
    end

    subgraph External["Clerk's servers"]
        JWKS["JWKS / verifyToken"]
        BackendUser["GET /v1/users/:sub<br/>Backend User API"]
        WebhookSender["Standard Webhooks sender<br/>session.ended/revoked, user.deleted"]
    end

    Bridge -->|"getToken()"| Boundary
    Boundary -->|"{clerkToken}"| M1
    M5 --> Verify
    Verify -.->|network| JWKS
    M5 --> Profile
    Profile -.->|network, mocked in tests| BackendUser
    M8 --> Service
    Service --> UserColl
    M10 -->|non-2FA| SessionColl
    M10 -->|non-2FA| ClaimColl
    M1 -.-> Config
    M10 -->|"200 {token,user} + Set-Cookie"| Bridge
    WebhookSender -.->|signed event| W1
    W2 --> SessionColl
    W2 --> UserColl
    W2 --> ClaimColl

    LocalLogin["POST /api/auth/login<br/>existing, untouched — Excluded scope"] -.->|shares Session/setAuthTokens shape only| SessionColl
```

### Sequence — new user: verify, authoritative profile, transactional create+session (Fixed Contracts 2, 3, 7; Behaviors 3, 4, 6)

```mermaid
sequenceDiagram
    participant Bridge as Browser bridge
    participant Route as auth.js router
    participant Prep as prepareClerkLogin
    participant Verify as verifyClerkSessionToken
    participant Clerk as Clerk JWKS
    participant Profile as profile.ts
    participant BackendUser as Clerk Backend User API
    participant Policy as enforceClerkLoginPolicy
    participant Commit as commitClerkLogin
    participant Service as linkClerkIdentity / create
    participant Tx as Mongo transaction
    participant Complete as completeClerkLogin

    Bridge->>Route: POST /api/auth/clerk {clerkToken}
    Route->>Prep: (after logHeaders/limiter/checkBan-ipOnly/validate)
    Prep->>Verify: verifyClerkSessionToken(token, config)
    Verify->>Clerk: verify signature, azp, sts, iat/exp window
    Clerk-->>Verify: valid {sub, sid, jti, azp, sts, iat, exp}
    Verify-->>Prep: verified claims (no email)
    Prep->>Prep: findUser({clerkId: sub}) tenant-scoped -- miss
    Prep->>Profile: fetch Backend User (sub)
    Profile->>BackendUser: GET /v1/users/:sub, 5s abort
    BackendUser-->>Profile: primaryEmailAddress {verified}
    Profile-->>Prep: VerifiedClerkIdentity {email, emailVerified:true, ...}
    Prep->>Prep: findUser({email}) tenant-scoped -- miss
    Prep-->>Route: req.user = undefined (no candidate), identity attached
    Route->>Route: checkBan(resolvedIdentity)
    Route->>Policy: registration/domain/appConfig checks
    Policy-->>Route: pass
    Route->>Commit: commitClerkLogin(identity)
    Commit->>Service: no userByClerkId, no userByEmail, emailVerified=true -> create
    Service->>Tx: begin transaction
    Tx->>Tx: insert User {clerkId, provider:'clerk', ...}
    Tx->>Tx: upsert user_state:active, session_state:active
    Tx->>Tx: insert consumed_token claim {tenantScope, jti}
    Tx->>Tx: insert Session {authProvider:'clerk', clerkSessionId, clerkTokenId, absoluteExpiresAt}
    Tx-->>Service: committed
    Service-->>Commit: req.user = final User
    Commit-->>Route: setBalanceConfig runs on final req.user
    Route->>Complete: completeClerkLogin
    Complete->>Complete: re-confirm committed Session post-commit
    Complete-->>Route: {token, user} + Set-Cookie refreshToken/token_provider
    Route-->>Bridge: 200 {token, user}
    Bridge->>Bridge: loginWithClerk resolves -> setUserContext
```

### Sequence — email collision: verified link vs unverified conflict (Fixed Contract 3, decision table; Behavior 4)

```mermaid
sequenceDiagram
    participant Prep as prepareClerkLogin
    participant Service as linkClerkIdentity
    participant Tx as Mongo transaction

    Prep->>Prep: findUser({clerkId: sub}) -- miss
    Prep->>Prep: findUser({email}) tenant-scoped -- hit, different clerkId/no clerkId

    alt existing user has no clerkId AND emailVerified === true
        Prep->>Service: linkClerkIdentity({userId, clerkId, tenantId})
        Service->>Tx: conditional update: match _id + tenant + clerkId absent + not tombstoned
        Tx-->>Service: matched -> sets clerkId only, provider untouched
        Service-->>Prep: {status:'linked', user}
        Note over Prep: 200 — original provider still authenticates afterward (Behavior 4 regression)
    else existing user already has a DIFFERENT clerkId, OR is tombstoned
        Prep->>Service: linkClerkIdentity(...)
        Service->>Tx: conditional update -- zero matches
        Tx-->>Service: re-read: clerkId already set to another subject, or clerkDeletedAt present
        Service-->>Prep: {status:'conflict'}
        Note over Prep: 409 CLERK_IDENTITY_CONFLICT — no write
    else no authoritative verified email at all
        Note over Prep: 403 CLERK_LOGIN_FORBIDDEN — no write, no profile-derived guess
    end
```

### Sequence — replay defense: direct login replay and post-2FA replay (Fixed Contract 7; Behavior 6)

```mermaid
sequenceDiagram
    participant Bridge as Browser bridge
    participant Route as auth.js router
    participant Tx as Mongo transaction
    participant Claim as ClerkAuthClaim

    Bridge->>Route: POST /api/auth/clerk {clerkToken} (jti=J1)
    Route->>Tx: exchange transaction: insert consumed_token {tenantScope, jti:J1}
    Tx-->>Route: committed -- Session created
    Route-->>Bridge: 200 {token, user}

    Note over Bridge: same token reused (retry, double-submit, or replay attempt)
    Bridge->>Route: POST /api/auth/clerk {clerkToken} (jti=J1 again)
    Route->>Tx: exchange transaction: insert consumed_token {tenantScope, jti:J1}
    Tx->>Claim: unique (tenantScope, clerkTokenId) violated
    Claim-->>Tx: E11000 on the named claim index
    Tx-->>Route: mapped to CLERK_TOKEN_REPLAYED, not CREATE_SESSION_FAILED
    Route-->>Bridge: 409 {code: CLERK_TOKEN_REPLAYED}
    Bridge->>Bridge: getToken({skipCache:true}) -- exactly one retry
    Bridge->>Route: POST /api/auth/clerk {clerkToken} (fresh jti=J2)
    Route-->>Bridge: 200 {token, user}

    Note over Claim: the consumed J1 claim survives logout/webhook-delete/TTL cleanup<br/>until max(tokenExpiresAt, 2FA capability expiry) + clock skew
```

### Sequence — webhook race: event-first vs issuance-first (Fixed Contracts 7–8; Behaviors 6, 8, Closure B)

```mermaid
sequenceDiagram
    participant Clerk as Clerk webhook sender
    participant WH as /api/auth/clerk/webhook
    participant Login as POST /api/auth/clerk (in flight)
    participant Tx as Mongo transaction
    participant Session as Session collection

    par event-first
        Clerk->>WH: session.revoked {sid}
        WH->>Tx: upsert session_state:revoked (unique) + delete Sessions where clerkSessionId=sid
        Tx-->>WH: committed
        Login->>Tx: exchange transaction tries to upsert session_state:active for same sid
        Tx-->>Login: conflict against revoked state -- denies before any cookie is set
        Login-->>Login: 403/409 — zero Session/cookie ever produced
    and issuance-first
        Login->>Tx: exchange transaction commits Session first (session_state:active)
        Tx-->>Login: committed -- 200 {token,user} + cookies already sent
        Clerk->>WH: session.revoked {sid} (arrives after)
        WH->>Tx: upsert session_state:revoked, delete Session
        Tx-->>WH: committed
        Note over Login: response already delivered a refresh cookie whose Session is now gone.<br/>Refresh fails from this point; the already-issued access bearer<br/>remains usable only until its capped ≤15min expiry (documented bounded window).
    end
```

### Sequence — browser bridge state machine (Fixed Contract 10; Behavior 10)

```mermaid
sequenceDiagram
    participant User as End user
    participant Clerk as Clerk SDK (isLoaded, sessionId)
    participant Bridge as ClerkLogin bridge
    participant Ctx as AuthContext.loginWithClerk

    Bridge->>Clerk: wait for isLoaded
    alt not signed in
        Bridge-->>User: show accessible sign-in control (SignInButton modal)
        User->>Clerk: complete sign-in / sign-up in modal
    end
    Clerk-->>Bridge: signed in, sessionId = S1
    Bridge->>Bridge: start exactly one exchange for sessionId=S1
    Bridge->>Clerk: getToken()
    Clerk-->>Bridge: token (non-null required)
    Bridge->>Ctx: await loginWithClerk(token)
    alt success
        Ctx-->>Bridge: {token, user}
        Bridge->>Bridge: existing sanitized sessionStorage/isSafeRedirect navigation
    else CLERK_TOKEN_REPLAYED
        Bridge->>Clerk: getToken({skipCache:true})
        Bridge->>Ctx: loginWithClerk(freshToken) -- retry exactly once
    else other failure (forbidden/conflict/unavailable)
        Bridge-->>User: localized error + Retry + "Use another account"
        User->>Bridge: clicks "Use another account"
        Bridge->>Clerk: signOut({sessionId: S1}), no redirect
        Bridge->>Bridge: reset bridge state on /login
    end
    Note over Bridge: if sessionId changes or component unmounts mid-exchange,<br/>the stale completion is ignored — never applies success for a superseded session
```

### Data flow — payload shape at each transformation stage (Fixed Contracts 2–4, 7, 9)

```mermaid
flowchart LR
    A["Clerk session JWT<br/>opaque, ≤16KiB"] -->|"POST body<br/>{clerkToken: string}"| B["Verified claims<br/>{sub,sid,jti,azp,sts,iat,exp}<br/>NO email/verification"]
    B -->|"cache miss only"| C["Backend User profile<br/>{primaryEmailAddress: {verified}}"]
    C -->|"select + normalize"| D["VerifiedClerkIdentity<br/>{clerkId,clerkSessionId,clerkTokenId,<br/>email?,emailVerified?,name?,username?,avatarUrl?}"]
    D -->|"decision table (Fixed Contract 3)"| E["User write shape<br/>{clerkId} link-only, OR<br/>{email,clerkId,provider:'clerk',...} create"]
    E -->|persisted, tenant-scoped| F[("UserDocument<br/>_id unchanged across a link")]
    F -->|"minus refreshToken/clerkId/clerkDeletedAt/password/2FA secrets"| G["Allowlisted UserDTO<br/>packages/api/src/auth/user.ts serializer"]
    D -->|"jti, sid, sub"| H[("ClerkAuthClaim<br/>consumed_token / session_state / user_state")]
    F -->|feeds| I["Session<br/>authProvider:'clerk', absoluteExpiresAt=min(SESSION_EXPIRY,+15min)"]
    I -->|"Set-Cookie refreshToken(cap)<br/>+ response.token(cap)"| J["Frontend session state<br/>AuthContext: token,user,isAuthenticated"]
```

### Interface & contract grammar, per Fixed Contract

EBNF-style grammar for the type/message crossing each contract boundary, paired with the precondition/postcondition each side must honor. `::=` defines a shape; `[...]` marks optional; `|` is alternation; function contracts are `name :: (params) -> ReturnType`.

**Fixed Contract 1 — Startup configuration seam** (env ↔ `resolveClerkAuthConfig` ↔ `GET /api/config`)
```
ClerkEnv ::= '{' CLERK_PUBLISHABLE_KEY ',' CLERK_SECRET_KEY ',' CLERK_JWT_KEY ','
                 CLERK_AUTHORIZED_PARTIES ',' CLERK_WEBHOOK_SIGNING_SECRET '}'

resolveClerkAuthConfig :: (env: ClerkEnv) -> ClerkAuthConfig
ClerkAuthConfig ::= { enabled: false }
                  | { enabled: true, publishableKey, secretKey, jwtKey,
                      authorizedParties: readonly string[], webhookSigningSecret }

Precondition: none — env is read as-is; any non-empty proper subset of the five
  values is a configuration ERROR (fail-closed), not a partially-enabled state.
Postcondition: only {enabled, publishableKey} may cross into GET /api/config's
  response body (both anonymous and authenticated) — every other field is
  server-only and MUST NOT serialize. Startup readiness (both normal and
  experimental servers) blocks on this resolving cleanly plus, if enabled,
  ensureClerkIndexes() succeeding — see Fixed Contract 5.
```

**Fixed Contract 2 — Token verification and profile seam** (`verifyClerkSessionToken` ↔ Clerk JWKS; `profile.ts` ↔ Clerk Backend User API)
```
verifyClerkSessionToken :: (token: string, config: ClerkAuthConfig)
                            -> Promise<VerifiedClaims> | Rejected<ClerkAuthErrorCode>
VerifiedClaims ::= '{' sub, sid, jti, azp, [sts], iat, exp '}'   (* never email *)

fetchClerkProfile :: (sub: ClerkUserId, config) -> Promise<VerifiedClerkIdentity>
                      | Rejected<'CLERK_UNAVAILABLE' | 'CLERK_UPSTREAM_RATE_LIMITED'
                                  | 'CLERK_TOKEN_INVALID' | 'CLERK_LOGIN_FORBIDDEN'>

Precondition: verifyClerkSessionToken never trusts azp absent from
  authorizedParties, sts==='pending', or a token/claim lifetime exceeding
  MAX_CLERK_TOKEN_LIFETIME_MS. fetchClerkProfile is only called on a clerkId
  MISS (an existing linked user reuses its stored, already-verified email —
  no profile call, no network dependency on the hot repeat-login path).
Postcondition: a well-formed profile without an explicitly verified primary
  email is FORBIDDEN, not a create candidate — the boundary between "identity
  established" and "identity usable for account resolution" is
  emailVerified === true, never inferred from a token claim.
```

**Fixed Contract 3 — Tenant/link state-machine seam** (`prepareClerkLogin` ↔ `linkClerkIdentity` ↔ User collection)
```
tenantScope ::= { tenantId }  |  { tenantId: { $exists: false } }   (* never unscoped *)

linkClerkIdentity :: ({userId, clerkId, tenantId}) -> Promise<LinkClerkIdentityResult>
LinkClerkIdentityResult ::= {status:'linked', user}   | {status:'already_linked', user}
                           | {status:'conflict'}       | {status:'not_found'}

Precondition: caller has already resolved userByClerkId/userByEmail per the
  7-row decision table (Fixed Contract 3) and only calls linkClerkIdentity on
  the "unlinked email user, emailVerified===true" row.
Postcondition: one conditional atomic update — matches _id + exact tenant scope
  + clerkId absent + clerkDeletedAt absent. NEVER sets provider. On zero
  matches, re-reads and returns already_linked/conflict/not_found
  deterministically — never a raw unhandled E11000. Invalidates the affected
  auth user-document cache entry after every successful or converged write.
Invariant: _id is stable across linking — every collection referencing
  User._id (Conversation, Message, Balance, ...) stays valid.
```

**Fixed Contract 4 — Stored fields and exposure seam** (`IUser`/`updateUser` ↔ public serializer ↔ client `TUser`)
```
IUser ⊇ { clerkId?: string, clerkDeletedAt?: Date }   (* clerkDeletedAt: select:false *)

updateUser :: (id, patch: Omit<Partial<IUser>, 'clerkId'|'clerkDeletedAt'>) -> Promise<IUser>
  (* both keys rejected at runtime for legacy JS callers, not just typed out *)

serializeUserForResponse :: (user: IUser) -> UserDTO
  where UserDTO excludes clerkId, clerkDeletedAt, password, refreshToken,
        resetToken, totpSecret, backupCodes, and every other internal field

Postcondition: clerkId/clerkDeletedAt never enter packages/api/src/utils/env.ts's
  MCP projection or the client TUser type — the field exists exactly as far
  as the backend's own identity resolution needs it, no further.
```

**Fixed Contract 5 — Production index seam** (`ensureClerkIndexes` ↔ MongoDB, startup-gated)
```
ensureClerkIndexes :: (connection) -> Promise<void> | Rejected<IndexAssuranceError>

Precondition: called once, awaited, after DB connection and before server
  readiness — only when Clerk is enabled and MONGO_AUTO_INDEX=false.
Postcondition (success): every named index in Fixed Contract 5's table exists
  with the exact declared key/options; idempotent on rerun.
Postcondition (failure): preflight duplicate, incompatible existing index, or
  creation failure -> readiness FAILS CLOSED, server does not accept traffic.
Contract: production code path never calls syncIndexes() — only test code may.
```

**Fixed Contract 6 — Route/policy ordering seam** (the 10-step middleware chain in the System diagram above)
```
TClerkLoginRequest ::= '{' clerkToken: string '}'          (* only field accepted *)

Ordering invariant: prepareClerkLogin (step 5) sets req.user to an existing
  CANDIDATE without writing; checkBan(resolvedIdentity) (step 6) evaluates
  user/email bans against that candidate; enforceClerkLoginPolicy (step 7)
  applies registration/domain/appConfig rules; commitClerkLogin (step 8) is
  the ONLY step that writes User/link state; setBalanceConfig (step 9) runs
  only after req.user is final. No User/Session/claim/cookie/balance/avatar
  mutation occurs before all of steps 6–7 pass — this is the fixed order, not
  a suggestion; a closure test proves the zero-delta guarantee on every
  rejection branch (see Closure A).
```

**Fixed Contract 7 — Session/replay/2FA seam** (`CreateSessionOptions` ↔ exchange transaction ↔ `ClerkAuthClaim`)
```
ClerkSessionContext ::= '{' authProvider:'clerk', tenantScope, clerkSessionId,
                             clerkTokenId, clerkUserId, tokenExpiresAt,
                             absoluteExpiresAt '}'

exchange :: (identity, sessionContext) -> Promise<{session, token}>
            | Rejected<'CLERK_TOKEN_REPLAYED' | tombstone/revocation errors>

Precondition: runs as ONE bounded-retry Mongo transaction (not check-then-write).
Postcondition: consumed (tenantScope, jti) claim is durable — outlives Session
  deletion/logout/TTL cleanup until max(tokenExpiresAt, 2FA-capability-expiry)
  + clock skew. Session.expiration === absoluteExpiresAt always. Refresh can
  never extend past absoluteExpiresAt; at/after it, refresh deletes/rejects.
  2FA-pending: zero Session/claim/cookie writes; the temporary token carries
  only correlation claims, never the original Clerk token.
```

**Fixed Contract 8 — Webhook/logout seam** (`POST /api/auth/clerk/webhook` ↔ system-scoped revocation ↔ browser dual logout)
```
verifyWebhook :: (WHATWGRequest, {signingSecret}) -> Promise<ClerkWebhookEvent>
                  | Rejected<'invalid signature' | 'malformed body'>

Precondition: route is mounted with express.raw BEFORE global json/urlencoded
  parsers in BOTH api/server/index.js and api/server/experimental.js — a byte-
  faithful Buffer, never a parsed-then-reserialized body, reaches verifyWebhook.
Postcondition (session.ended|session.revoked): one transaction sets the global
  session_state:revoked claim AND deletes every Session with that clerkSessionId,
  across all tenants (runAsSystem).
Postcondition (user.deleted): one transaction sets user_state:deleted, tombstones
  every User with that clerkId (sets clerkDeletedAt, does NOT unset clerkId or
  provider), deletes correlated Sessions, invalidates affected auth-cache keys.
Browser logout :: Promise.allSettled([localLogout(), clerkSignOut({sessionId})])
  — always clears local headers/state regardless of either outcome; never
  redirects via Clerk directly.
```

**Fixed Contract 9 — HTTP/cookie response seam** (backend ↔ any HTTP caller)
```
TClerkAuthErrorResponse ::= '{' code: ClerkAuthErrorCode '}'
TClerkLoginResponse ::= { twoFAPending: true, tempToken: string }
                       | { twoFAPending?: false, token: string, user: TUser }

Invariant: every failure before the response commit point sets NO auth
  cookies and returns exactly {code}, never a raw exception or a Mongoose
  document spread into the body. ErrorTypes.AUTH_FAILED is compared by enum
  VALUE ('auth_failed'), never the literal string 'AUTH_FAILED'. A validated
  upstream Retry-After (1–60s) may forward; every other upstream header is
  discarded.
```

**Fixed Contract 10 — Shared browser contract seam** (`dataService.loginClerk` ↔ `useClerkLoginMutation` ↔ `AuthContext.loginWithClerk` ↔ `ClerkLogin`/`ClerkAuthBoundary`)
```
loginWithClerk :: (token: string) -> Promise<TClerkLoginResponse>   (* useCallback-stable *)

dataService.loginClerk :: (req: TClerkLoginRequest) -> Promise<TClerkLoginResponse>
getClerkAuthErrorCode :: (error: unknown) -> ClerkAuthErrorCode | undefined  (* unsafe-narrows, no casts *)

Precondition: ClerkAuthBoundary only mounts ClerkProvider once startup config
  has fully loaded AND both clerkLoginEnabled && clerkPublishableKey are
  present — never a partially-latched config (Behavior 10 explicitly treats a
  live partial-config UI state as unreachable, since enabled-but-incomplete
  server config fails readiness per Fixed Contract 1).
Postcondition: on getClerkAuthErrorCode(err) === 'CLERK_TOKEN_REPLAYED', the
  bridge performs exactly one getToken({skipCache:true}) retry — every other
  error code, malformed body, or missing code never retries automatically.
  ClerkLogin renders independent of emailLoginEnabled/socialLoginEnabled/
  socialLogins — it is not gated by the generic social-login switch.
```

## TDD Delivery Sequence

Each behavior is a separate Red -> Green -> Refactor cycle. Do not make a later behavior's production changes while an earlier Red is still unexplained.

### Behavior 1 — Configuration and dependency ownership fail closed

**Examples**

- All five valid values produce the enabled server configuration and public `{ clerkLoginEnabled: true, clerkPublishableKey }`.
- No Clerk variables produce disabled configuration and no public publishable key.
- Every non-empty proper subset, malformed authorized party, production HTTP origin, wildcard, secret-shaped public projection, or blank value throws a redacted configuration error.
- Anonymous and authenticated `/api/config` payloads have the same Clerk public fields and never serialize the secret, JWT key, webhook secret, or authorized parties.
- Normal and experimental startup do not become ready when enabled Clerk index assurance fails.

**Red**

- Add table tests in `packages/api/src/auth/clerk/config.spec.ts` and anonymous/authenticated route matrix tests in `api/server/routes/__tests__/config.spec.js`.
- Add startup-order/failure tests around both server entry points with injected `ensureClerkIndexes` failure.
- Add a package export/runtime smoke test proving the built `@librechat/api` auth export can load with externalized `@clerk/backend` supplied by `api`.

**Green**

- Add the resolver and public projector, exports, exact dependencies, lockfile changes, and awaited startup gate.

**Refactor**

- Remove duplicate env reads. Centralize origin parsing and redacted errors. Restore `process.env` in every matrix case.

### Behavior 2 — User/Session contracts and production indexes are complete

**Examples**

- Duplicate `clerkId` in the same tenant fails; the same value in a different tenant succeeds; multiple absent values succeed; null/empty/whitespace values fail validation.
- Clerk Session correlation is all-or-none and nonblank; duplicate Session/claim token ID in the same tenant scope fails while a different tenant scope succeeds.
- With automatic indexes disabled, the migration creates all exact named indexes, reruns idempotently, and rejects invalid present fields, duplicates, or incompatible definitions.
- DocumentDB 5.0/8.0 instance capability coverage creates and uses the same partial definitions; unsupported older/elastic deployments fail enabled readiness.
- Type tests/compilation prove `clerkId` and `clerkDeletedAt` exist on canonical `IUser`, the tombstone is available only through the identity projection, generic update rejects both managed fields, and neither field enters public `TUser` or MCP projections.

**Red**

- Extend `user.methods.spec.ts`; use `MongoMemoryReplSet` for transaction-dependent `session.clerk.spec.ts`, `clerkAuthClaim.spec.ts`, and webhook/exchange suites; use real Mongo for `migrations/clerk.spec.ts`.
- Add compile assertions for every hand-written User result surface and public serializer denial tests.

**Green**

- Add User/Session/ClerkAuthClaim fields, discriminated validation, schema indexes, method/type/model exports, targeted migration, and startup invocation.

**Refactor**

- Share index constants between declarations, verification, and tests. Keep production migration free of `syncIndexes()`/`syncIndexes` equivalents.

### Behavior 3 — Verification and authoritative identity normalization

**Examples**

- Locally signed Clerk-shaped tokens with allowed/missing/disallowed `azp`, pending `sts`, missing `sid`/`jti`/`sub`/`iat`/`exp`, overlong lifetime, expiry, and invalid signatures map to the specified results.
- Token email-shaped custom claims are ignored.
- A subject hit avoids the profile request.
- A subject miss accepts only the explicitly verified primary email and normalizes safe optional name/username/avatar fields.
- Abort deadline, 429, 5xx, network failure, malformed JSON, missing primary email, and unverified email map to stable errors.

**Red**

- Add table-driven package tests using a local RSA key/JWT fixture for the real verification adapter. Do not mock the wrapper under test and do not add the proposed incompatible `fast-check` property test.
- Mock only the outbound profile transport in normalization tests; use fake timers/abort observation, not sleeps.

**Green**

- Implement the verifier, runtime claim guards, five-second abortable profile adapter, and normalizer in `packages/api`.

**Refactor**

- Keep error mapping exhaustive, flat, and token-free. Add bounded structured telemetry.

### Behavior 4 — Tenant-scoped identity decisions and atomic claims

**Examples**

- Cover every row in the account-link table, including same-email/different-sub with `provider: 'clerk'`, tombstoned users, tenantless versus tenant users, and same email in separate tenants.
- The link changes only `clerkId`; provider, password, 2FA settings, role, and other fields remain byte-for-byte equivalent, and a focused regression proves the original provider can still authenticate afterward.
- Two concurrent subjects claiming one user yield one link and one conflict.
- Two concurrent first logins converge to one User; duplicate errors do not become 500s.
- Successful link and tombstone mutations invalidate the exact auth cache entries.
- Missing/invalid avatar does not invoke avatar download; valid-URL retrieval/resize/storage failure is best effort, returns the created User without an avatar, and the next login converges.

**Red**

- Add real-Mongo method tests for conditional update, E11000 convergence, tenant scope, provider preservation, cache invalidation, and tombstone behavior.
- Add pure service decision-table tests with named `userByClerkId`/`userByEmail` inputs and explicit `emailVerified === true` checks.

**Green**

- Implement `linkClerkIdentity`, tombstone methods, and the typed identity service. Inject the existing user-creation adapter through the legacy composition root.

**Refactor**

- Flatten nested branches and use the result union exhaustively. No generic `findOne` or read-then-`updateUser` link sequence remains.

### Behavior 5 — Policy-correct route preparation and commit

**Examples**

- Invalid body/token, local rate limit, IP ban, user/email ban, locked user, denied domain (including exact-sub login), disabled registration for a new identity, and conflicting identity produce the exact status/code and no User/Session/claim/cookie/avatar/balance write.
- Disabled registration still permits a previously bound, non-tombstoned subject if all other policies pass.
- The first ban pass is IP-only; the second sees only the candidate/trusted identity before commit; `setBalanceConfig` sees the final User after commit.
- Tenant and non-default app configuration drive policy decisions.
- Exact-sub login does not require a Clerk profile network call.

**Red**

- Add typed handler tests that capture middleware-visible `req.user` and dependency call order.
- Add route-specific limiter/ban responder tests plus route tests for all failure/cookie invariants, exact-sub denied domain, and non-default app configuration.

**Green**

- Implement prepare/policy/commit/complete handler factories under `packages/api`; parameterize the existing legacy limiter/ban middleware only enough to supply safe Clerk modes/responders, and compose the ordered chain in `api/server/routes/auth.js`.

**Refactor**

- Keep validation, preparation, commit, and response responsibilities separate. Use a single error adapter and enum values; remove raw-message response paths.

### Behavior 6 — Correlated session exchange, 2FA, replay, and rollback

**Examples**

- A non-2FA login creates exactly one correlated Session, issues capped access/refresh state, and returns an allowlisted User.
- A 2FA user receives only a tenant-bound signed temporary token and no Session/claim/cookies; wrong/missing tenant, tenantless/tenant mismatch, revoked sid, or tombstoned User cannot finalize; successful 2FA creates the correlated Session and preserves the safe redirect.
- Reusing a token ID directly or through 2FA yields `409 CLERK_TOKEN_REPLAYED`; a different tenant is independently scoped. Logout, webhook deletion, TTL cleanup, and late rollback never release the claim while a credential can still be accepted.
- Event-before-exchange and pending-2FA revocation fail before cookies; webhook-delete-then-replay remains consumed. Deterministic issue-versus-event race tests cover both serialized outcomes: event-first denies issuance, while issuance-first lets the event delete the committed refresh Session and leaves only the documented capped bearer window.
- Refresh before the absolute deadline cannot extend it; at/after the deadline it deletes/rejects the Session. Persisted `expiration`, access/refresh JWT expiry, and cookie expiry match the same cap. Non-Clerk refresh behavior is unchanged.
- An injected pre-flush failure after Session creation deletes that exact Session and clears pending cookies but retains the claim; post-commit failure retains the correlated Session and logs safely.
- The serializer never exposes refresh/internal/Clerk fields.

**Red**

- Add `MongoMemoryReplSet` Session/claim/state transaction and duplicate-error mapping tests, AuthService expiry/commit-point tests, tenant-bound 2FA service/controller tests, refresh regression tests, and public serializer tests.

**Green**

- Add the discriminated Session context, durable claim/fence methods, unique exchange, tenant-bound 2FA context, minimal AuthService option, refresh cap, commit-point handling, and shared serializer use.

**Refactor**

- Centralize `MAX_CLERK_SESSION_AGE_MS` and expiry calculation. Existing callers remain source-compatible and keep existing lifetimes.

### Behavior 7 — Mounted login closure is real

**Examples**

- New user, exact subject, verified email link, conflict, policy rejection, direct replay, durable replay after deletion, and tenant-bound local 2FA all enter through the actual mounted route in both server mount topologies.
- Success can use the returned access token against a protected probe route and finds real User and Session documents.
- Pre-commit failure paths assert zero User/Balance/Session/claim deltas and zero cookies; late-failure cases assert the explicit compensated/non-compensated deltas from Fixed Contract 7.

**Red**

- Add the blocking closure test described below and first prove the absent route is 404/red.

**Green**

- Wire real compiled package exports and real model methods into the actual router.

**Refactor**

- The closure may mock only Clerk SDK cryptographic/profile transports. If it mocks the handler, identity service, data methods, Session model, or `setAuthTokens`, the test is invalid.

### Behavior 8 — Verified webhooks revoke local state

**Examples**

- Valid ended/revoked session events delete correlated Sessions across tenants.
- Valid user deletion tombstones every matching User binding, invalidates each auth cache key, deletes its Sessions, and preserves local provider/data.
- Revocation and deletion serialize through shared state: event-first blocks login/pending-2FA, issuance-first is subsequently deleted, and same-jti-after-deletion cannot issue a new Session.
- Duplicate events are idempotent; unsupported verified events are 204.
- Bad signature, parsed/non-raw body, missing config, and forged tenant header cannot mutate state.
- Both server entry points mount raw webhook handling before JSON parsers.

**Red**

- Add webhook service unit tests, raw HTTP closure tests, and source-order/mount-parity tests for both server entry points.

**Green**

- Implement verified event narrowing, system-scoped methods, raw route, and pre-parser mounts.

**Refactor**

- Share event-result telemetry and make every mutation idempotent. Never trust tenant input from the webhook request.

### Behavior 9 — Shared client API and AuthContext compile end to end

**Examples**

- `dataService.loginClerk` posts the strict request to the exact endpoint and preserves the response union.
- Mutation success calls the same user-context path as local login; 2FA uses the existing screen contract.
- `loginWithClerk` is Promise-based, stable across renders, included in context types/memo dependencies, and exposes stable error codes.
- The reused login mutation lifecycle disables/clears before the request, re-enables queries on error before the caller callback, and leaves success re-enable to `setUserContext`.
- Logout attempts local and Clerk operations, suppresses refresh re-entry, clears local state, and settles before navigation.

**Red**

- Add request mock tests in data-provider, mutation lifecycle/callback-order tests, unknown-safe error-extractor tests, and AuthContext render/rerender/logout tests.

**Green**

- Add types, endpoint, service, key, mutation, lifecycle context, and AuthContext method.

**Refactor**

- One internal login-success helper serves local and Clerk flows. Avoid duplicate navigation and callback identities.

### Behavior 10 — Current Clerk UI completes one exchange and redirects safely

**Examples**

- Provider wraps the router only for a complete enabled config and remains mounted when auth mutations clear startup queries.
- Clerk appears on `/login` when generic social login and email login are both disabled; it is absent on `/register` and when Clerk is disabled. A partial-config UI case exists only as a defensive component-unit fixture because a real partially configured server fails readiness.
- After modal completion the bridge performs one automatic initial `getToken`/`loginWithClerk` exchange per `sessionId`, plus at most one uncached replay-recovery exchange.
- Null token, backend failure, unmount, and session change cannot navigate or apply stale success.
- Replay performs one uncached-token retry; a malformed/non-replay error never does. Further failure requires accessible explicit Retry and never loops.
- Forbidden/conflicting identities can choose `Use another account`; active-session sign-out failure is safe and retryable, and repeated clicks are idempotent.
- Existing-user sign-in and new-user sign-up transfer return only to base-aware `/login`; unsafe final redirects are rejected by the existing redirect utility; 2FA retains the safe destination.
- Clerk is absent on `/register`; the modal closes with Escape; button, pending state, error summary, Retry, account switch, focus, keyboard interaction, reactive locale fallback, and the existing Playwright axe scan pass accessibility tests.

**Red**

- Add boundary, StartupLayout pass-through, Login/register gate, Clerk sign-in/sign-up bridge, locale-change, redirect, account-switch, modal-Escape, and accessibility unit/integration tests.
- Add a Playwright mock test at `e2e/specs/mock/clerk-auth.spec.ts` that replaces only Clerk's browser SDK/network boundary, completes sign-in, observes `/api/auth/clerk`, and reaches the authenticated shell; include failure/retry and dual logout cases.

**Green**

- Add the boundary/provider, direct Login control, session-keyed bridge, English strings, locale mapping, and dual logout wiring.

**Refactor**

- Extract the bridge reducer/state machine if effects become branch-heavy. No redirect is owned by the Clerk component after successful LibreChat handoff.

## Blocking Workflow Closure Tests

### A. Login + local 2FA closure

**SOURCE (seed only):** a real single-node `MongoMemoryReplSet` (transactions enabled) with models created through `createModels(mongoose)`, the scenario's initial User/Balance/Session/ClerkAuthClaim rows, and the contract-faithful Clerk adapter fixture consumed by the HTTP request. Use the real tenant plugin and clear collections between tests without dropping indexes.

**TRIGGER:** `supertest` calls `POST /api/auth/clerk` through the real `preAuthTenant` middleware and actual `api/server/routes/auth.js` router. For 2FA, the same test follows through the real verification endpoint.

**DRIVERS:** awaited HTTP promises; the real model methods; real `setAuthTokens`; a real locally signed JWT/access-token probe. Fake timers drive only explicit expiration/deadline cases. No test claims that an awaited network/database chain is synchronous.

**OBSERVABLE:** HTTP status and exact body; decoded access-token user/provider/tenant/expiry claims; both `refreshToken` and `token_provider=librechat` cookies with the exact existing `HttpOnly`/`SameSite`/`Secure`/`Path`/expiry attributes; real tenant-scoped User and Balance state; a real Session whose `sid`/`jti`/`sub`/tenant/deadline/`expiration` match the verified identity and cookie/JWT cap; the durable claim/fence state; provider/2FA preservation; exact cache invalidation; and protected-probe success. Snapshot every collection per case: pre-commit rejection requires zero User/Balance/Session/claim deltas; replay/revocation requires no new deltas beyond its seeded claim/fence; pre-flush late failure requires the documented User/Balance/claim delta but zero surviving Session and zero cookies. Never rely on state left by another case.

**FORBIDDEN SPAN:** do not mock/reimplement the route handlers, identity state machine, `linkClerkIdentity`, User/Session/ClerkAuthClaim models, exchange/fence methods, `createSession`, `setAuthTokens`, public serializer, or protected probe. Mock only Clerk's cryptographic/profile external adapters with contract-faithful values.

**RED-AT-SEAM:** the first test is 404 before route registration. After registration, force the Clerk adapter to reject and prove no state/cookie is produced, then provide a verified identity and require real persistence plus protected-route success.

**FIXTURE REQUIREMENTS:** save, set, and restore JWT secrets, Clerk configuration, registration/domain, ban, tenant, cookie, and session-expiry environment for every suite; reset mocks and collections before each case; register User, Session, Balance, ClerkAuthClaim, and related models; build `packages/api` and `packages/data-schemas` before the API test; use a fresh replica-set database name; do not wholesale-mock `~/models`.

### B. Webhook-to-session closure

**SOURCE:** real correlated Sessions, durable consumed-token claims/fences, and Users in the same Mongo setup.

**TRIGGER:** send a Standard Webhooks-signed raw request to the actual pre-parser `/api/auth/clerk/webhook` mount for each supported event.

**DRIVERS:** awaited HTTP and real system-scoped model methods.

**OBSERVABLE:** atomically committed revoked-`sid` state with real Session absence; User tombstone/provider preservation; consumed-`jti` claim retention; exact cache invalidations; stable response; immediate refresh failure; and a repeat exchange failing even after Session deletion. An already-issued bearer access token is explicitly allowed to work before its capped expiry because request auth does not introspect Session; advance the fake clock to the cap and then require protected access to fail.

**FORBIDDEN SPAN:** do not mock the Buffer-to-WHATWG-Request adapter, signature validation wrapper, handler, event narrowing, Session/User/ClerkAuthClaim methods, transaction/system context, cache invalidation, refresh route, or protected probe. A deterministic signing fixture may supply external signature inputs.

**RED-AT-SEAM:** before the raw mount the request is 404 or signature verification receives a parsed body and fails. It turns green only when mount order, verification, transactional state/delete dispatch, database mutation, refresh denial, durable replay denial, and bounded bearer expiry all work.

### C. Browser handoff closure

**SOURCE:** startup config enables Clerk; browser starts anonymous at a safe redirecting `/login` URL; Clerk SDK boundary supplies a session ID and token.

**TRIGGER:** click the visible `Continue with Clerk` control and complete the mocked external Clerk modal boundary.

**DRIVERS:** React effects, the real data-provider mutation, real AuthContext success logic, router navigation, and the test server's Clerk endpoint fixture.

**OBSERVABLE:** in the non-replay case exactly one token exchange for the session ID, authenticated shell, sanitized final route, pending/error accessibility state, and active-session Clerk plus local sign-out calls on logout. A separate replay case observes exactly one additional uncached recovery attempt.

**FORBIDDEN SPAN:** do not mock `ClerkLogin`, `loginWithClerk`, dataService, AuthContext, router, or safe-redirect utility. Mock only the browser SDK/network boundary and API fixture data.

**RED-AT-SEAM:** the current UI either lacks the entry point or never posts the token. The closure turns green only when the full SDK-state -> token -> mutation -> context -> router chain completes.

## File Impact Inventory

### Dependencies and lockfile

- `.env.example` (document the complete all-or-nothing key/origin/webhook block, PEM formatting, and loopback-only HTTP rule)
- `package-lock.json`
- `packages/api/package.json`
- `api/package.json`
- `client/package.json`

### Data schemas

- `packages/data-schemas/src/schema/user.ts`
- `packages/data-schemas/src/types/user.ts`
- `packages/data-schemas/src/methods/user.ts`
- `packages/data-schemas/src/methods/user.methods.spec.ts`
- `packages/data-schemas/src/schema/session.ts`
- `packages/data-schemas/src/types/session.ts`
- `packages/data-schemas/src/methods/session.ts`
- `packages/data-schemas/src/methods/session.clerk.spec.ts` (new)
- `packages/data-schemas/src/schema/clerkAuthClaim.ts` (new)
- `packages/data-schemas/src/types/clerkAuthClaim.ts` (new)
- `packages/data-schemas/src/models/clerkAuthClaim.ts` (new)
- `packages/data-schemas/src/methods/clerkAuthClaim.ts` and `clerkAuthClaim.spec.ts` (new)
- `packages/data-schemas/src/schema/index.ts`
- `packages/data-schemas/src/types/index.ts`
- `packages/data-schemas/src/models/index.ts`
- `packages/data-schemas/src/methods/index.ts`
- `packages/data-schemas/src/migrations/clerk.ts` (new)
- `packages/data-schemas/src/migrations/clerk.spec.ts` (new)
- `packages/data-schemas/src/migrations/index.ts`
- `packages/data-schemas/src/index.ts`
- `packages/data-schemas/misc/documentdb/compat.documentdb.spec.ts`

### Typed backend package

- `packages/api/src/auth/clerk/config.ts` and `config.spec.ts` (new)
- `packages/api/src/auth/clerk/verify.ts` and `verify.spec.ts` (new)
- `packages/api/src/auth/clerk/profile.ts` and `profile.spec.ts` (new)
- `packages/api/src/auth/clerk/service.ts` and `service.spec.ts` (new)
- `packages/api/src/auth/clerk/handler.ts` and `handler.spec.ts` (new)
- `packages/api/src/auth/clerk/webhook.ts` and `webhook.spec.ts` (new)
- `packages/api/src/auth/clerk/types.ts` and `index.ts` (new)
- `packages/api/src/auth/user.ts` and `user.spec.ts` (new shared public serializer)
- `packages/api/src/auth/index.ts`
- `packages/api/src/app/metrics.ts` (bounded Clerk outcome counters/timers only)

### Legacy API composition and existing session seams

- `api/server/routes/auth.js`
- `api/server/routes/mountAuth.js` (new composition-only mount shared by normal/experimental entrypoints so one real HTTP parity harness proves the strict pre-auth tenant boundary)
- `api/server/routes/mountClerkWebhook.js` (new composition-only mount shared by normal/experimental entrypoints and the raw HTTP closure so the verified pre-parser boundary is identical)
- `api/server/routes/clerk.js` (new thin raw-webhook route)
- `api/server/routes/index.js` (export the thin webhook route)
- `api/server/routes/config.js`
- `api/server/routes/__tests__/config.spec.js`
- `api/server/index.js`
- `api/server/experimental.js`
- `api/server/index.spec.js`
- `api/server/experimental.spec.js`
- `api/server/routes/auth.clerk.spec.js` (new login/2FA closure)
- `api/server/routes/auth.clerk-webhook.spec.js` (new raw webhook closure)
- `api/server/services/AuthService.js` and focused tests
- `api/server/services/twoFactorService.js` and focused tests
- `api/server/controllers/auth/TwoFactorAuthController.js` and focused tests
- `api/server/controllers/auth/LogoutController.js` and focused tests
- `api/server/controllers/AuthController.js` and refresh regression tests
- `api/server/controllers/UserController.js` (import extracted allowlist)
- `api/server/middleware/limiters/loginLimiter.js` and `loginLimiter.clerk.spec.js`
- `api/server/middleware/checkBan.js` and `checkBan.clerk.spec.js`
- `api/server/middleware/setTwoFactorTempUser.js` and `setTwoFactorTempUser.clerk.spec.js`
- `api/strategies/process.js` and its focused avatar regression test (optional avatar guard only; no Clerk state machine)

### Shared data provider

- `packages/data-provider/src/types.ts`
- `packages/data-provider/src/api-endpoints.ts`
- `packages/data-provider/src/data-service.ts`
- `packages/data-provider/src/data-service.spec.ts` (new)
- `packages/data-provider/src/keys.ts`
- `packages/data-provider/src/config.ts`

### Client

- `client/src/App.jsx`
- `client/src/Providers/ClerkAuthBoundary.tsx` (new)
- `client/src/Providers/clerkLocalization.ts` (new)
- `client/src/Providers/__tests__/ClerkAuthBoundary.spec.tsx` (new)
- `client/src/components/Auth/ClerkLogin.tsx` (new)
- `client/src/components/Auth/Login.tsx`
- `client/src/components/Auth/index.ts`
- `client/src/components/Auth/__tests__/ClerkLogin.spec.tsx` (new)
- `client/src/components/Auth/__tests__/Login.spec.tsx`
- `client/src/data-provider/Auth/mutations.ts`
- `client/src/data-provider/Auth/__tests__/mutations.spec.tsx` (new)
- `client/src/hooks/AuthContext.tsx`
- `client/src/hooks/__tests__/AuthContext.spec.tsx`
- `client/src/common/types.ts`
- `client/src/locales/en/translation.json`
- `client/src/locales/Translation.spec.ts`
- `client/src/routes/__tests__/StartupLayout.spec.tsx`
- `client/src/utils/__tests__/redirect.test.ts`
- `e2e/specs/mock/clerk-auth.spec.ts` (new)

If implementation discovery reveals an additional file, add it to this inventory and explain why before editing it. Do not create a business-logic-heavy `api/server/controllers/auth/ClerkController.js`.

## Validation Commands

Run on Node `24.16.x`, from the repository root unless a command changes directory:

```bash
nvm use 24.16.0
node --version # must print v24.16.0
npm install
npm ls @clerk/react @clerk/backend @clerk/localizations
npm run build:data-provider
npm run build:data-schemas
npm run build:api

cd api
node -e "const m = require('@librechat/api'); for (const k of ['resolveClerkAuthConfig', 'verifyClerkSessionToken', 'createClerkAuthHandlers']) if (typeof m[k] !== 'function') throw new Error('missing built Clerk export: ' + k)"

cd ../packages/data-schemas
npx jest src/methods/user.methods.spec.ts src/methods/session.clerk.spec.ts src/methods/clerkAuthClaim.spec.ts src/migrations/clerk.spec.ts --runInBand

cd ../api
npx jest src/auth --runInBand

cd ../../api
npx jest server/index.spec.js server/experimental.spec.js server/routes/__tests__/config.spec.js server/routes/auth.clerk.spec.js server/routes/auth.clerk-webhook.spec.js --runInBand
npx jest server/middleware/limiters/loginLimiter.clerk.spec.js server/middleware/checkBan.clerk.spec.js server/middleware/setTwoFactorTempUser.clerk.spec.js --runInBand
npx jest server/services server/controllers/auth server/controllers/AuthController --runInBand

cd ../packages/data-provider
npx jest src/data-service.spec.ts --runInBand

cd ../../client
npx jest src/Providers/__tests__/ClerkAuthBoundary.spec.tsx src/components/Auth/__tests__/ClerkLogin.spec.tsx src/components/Auth/__tests__/Login.spec.tsx src/data-provider/Auth/__tests__/mutations.spec.tsx src/hooks/__tests__/AuthContext.spec.tsx src/routes/__tests__/StartupLayout.spec.tsx src/utils/__tests__/redirect.test.ts src/locales/Translation.spec.ts --runInBand
npm run typecheck

cd ..
npm run e2e:prepare
npx playwright test e2e/specs/mock/clerk-auth.spec.ts --config=e2e/playwright.config.mock.ts
npx playwright test e2e/specs/a11y.spec.ts --config=e2e/playwright.config.a11y.ts
npm run lint
npm run sort-imports:check
```

Run the supported instance-based DocumentDB live gate in its dedicated environment (never a shared database):

```bash
cd packages/data-schemas
DOCUMENTDB_EXPECT_PARTIAL_INDEXES=true \
DOCUMENTDB_EXPECT_TRANSACTIONS=true \
DOCUMENTDB_URI="mongodb://user:pass@host:27017/librechat_clerk_compat?tls=true&retryWrites=false" \
DOCUMENTDB_TLS_CA_FILE="global-bundle.pem" \
npx jest --config misc/documentdb/jest.documentdb.config.mjs --runInBand
```

Extend the live harness so `DOCUMENTDB_EXPECT_TRANSACTIONS=true` hard-asserts its existing transaction probe as supported, alongside the partial-index hard assertion. This is not silently skipped as proof of compatibility; record it as separately required when credentials are unavailable, including the engine version and instance/elastic topology.

## Review Finding Traceability

| Review finding                                                                                 | Required resolution in this plan                         |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Default token lacks email/email verification                                                   | Fixed Contracts 2; Behavior 3                            |
| Missing authorized parties, pending-session handling, audience decision, JWKS/profile deadline | Fixed Contracts 1–2; Behavior 3                          |
| Same-email/different-sub takeover and provider overwrite                                       | Fixed Contracts 3–4; Behavior 4                          |
| Non-atomic linking and stale auth cache                                                        | Fixed Contract 3; Behavior 4                             |
| Tenant-unscoped lookup despite tenant indexes                                                  | Fixed Contract 3; Behaviors 2 and 4                      |
| Missing canonical fields, filters, result types, projections                                   | Fixed Contract 4; Behavior 2                             |
| Schema-only index with auto-index disabled                                                     | Fixed Contract 5; Behaviors 1–2                          |
| Registration/domain/ban/balance/appConfig bypass                                               | Fixed Contract 6; Behavior 5                             |
| Business logic in legacy JavaScript                                                            | Corrections; typed package file inventory; Behaviors 3–5 |
| Missing package/runtime dependency ownership and build ordering                                | Fixed Contract 1; Behavior 1                             |
| Missing request/response/endpoint/service/key/hook/context surfaces                            | Fixed Contracts 6 and 10; Behavior 9                     |
| Wrong error literal and unsafe response spread                                                 | Fixed Contract 9; Behaviors 5–6                          |
| UI never calls `getToken`/`loginWithClerk`; deprecated package/props                           | Fixed Contract 10; Behavior 10                           |
| Clerk hidden by generic social-login gate                                                      | Fixed Contract 10; Behavior 10                           |
| Redirect race/unsafe navigation                                                                | Fixed Contract 10; Behaviors 9–10                        |
| Local 2FA bypass                                                                               | Fixed Contract 7; Behaviors 6–7                          |
| Replay/session proliferation/orphan late failures                                              | Fixed Contract 7; Behaviors 6–7                          |
| Clerk/local logout and revocation/deletion mismatch                                            | Fixed Contract 8; Behaviors 8–10                         |
| Closure test mocked the claimed real seam and omitted models/env/reset/build                   | Blocking closures A–C; Behavior 7                        |
| Raw webhook parser/mount gap                                                                   | Fixed Contract 8; Behavior 8; closure B                  |
| Missing avatar and upstream failure behavior                                                   | Fixed Contracts 2–3; Behaviors 3–4                       |
| Cleanup concerns: nested state machine, unstable callback, mutation side effects               | Behaviors 4, 5, 9, and 10 Refactor steps                 |
| Missing observability and immutable relink policy                                              | Fixed Contracts 4 and 8; Behaviors 4 and 8               |
| Invalid synchronous/test-driver and incompatible property-test claims                          | Behavior 3 Red; Blocking closure A DRIVERS               |

## Definition of Done

The enhanced plan has passed clean backend/data-model, frontend/shared-config, and lifecycle/closure re-audits. Implementation is done when:

- every Red test is observed failing for the intended missing behavior before its Green change;
- all three closure tests pass without mocking a forbidden span;
- enabled startup fails closed on invalid config or index assurance and succeeds with automatic indexes disabled;
- every pre-header auth failure sets no cookies and exposes only a stable code, while post-commit transport failure follows the explicit retain-and-log contract;
- concurrency, tenant isolation, cache invalidation, 2FA, replay, rollback, webhook revocation, expiry, and dual logout tests pass;
- type-checking proves the shared browser chain and internal/public User boundary;
- lint, targeted suites, package builds, and the Clerk Playwright path pass on Node 24.16;
- the final implementation report records DocumentDB compatibility status separately if its live environment was unavailable.

## Primary External Contracts

- [Clerk session token claims](https://clerk.com/docs/guides/sessions/session-tokens)
- [Clerk Backend `verifyToken`](https://clerk.com/docs/reference/backend/verify-token)
- [Manual JWT verification, including pending sessions and authorized parties](https://clerk.com/docs/guides/sessions/manual-jwt-verification)
- [Clerk Backend User and primary email fields](https://clerk.com/docs/reference/backend/types/backend-user)
- [Clerk EmailAddress verification shape](https://clerk.com/docs/reference/backend/types/backend-email-address)
- [Clerk React `useAuth`](https://clerk.com/docs/react/reference/hooks/use-auth)
- [Current Clerk React `SignInButton`](https://clerk.com/docs/react/reference/components/unstyled/sign-in-button)
- [Current Clerk React `ClerkProvider`](https://clerk.com/docs/reference/clerk-react/clerkprovider)
- [Clerk localization package and provider contract](https://clerk.com/docs/guides/customizing-clerk/localization)
- [Clerk Backend `verifyWebhook`](https://clerk.com/docs/reference/backend/verify-webhook)
