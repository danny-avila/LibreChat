# Username-Only Login: Investigation and Decision

**Date:** 2026-05-21
**Status:** Implemented (see commit history for the patch)
**Author:** Pato Montecchiarini

## Context

LibreChat's stock signup/login flow requires an email-formatted identifier. For Lexaeon's Synthetic Persona Engine (SPE) use case, this is a poor fit:

- Personas are bots without real email infrastructure
- There is no SMTP and no plan to add one
- The email field's only function on the platform is as an identifier, with verification already disabled (`ALLOW_EMAIL_VERIFICATION=false`)
- Lex's explicit requirement: "use usernames instead of emails for the login"

We needed to allow plain username login (`alice` instead of `alice@spe.local`) without breaking the rest of LibreChat's auth machinery.

## Where the email constraint lives

Email is wired through the system in three layers:

1. **Mongoose unique index** on `(email, tenantId)` plus a `required: true` + regex match constraint on the field itself (`packages/data-schemas/src/schema/user.ts:31-46`).
2. **Zod schemas** (`registerSchema` / `loginSchema`) shared between frontend and backend that call `z.string().email()` (`api/strategies/validators.js:33-66`).
3. **~20+ i18n strings**, several UI components, and the password-reset / verify / resend flows that key off the `email` field name.

The codebase does NOT broadly assume email contains `@`. The value is mostly opaque to most code paths; only `packages/api/src/auth/domain.ts` (domain allowlist) and `api/strategies/appleStrategy.js` (OAuth) parse the `@`. Both are safe to leave alone.

There is already a `username` field on the User schema (`lowercase: true`, default `''`, no uniqueness constraint). It's just unused for login.

## Options considered

### Option 1: Minimum-viable fork patch (chosen)

Keep email internally as a synthetic field (`<username>@spe.local`). Relax validators to accept plain usernames at the wire. Synthesize the email server-side. Remove the email input from the UI.

- **Effort:** ~3-5 hours
- **Source changes:** ~70-130 lines
- **Schema changes:** none
- **Upstream rebase pain:** low (surgical edits)

This pattern already exists in the codebase for LDAP auth (`api/strategies/ldapStrategy.js:106` uses `username + '@ldap.local'` for the same reason).

### Option 2: Clean patch — remove email entirely

Delete the email field from the schema, remove email-dependent code paths (verify, reset, welcome emails), drop email from the JWT payload, add a `username` unique index, write a migration.

- **Effort:** ~10-14 hours
- **Source changes:** ~500-700 lines
- **Upstream rebase pain:** high (deleted functions create conflicts)

Not worth it for a sandbox. The internal data model doesn't matter to anyone; no user will ever see `email` in the DB.

### Option 3: Caddy/proxy rewrite

Intercept signup/login at the reverse proxy and append `@spe.local` to bare usernames. Inject JS to relabel the UI.

- **Effort:** ~4-6 hours
- **Source changes:** 0 in LibreChat
- **Trade-off:** Two-system reasoning. UI selectors break on any upstream UI restructure. The data layer is identical to Option 1 anyway.

### Option 4: Custom auth UI in front of LibreChat

Build a separate signup/login app that talks to LibreChat's API.

- **Effort:** ~10-20+ hours
- **Source changes:** 0 in LibreChat
- **Trade-off:** Maintaining our own auth UX surface, keeping in sync with LibreChat API changes, doesn't fix in-app `user.email` displays.

## Decision

**Option 1: Minimum-viable fork patch.**

Reasons:

1. **It's the right level of effort for the actual requirement.** Lex's ask is "no email in UX." That's a UI requirement, not a "rip out the schema" requirement.
2. **It's the smallest possible patch surface.** Editing a known finite set of files; every other auth path keeps working.
3. **The LDAP precedent already exists in the codebase.** Same synthetic-email pattern.
4. **Upstream rebases stay tractable.** Modifying lines, not deleting functions.
5. **The clean patch isn't worth it for a sandbox.** Cleaner schema for no observable benefit.
6. **Skip the proxy idea.** Looks free but isn't — JS injection is fragile, two moving parts to sync.

## Implementation summary

Files touched (all changes preserve the synthetic-email-internally approach):

- `api/strategies/validators.js` — `loginSchema` accepts 2-80 char strings; `registerSchema` requires `username`, makes `email` optional; new `synthesizeEmail()` helper exported.
- `api/server/services/AuthService.js` — `registerUser` synthesizes email from username before persistence; forces `emailVerified: true`.
- `api/strategies/localStrategy.js` — error messages updated from "Email" to "Username" for user-facing strings.
- `client/src/components/Auth/Registration.tsx` — email input removed; username promoted to required.
- `client/src/components/Auth/LoginForm.tsx` — relabeled to "Username", drops email-format validation, client-side synthesizes `@spe.local` before submit.
- `client/src/components/Nav/AccountSettings.tsx` — displays `username` instead of synthetic email; secondary line removed.
- `client/src/locales/en/translation.json` — `com_auth_email*` strings rewritten to Username form.
- `packages/data-provider/src/types.ts` — `TRegisterUser.email` made optional.
- Tests updated across frontend and backend; all green.

## Trade-offs

- **Internal data model still contains synthetic emails.** Anyone inspecting MongoDB sees `alice@spe.local`. Acceptable; nobody does this normally.
- **Password reset is disabled** (`ALLOW_PASSWORD_RESET=false`). For a sandbox with shared rotating passwords, the admin reset workflow is the only one we need.
- **Password reset and verify routes still exist server-side** but are not linked from the UI. They 403 cleanly when called.
- **Some unreachable code remains** in `LoginForm.tsx` (Resend verification block) and `Registration.tsx` (verification redirect strings). Logical follow-up cleanup but not blocking.

## Follow-ups

- **JWT refresh-token handling in SPE's persona client** — without it, personas re-login at every access-token expiry. Currently worked around by setting `SESSION_EXPIRY=86400000` (24h) on LibreChat, but the proper fix is on the SPE side. Once SPE handles refresh tokens correctly, we can revert `SESSION_EXPIRY` to defaults.
- **`SPE_USERNAME_DOMAIN` env var** is configurable but currently defaults to `spe.local`. Worth being explicit about this if we ever expand beyond the SPE use case.
- **Mongoose-level regex match on email** (`packages/data-schemas/src/schema/user.ts:40`) still requires `\S+@\S+\.\S+`. The synthetic email satisfies this, but if anyone ever tries to write a plain username directly into the User schema, it will fail.

## Related decisions

- See `docs/decisions/2026-05-25-pilot-config-and-provider-swap.md` for the session TTL and login rate-limit changes that interact with this auth flow.