---
date: 2026-08-12T20:36:07-04:00
reviewed_plan: thoughts/searchable/shared/plans/2026-08-12-20-05-tdd-clerk-auth-integration.md
plan_sha256: 134a0402642a3c1dcc2ea5b4b290b58c5958ca959ed4e1c7e215f5f5b503f9ac
git_commit: cc84c390a6debcf51e10f904ab6512630c48a056
branch: main
decision: needs-major-revision
review_issue: AF-xy5a
follow_up_issues: [AF-dao4]
---

# Review: Clerk Authentication Integration TDD Plan

## Decision

> **❌ Needs major revision before implementation.**

The plan has the right broad shape—Clerk verifies an external identity, LibreChat
resolves a local user, and the existing session issuer returns the local token and
cookies—but its central operation chain is not closed and several identity
contracts are unsafe. A default Clerk session token does not carry the email proof
the plan consumes, the proposed browser component never exchanges its Clerk token,
and the linker's email branch can authenticate a different Clerk subject to an
existing account. The link is also non-atomic, changes the user's primary provider,
and bypasses existing tenant, registration, domain, ban, balance, 2FA, and session
lifecycle decisions.

The core backend implementation is additionally placed in legacy JavaScript even
though `CLAUDE.md` requires new backend business logic in TypeScript under
`packages/api`, with database-specific mutations in `packages/data-schemas`.

This decision is based on the repository at the commit recorded above, direct code
inspection, six independent review lenses, the seven CodeCleanup plan-hygiene
gates, and current primary Clerk documentation. The source plan and implementation
were not edited.

## Review summary

Counts are category-local. Findings overlap intentionally when one defect breaks
more than one contract.

| Category    | Status | Critical | Other | Main concerns                                                                    |
| ----------- | -----: | -------: | ----: | -------------------------------------------------------------------------------- |
| Contracts   |     ❌ |       10 |     4 | Layer ownership, claim authority, link invariants, policy, tenant scope, closure |
| Interfaces  |     ❌ |        6 |     4 | Browser handoff, shared types/services, middleware order, dependency ownership   |
| Promises    |     ❌ |        7 |     5 | Concurrency, timeouts, 2FA, logout/revocation, replay, redirects                 |
| Data models |     ❌ |        5 |     3 | Type coverage, index rollout, atomic binding, nullable claims, session relation  |
| APIs        |     ❌ |        9 |     1 | Current SDKs, `azp`, config gate, exact errors/cookies, compiled exports         |
| CodeCleanup |     ❌ |        4 |     2 | Dead error mapping, hidden state, provider mutation, unimplemented effect        |

## Critical blockers

### 1. The plan assumes email claims that Clerk session tokens do not provide by default

Behavior 2 casts the generic verified payload to a shape containing `email` and
`email_verified`, and Behaviors 3–4 treat those optional values as authoritative.
Clerk's default session-token claims include subject/session and verification
metadata, but not email profile fields. Email requires either deliberately
configured custom claims or a Backend User lookup. A TypeScript assertion neither
validates nor creates those fields.

With the proposed code, a valid default token can reach `findUser({ email:
undefined })` and then attempt to create a User whose schema requires an email.
This makes the advertised first-login path fail and leaves verified-email linking
without a trustworthy proof.

**Required amendment:** introduce a runtime-validated
`VerifiedClerkIdentity`. Verify the default session token, require a non-empty
`sub`, then on local `clerkId` miss fetch `clerkClient.users.getUser(sub)`, select
the address identified by `primaryEmailAddressId`, and derive verification only
from `address.verification.status === 'verified'`. Define named responses for no
primary email, unverified email, Clerk 404/429/5xx, and timeout. If custom claims
are chosen instead, include the exact dashboard template, runtime schema, token
template name, audience, and deployment test in the plan.

Primary references: [session-token claims](https://clerk.com/docs/guides/sessions/session-tokens),
[custom claims](https://clerk.com/docs/guides/sessions/customize-session-tokens),
[Backend `getUser`](https://clerk.com/docs/reference/backend/user/get-user), and
[Backend email verification](https://clerk.com/docs/reference/backend/types/backend-email-address).

### 2. The account-link state machine permits subject confusion and provider breakage

The proposed flow misses by incoming `sub`, finds a User by email, and returns that
record immediately when `provider === 'clerk'`. It never proves that the stored
`clerkId` equals the incoming subject and does not require verified email on that
branch. A different Clerk subject with the same email can therefore be issued a
session for the existing account. The other collision branch can overwrite a
different non-empty `clerkId`.

The link write also changes `{ provider: 'clerk' }`. Current social login requires
the stored provider to match the provider being used, and `provider` is embedded in
LibreChat JWTs and drives settings/logout behavior. A link that was specified as
adding `clerkId` can therefore disable or alter the original login method and local
2FA/settings semantics.

**Required invariants:**

1. Exact `clerkId === incomingSub` is the only ID-based success.
2. An email match with a different non-empty `clerkId` always rejects.
3. An email-only match may link only from an authoritative verified primary email.
4. Linking an existing User writes only `clerkId`; it preserves `provider`,
   password, and all other provider IDs.
5. Unverified, missing, blank, or malformed email never links, regardless of the
   existing provider label.
6. Tests cover same-email/different-sub, an already-linked cross-provider User,
   repeat Clerk login, and successful login through the original provider after
   linking.

### 3. Linking must be an atomic, tenant-scoped data-schema operation

The proposed read/read/write sequence allows two Clerk subjects to observe the
same unlinked email User and race to overwrite `clerkId`; both requests may receive
sessions. Concurrent first logins can also surface a unique-index race as a generic
500 instead of converging idempotently. The proposed lookups are unscoped even
though email and provider-ID indexes are tenant-scoped.

**Required amendment:** add a data-schema-owned conditional operation such as
`linkClerkIdentity({ tenantId, userId, clerkId })`. Its filter must require the
target User's `clerkId` to be absent or already equal, and its result must
distinguish linked, already-linked-same, and conflict. On a lost update or E11000,
re-read in the same tenant and succeed only when the final binding identifies the
same User and subject. Issue a session only after final binding confirmation.

Every successful User mutation must invalidate the affected auth user-document
cache. The existing `updateUser` does this at
`packages/data-schemas/src/methods/user.ts:261-294`; the new atomic method must
preserve the same guarantee. Add enabled-cache and real-Mongo concurrent-link
tests. The closure test must mount `preAuthTenantMiddleware` and exercise two
tenant contexts.

### 4. There is no production index rollout or complete User type contract

Adding `clerkId` to the provider-ID schema array declares the desired unique
tenant-scoped partial index, but production can run with `MONGO_AUTO_INDEX=false`.
The proposed manual `syncIndexes()` check is not a rollout, and blanket
`syncIndexes()` has DocumentDB compatibility implications. Without an explicit
deployment step, tests may pass while production accepts duplicate subjects.

The field is also absent from `IUser`, `UserFilterOptions`, and two hand-written
internal full-user result shapes. Public projections require an explicit decision:
`clerkId` should remain internal by default, not leak through the proposed
denylist-based auth response.

**Required amendment:** add an idempotent, compatible index migration that creates
and verifies the exact named key/options, performs duplicate preflight, and keeps
the Clerk endpoint disabled or fails deployment when the index cannot be assured.
Test same ID/same tenant rejection, same ID/different tenant allowance,
`MONGO_AUTO_INDEX=false`, missing/null/empty values, and exact index options. Add
`clerkId` to complete server-side type/filter/internal-result surfaces and define a
projection matrix that excludes it from public User DTOs unless a use case is
approved.

### 5. Existing registration, domain, ban, balance, and tenant policy is bypassed

Current social login resolves base/tenant app configuration, enforces allowed
domains and `ALLOW_SOCIAL_REGISTRATION`, and passes `appConfig` into user creation.
The proposed Clerk resolver does none of these. Its route orders `checkBan` and
`setBalanceConfig` before verification/resolution, when `req.user` is unset and the
request contains only `clerkToken`. User-level bans are therefore skipped and
balance initialization becomes a no-op.

**Required amendment:** split the operation into explicit stages:

```text
IP limiter
  -> verify token and resolve authoritative Clerk identity
  -> tenant-scoped local identity resolution
  -> establish candidate req.user
  -> user-aware ban check before any link/create mutation
  -> registration/domain/appConfig policy
  -> atomic link or create
  -> assign final req.user
  -> balance middleware
  -> session issuance and response
```

If the ban layer needs the User before linking, resolution must remain read-only
until that check passes. Add tests for a banned linked User with zero mutation and
cookies, disabled social registration, blocked domain, tenant-specific config, and
starting balance.

### 6. The browser never completes Clerk-to-LibreChat authentication

The proposed `ClerkSignInInner` reads `getToken` and `loginWithClerk` but never
calls them; the only executable behavior renders `<SignIn>` and redirects. The
component test checks visibility only, so the plan can go green without one POST to
`/api/auth/clerk`. LibreChat authentication and navigation occur only after
`setUserContext`; a Clerk-owned early redirect races that boundary.

The planned package and prop are also stale. Current Clerk React uses
`@clerk/react`, and current redirect options use `forceRedirectUrl` and
`fallbackRedirectUrl`, not `afterSignInUrl`.

**Required amendment:** pin a supported current package and define a single-flight
bridge beneath `ClerkProvider`. After `isLoaded && isSignedIn`, acquire a non-null
token once per Clerk session, await `loginWithClerk`, handle null/offline/rejection
and unmount, and let LibreChat mutation success own the sole final safe redirect.
Test loading → signed-in → `getToken` → exactly one mutation → navigation, plus null
token, token rejection, backend rejection, rerender deduplication, and deep-link
preservation. See the current [React quickstart](https://clerk.com/docs/react/getting-started/quickstart),
[`useAuth`](https://clerk.com/docs/react/reference/hooks/use-auth), and
[`SignIn`](https://clerk.com/docs/react/reference/components/authentication/sign-in).

### 7. New business logic is assigned to the wrong repository layer

The plan puts the identity/link state machine in `api/strategies/process.js` and a
substantial controller in `api/server/controllers/auth/ClerkController.js`.
`CLAUDE.md` requires new backend code in TypeScript under `packages/api`, with
minimal thin JavaScript wrappers in legacy `api/`. `process.js` is an avatar/user
creation helper and is not an appropriate home for the feature's security policy.

**Required amendment:** put the validated Clerk identity adapter, policy-aware
resolution service, typed result/error union, and orchestration in `packages/api`.
Put the conditional Mongo mutation in `packages/data-schemas`. Keep the legacy
route/controller as thin request/response adapters. Export and build the package
before testing the legacy consumer.

### 8. Shared interfaces and runtime dependency ownership are incomplete

The client mutation has no complete endpoint → data service → mutation interface.
`TAuthContext` does not declare `loginWithClerk`, and the planned function is not
`useCallback`-stable before being inserted into the context memo. Reusing
`TLoginResponse` is too weak because its token and user are optional for local 2FA
flows.

`packages/api` externalizes third-party dependencies and the legacy backend loads
its compiled CommonJS output. Adding `@clerk/backend` only to the package can pass
in a hoisted workspace while failing in the runtime consumer.

**Required amendment:** name and test all compile surfaces:

- `TClerkLoginRequest = { clerkToken: string }`;
- required `TClerkLoginResponse = { token: string; user: TUser }`;
- endpoint, `dataService.loginClerk`, and `MutationKeys.loginClerk`;
- `useClerkLoginMutation` lifecycle;
- stable `TAuthContext.loginWithClerk`;
- `@clerk/backend` peer/runtime ownership in `packages/api` and dependency in
  `api/package.json`;
- `@clerk/react` in the client and the root lockfile;
- Node 24 build followed by a clean runtime smoke assertion that
  `require('@librechat/api').verifyClerkToken` resolves from `dist`.

### 9. Token verification and HTTP contracts are incomplete

The wrapper passes only `secretKey`. Clerk recommends `authorizedParties` to bind
the token's `azp` to an allowed frontend origin. The plan also leaves pending
session status, audience policy, JWKS/network deadlines, and abort behavior
undefined. A remote profile/JWKS stall can hold a request indefinitely; it is not a
synchronous edge.

The request handler does not validate body/token type or size, compares
`err.code === 'AUTH_FAILED'` even though `ErrorTypes.AUTH_FAILED` is the lowercase
wire value `auth_failed`, returns internal error messages, and spreads a database
User after deleting only three fields. The legacy `refreshToken` and other internal
fields can leak.

**Required amendment:** validate a bounded non-empty string body; configure exact
authorized origins and test wrong `azp`; decide pending-session and audience policy;
prefer `CLERK_JWT_KEY` for networkless verification or define an abortable deadline;
and use a closed typed error-to-status mapping. Compare named constants, not enum
member names. Return an allowlisted public User DTO. Assert stable JSON and zero
cookies for every failure, and both `refreshToken` and
`token_provider=librechat` with inherited attributes on success. Clerk's verifier
options are documented at [`verifyToken`](https://clerk.com/docs/reference/backend/verify-token).

### 10. The closure test does not close the declared production chain

The test claims the real verifier is inside its forbidden-to-mock span, then mocks
`verifyClerkToken` itself. This hides verification options, normalized identity,
package exports, and compiled-output wiring. It registers only User despite
`setAuthTokens` persisting a Session, omits JWT secrets and database reset, checks
only one cookie, and lets the invalid-token test observe state left by the success
test.

**Required amendment:** either mock Clerk SDK/JWKS/profile transport below the real
wrapper or accurately narrow the declared closure. Build `packages/api` first,
register the real model set with the established `createModels(mongoose)` pattern,
set/restore JWT env, reset Mongo/mocks per test, and assert the persisted Session,
decoded access-token identity, public User DTO, both cookies, tenant ownership,
balance/ban behavior, and zero writes/cookies for every pre-session failure.

## Promise and lifecycle decisions still required

### Local 2FA

Local login returns a temporary 2FA response before session issuance, but the Clerk
controller directly issues a full session for linked users. Decide explicitly
whether Clerk is an authoritative MFA boundary with documented deployment policy,
or whether linked `twoFactorEnabled` Users must complete LibreChat's local 2FA flow.
Use a response union and closure test that match that decision.

### Logout, revocation, deletion, and replay

A successful exchange creates independent Clerk and LibreChat sessions. LibreChat
logout does not sign out Clerk, and Clerk revocation/deletion cannot identify or
revoke the local refresh Session. Returning to `/login` while Clerk remains signed
in can also trigger an immediate re-login loop. Reposting the same Clerk token
creates unbounded independent LibreChat Sessions.

Choose one contract before implementation:

- couple sessions by carrying Clerk `sid` into an indexed local Session field and
  revoke all derived local sessions on verified provider events; or
- explicitly accept independent sessions, document the maximum residual lifetime,
  shorten/limit local sessions, and track revocation coupling as a release blocker.

In both cases, define dual logout, repeat-exchange/idempotency behavior, cross-tab
behavior, and User deletion cascading. Do not call revocation “out of scope” without
stating the resulting authorization window.

### Late session failure

`setAuthTokens` saves a Session before its later User lookup, signing, and cookie
work. Distinguish pre-identity failures, which must make zero writes, from a late
session-issuance failure. Either delete an orphan created during a late failure or
document and test the existing non-transactional behavior.

## Startup configuration amendments

The proposed payload can expose `clerkPublishableKey` when the secret is absent,
contradicting its own promise that the field is omitted while disabled. The route
is always mounted and has no shared disabled/misconfigured gate.

Add one configuration resolver used by both `/api/config` and `/api/auth/clerk`.
`clerkLoginEnabled` should become true only when all required key and authorized
origin inputs are valid; expose the publishable key only then, and never serialize
secret/JWT/origin internals. Extend the existing
`api/server/routes/__tests__/config.spec.js` with all key-presence combinations and
both anonymous/authenticated payloads. Render Clerk directly on the Login page if
its only product gates are the new startup fields; placing it behind
`SocialLoginRender` also makes it depend on `socialLoginEnabled` and a provider list
whose defaults do not include Clerk.

## CodeCleanup plan-hygiene audit

| Gate                               | Result | Required response                                                    |
| ---------------------------------- | -----: | -------------------------------------------------------------------- |
| No side effects in conditionals    |     ✅ | Proposed questions are pure; preserve that property                  |
| No mutation in control expressions |     ✅ | No assignments/mutators appear in conditions                         |
| Never Nesting                      |     ⚠️ | Flatten the identity decision into named lookup results and guards   |
| Named constants over literals      |     ❌ | Use `ErrorTypes.AUTH_FAILED`; preserve persisted provider semantics  |
| Control-expression discipline      |     ❌ | Enumerate the hidden different-sub/provider state explicitly         |
| Maintainability recovery           |     ❌ | Move policy to typed foundations; make the browser effect executable |
| Review-only execution mode         |     ✅ | No source plan or implementation code was changed                    |

Do not mechanically flatten the link state machine before its behavior is pinned.
Keep ID-before-email lookup order and error precedence, use
`emailVerified === true` rather than truthiness, and serialize database effects only
after a pure typed decision. `loginWithClerk` must be `useCallback`-stable before it
enters the context memo dependency list.

## Suggested plan amendment

```diff
+ Phase 0: lock current Clerk package majors, default-token identity source,
+ authorized-origin policy, tenant source, error schema, 2FA/session authority,
+ and production index rollout before implementation.

  Behavior 1 — User schema and index
+ add clerkId across server-side IUser/filter/internal result contracts
+ define internal/public projection policy; keep clerkId out of auth JSON by default
+ add compatible idempotent production create-index migration and failure gate
+ test exact options, autoIndex=false, tenant separation, null/empty values

  Behavior 2 — Clerk verification
- cast verified JWT to optional email/email_verified claims
+ validate default session claims and authorizedParties/azp at runtime
+ fetch/normalize primary Clerk email on local clerkId miss
+ define pending-session, audience, timeout/JWKS, and typed dependency failures

  Behavior 3 — local identity resolution
- place state machine in api/strategies/process.js
- update { clerkId, provider: 'clerk' }
+ implement typed resolution in packages/api
+ implement tenant-scoped conditional link in packages/data-schemas
+ preserve provider; make clerkId immutable; recover races by consistent re-read
+ preserve auth user-document cache invalidation
+ thread registration/domain/appConfig policy through creation

  Behavior 4 — HTTP closure
+ resolve candidate identity before user-aware checkBan; assign final req.user before balance
+ use a closed error map and allowlisted public user DTO
+ build packages/api and keep verifier real while mocking only Clerk transport
+ register/reset real models/env and assert Session, both cookies, and zero-failure writes

  Behavior 5 — startup config
+ use one fail-closed config resolver for config payload and endpoint gate
+ test all key/origin combinations in the already-known config.spec.js

  Behavior 6 — shared client contract
+ add strict request/response, endpoint, dataService method, mutation key, hook,
+ TAuthContext method, stable callback, peer/consumer dependencies, and lockfile

  Behavior 7 — React completion
- render deprecated package/prop and leave token handoff as a comment
+ implement a current @clerk/react single-flight signed-in bridge
+ POST before LibreChat-owned redirect; test null/error/dedup/deep-link paths

+ New blocking behavior: define linked-user 2FA and Clerk↔LibreChat
+ logout/revocation/deletion/replay semantics, including Clerk sid if coupled.
```

## Approval checklist

- [ ] Ready for implementation
- [ ] Needs minor revision
- [x] **Needs major revision**

The revised plan should be reviewed again before any implementation begins.
