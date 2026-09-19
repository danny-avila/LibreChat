# Authorization and identity transition audit

Audited LibreChat `ba006f387` against merge base `385c6f8a1a42b5facdea5a9de5d00dd5e428ce45` (target `origin/dev` tip `c7665ab1`). Read the first integration audit, then traced owner/tenant queries, HTTP and native creation, background dispatch/reconciliation, shared credential writes, and bearer/cookie content access. No production source changes.

## AUTH-01 — P2: harmless saved-key changes invalidate native history and in-flight job bindings

**Trigger and impact.** Generate a native Google reply using a saved provider key, then save the same API key with a longer expiration. The provider account, API root, and actual request headers are identical, but continuing the saved conversation fails with `not_found`. Adding or updating the unrelated `GOOGLE_SERVICE_KEY` in the shared Google credential envelope also invalidates that native history. The same binding comparison runs before every worker operation, so this also rejects queued work and interrupts submitted-job reconciliation as `credentials_required`. The latter impact is source-traced; the probe directly reproduces native restoration.

The ordinary key dialog computes a fresh expiry on save at [SetKeyDialog.tsx:245](../../../../client/src/components/Input/SetKeyDialog/SetKeyDialog.tsx#L245). The shared [key handler](../../../../packages/api/src/endpoints/user/keys.ts#L68) writes that expiry, and its Google-specific path preserves the existing service-account field. Both values are legitimate metadata in the existing credential system.

The mismatch crosses these boundaries:

1. [getStoredMediaCredential](../../../../packages/data-schemas/src/methods/media.ts#L1654) computes `bindingRevision` from the database row ID, **the entire encrypted envelope**, and `expiresAt`.
2. [createMediaCredentialResolver](../../../../packages/api/src/media/credentials.ts#L166) includes that revision in the connection binding, even though the final binding already includes a digest of the actual API key at line 216.
3. [getMediaNativeContinuation](../../../../packages/data-schemas/src/methods/mediaNative.ts#L535) requires exact equality with the binding stored on the original job. [Native restore](../../../../packages/api/src/media/native.ts#L284) turns a mismatch into a hard `not_found` error.
4. [Worker execution](../../../../packages/api/src/media/worker.ts#L131) also compares the connection binding before dispatch, polling, cancellation, and recovery. Extending credential lifetime therefore looks like replacing the provider account.

**Reproduction.** [authorization.cjs](probes/authorization.cjs) uses a disposable MongoDB, the actual key methods and encryption, credential resolver, native recording methods, and native factory `restore`. It proves all of these assertions:

| Transition | Observed result |
| --- | --- |
| Initial completed native recording | Restores successfully |
| Re-save exact same envelope and expiry | Binding preserved |
| Extend expiry; same API key | Headers unchanged; binding changes; native restore returns `not_found` |
| Add unrelated Google service-account envelope; same API key | Headers unchanged; binding changes; native restore returns `not_found` |
| Restore with a different owner or tenant | Rejected |
| Change the API key | Old continuation rejected |
| Delete the saved key | Resolver returns `credentials_required` |

Exact re-saving is stable with the current deterministic legacy encryption. This is **not** a claim that any save necessarily changes the binding. Restoring the exact old expiry/envelope restored access in the probe; the data was not deleted. The normal user workflow offers no way to recover the original expiry timestamp precisely.

**Reuse recommendation.** Keep credential existence, lifetime, and revocation checks at the existing saved-key boundary. Derive provider-account binding from the row/revocation identity and the effective API secret, API root, and other account-relevant settings. Do not bind it to expiry metadata or credentials for another Google mode. Keep row identity or an explicit revocation generation so delete-and-recreate remains distinguishable from a metadata edit. Share this descriptor between admission, dispatch, and native restoration instead of defining an independent continuation exception. Verify changed secret/root and genuine revocation still fail closed. Existing stored binding hashes need a considered compatibility strategy; merely changing the hash algorithm strands all old records.

**Missing regression coverage.** Add an integration test that creates a real native recording, updates the same saved credential through the shared key handler, then continues the conversation. Include expiry extension, switching between finite and indefinite lifetime, unrelated Google service-key changes, changed API key, delete/recreate, and owner/tenant substitution. Add worker cases for the same transitions after acceptance and after remote submission, with no duplicate provider submission. The existing runtime expiry/rotation tests at [runtime.spec.ts:1280](../../../../packages/api/src/media/runtime.spec.ts#L1280) only test revoked, expired, and genuinely changed keys.

## Findings challenged and transition coverage

| Surface/invariant | Audit result |
| --- | --- |
| Owner and tenant filtering | Media methods scope queries with both owner and tenant and reject conflicting ambient tenant context. The continuation probe verifies foreign owners and tenants cannot restore the reference. No cross-owner/tenant read was demonstrated. |
| Actor changes while queued | [runtime.ts:144](../../../../packages/api/src/media/runtime.ts#L144) reloads the owner and rejects a missing user or changed tenant. It resolves current app config and role. [worker.ts:108](../../../../packages/api/src/media/worker.ts#L108) rejects disabled integrations; the queued branch checks use/create permissions and global enablement before submit. These are present; do not report missing reauthorization generally. |
| Actor/config changes after remote submission | Polling/reconciliation deliberately does not require create permission. Finishing accounting and handling already accepted work is separate from authorizing another paid submission. Continuing reconciliation after `CREATE` removal or feature disablement is not independently an authorization defect. Genuine credential revocation blocks further provider access; unresolved attention-state recovery remains the first audit's separate lifecycle finding. |
| Existing content after Studio is disabled | Content uses authenticated ownership instead of Studio create/use grants. This preserves ordinary chat attachments; a `media.enabled = false` toggle is not evidence that previously owned files must become unreadable. The source stream suite explicitly exercises this contract. |
| Cookie authentication | Shared helper verifies signed user identity, matches hashed OpenID identity to refresh token, checks durable sessions, loads current user in system scope, and rejects account deletion fences before assigning `req.user`. Legacy un-hashed OpenID identity still requires the active Express-session token. Bearer identity is reused, not overwritten. |
| Cookie mutation boundary | Cookie auth is mounted on `/api/media/assets`; media mutation routes remain under required bearer authentication. The content router only registers GET/HEAD. No cookie-authenticated mutation was found. |
| Logout/revoked sessions | Shared cookie tests and content tests reject revoked sessions, missing users, and account deletion fences. Tests verify legacy OpenID session binding and mismatched refresh-token hashes. This does not prove every multi-process OpenID rotation/logout race; that subsystem is mostly pre-existing and was not exhaustively retested here. |
| Browser content projection | Asset/rendition reads share the owner check, return `private, no-store` and `nosniff`, bound ranges, avoid object reads for HEAD, and abort reads on browser disconnect. All corresponding source tests passed. |
| Native image access | New native image recording requires explicit media use/create permission, enabled feature, matching Google integration, enabled chat surface, storage readiness, and a saved conversation. Native restore requires ownership and connection binding. The first audit's plain-text credential-expiry regression remains separate and valid. |
| Auth cache invalidation | No new mutation of the User document was found in this media path. Reading current role/config does not itself need cache invalidation. Existing deletion/role mutation paths remain responsible for the shared auth cache. |
| Abuse policy and admin deletion | The first audit's missing ban/rate/moderation hooks and alternate admin deletion path remain specific omissions; neither means all authentication/authorization is absent. No new duplicate finding is added for them here. |

## Verification and limits

`node docs/research/media-studio/audit/probes/authorization.cjs` passed. It uses the locally built workspace exports plus a disposable MongoDB, synthetic keys, and synthetic provider data. The final run made no provider HTTP requests. The probe disables inherited Meilisearch settings; an initial harness run before that isolation attempted Meilisearch initialization and failed to connect, then failed on an unexported helper. The corrected probe uses the exported `createMethods` and completed successfully. Closing the disposable database logged an interrupted background Conversation index build after the assertions; exit code was 0.

From `packages/api`, `npx jest src/images/cookies.spec.ts src/images/authorization.spec.ts src/media/stream.spec.ts --runInBand --coverage=false --silent` passed **3 suites / 52 tests** against source. These provide present-contract coverage, not a test for AUTH-01. No production workspace changed, so no new typecheck or Lighthouse run was necessary for this read-only specialist audit. Full-system login, external identity providers, and live provider credential rotation were not exercised.
