# Admin Dashboard

The admin dashboard provides authenticated users with the `admin` system role
a web UI and HTTP API for managing users, subscriptions, balances, usage, and
viewing audit logs.

Access is gated by a layered set of server-side guards; the frontend role
check is for UX only and is not load-bearing.

## Granting the admin role

The `role` field on the User model is the source of truth. Promoting a user
is currently done via the database (no public endpoint by design). The first
registered user is automatically promoted to admin in fresh installs.

To promote an existing user manually, connect to MongoDB and run:

```js
db.users.updateOne({ email: 'someone@example.com' }, { $set: { role: 'ADMIN' } });
```

Once a user has the role, they will see an "Admin Dashboard" link in their
account menu and can navigate to `/admin/overview`.

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `ADMIN_IP_ALLOWLIST` | unset (allow all) | Comma-separated CIDRs / IPs (v4 + v6). When set, only matching `req.ip` values may hit `/api/admin/*`. Malformed entries fail closed. |
| `ADMIN_RATE_LIMIT_PER_MIN` | `60` | Per-admin-user requests-per-minute cap on admin endpoints. Clamped to `[1, 1000]`. |
| `ADMIN_FRESH_AUTH_TTL_SEC` | `300` | Lifetime (seconds) of fresh-auth tokens issued by `/api/admin/reauth`. |
| `ADMIN_AUDIT_LOG_RETENTION_DAYS` | `365` | TTL for `adminAuditLogs` documents. `0` disables expiry (retain forever). Applied at schema definition time only — see retention notes below. |
| `ADMIN_IMPERSONATE_TTL_SEC` | `300` | Lifetime (seconds) of one-shot impersonation tokens. Each token is single-use. |

> The IP allowlist relies on Express `req.ip`, which depends on the app's
> `trust proxy` setting. Configure your reverse proxy correctly before relying
> on this control.

## Middleware stack

Every `/api/admin/*` route is composed as:

```
requireJwtAuth → checkBan → checkAdmin → checkAdminIpAllowlist → adminRateLimiter → [auditLogger] → [requireFreshAuth?] → handler
```

- `requireJwtAuth` — standard JWT bearer auth
- `checkBan` — denies banned users
- `checkAdmin` — denies non-admins (403)
- `checkAdminIpAllowlist` — optional CIDR allowlist
- `adminRateLimiter` — per-admin-user rate cap
- `auditLogger` — wraps the response, writes a row to `adminAuditLogs` on `finish` and emits a structured INFO/WARN log
- `requireFreshAuth` — applied per-route to destructive actions; verifies an `X-Fresh-Auth-Token` header

## Fresh-auth flow

Destructive admin operations (ban, role change, delete user, grant/revoke Pro,
balance set, large/negative balance adjust) require a recent password
re-confirmation in addition to the normal session.

```
+--------+   POST /api/admin/reauth { password }   +---------+
| Admin  | --------------------------------------> | Backend |
| Client |                                         |         |
|        | <-------- { token, expiresAt } -------- |         |
+--------+                                         +---------+
     |                                                   ^
     |  (subsequent destructive call carries header)     |
     +--- X-Fresh-Auth-Token: <token> -------------------+
```

The token is `base64url(payload).base64url(HMAC_SHA256(payload, JWT_SECRET))`
where `payload = "${userId}.${expiresAtUnixMs}.admin"`. The verifier checks
the signature, that the embedded `userId` matches the authenticated user,
that the scope is `admin`, and that the embedded expiry is in the future.

The frontend manages this transparently via `useAdminMutation`: any mutation
that gets back `401 { code: 'FRESH_AUTH_REQUIRED' }` triggers a password
modal; on success the request is retried automatically with the new token.
Tokens live in memory only — never localStorage.

## Endpoints

All routes are mounted at `/api/admin/*`.

| Method | Path | Fresh auth | Description |
|---|---|---|---|
| `POST` | `/reauth` | — | Verify password, mint fresh-auth token |
| `GET` | `/overview` | — | Org-wide KPIs |
| `GET` | `/users` | — | Paginated user list with filters |
| `GET` | `/users/:id` | — | User detail incl. subscription + balance |
| `POST` | `/users/:id/ban` | yes | Ban with reason |
| `POST` | `/users/:id/unban` | yes | Unban |
| `PATCH` | `/users/:id/role` | yes | Promote/demote (last-admin & self-demote enforced) |
| `POST` | `/users/:id/reset-password` | yes | Email a reset link |
| `POST` | `/users/invite` | — | Invite user by email |
| `DELETE` | `/users/:id` | yes | Delete user (typed-email confirm) |
| `POST` | `/users/:id/impersonate` | yes | Issue a one-shot impersonation URL. Body `{ reason }`. Refuses self / banned / admin targets. URL valid 5min, single-use. |
| `GET` | `/subscription` | — | List active Pro subscriptions |
| `GET` | `/subscription/users/:userId` | — | Subscription detail |
| `POST` | `/subscription/users/:userId/grant` | yes | Manual Pro grant |
| `POST` | `/subscription/users/:userId/revoke` | yes | Manual Pro revoke |
| `POST` | `/subscription/users/:userId/clear-override` | — | Hand control back to RevenueCat |
| `POST` | `/subscription/users/:userId/refresh` | — | Force refresh from RevenueCat |
| `GET` | `/balance/users/:userId` | — | Token credit balance |
| `POST` | `/balance/users/:userId/adjust` | conditional | Delta; fresh auth required for negative or `\|delta\| > 10M` |
| `POST` | `/balance/users/:userId/set` | yes | Absolute set |
| `GET` | `/usage/users/:userId` | — | Per-user usage timeseries |
| `GET` | `/usage/transactions` | — | Paginated transactions list |
| `GET` | `/usage/stats/overview` | — | Org-wide overview stats |
| `GET` | `/usage/stats/usage` | — | Org-wide tokens by day & by model |
| `GET` | `/messages/users/:userId/conversations` | — | Conversations list (metadata only) |
| `GET` | `/messages/users/:userId/conversations/:conversationId` | — | Single conversation metadata |
| `GET` | `/messages/users/:userId/conversations/:conversationId/messages` | — | Messages list; `?includeContent=true` returns text |
| `GET` | `/messages/messages/:messageId` | — | Single message with content |
| `GET` | `/audit` | — | Paginated audit log with filters |
| `GET` | `/audit/actions` | — | Distinct actions + 30d counts |
| `GET` | `/audit/:id` | — | Single audit row |

## Impersonation ("Sign in as user")

Admins can issue a one-shot URL that signs them in as a target user — meant
for support workflows ("the user reports X is broken; let me reproduce as
them"). Every step is auditable.

```
[Admin tab]  POST /api/admin/users/:id/impersonate { reason }   (admin + fresh-auth)
           ← { url, expiresAt }
[Admin tab]  navigates to url
[Same tab]   POST /api/auth/impersonate { token }               (token IS the auth)
           ← Set-Cookie: refreshToken=…  + { token, user }       (target user)
           → /c/new
```

The flow ends the admin's session and signs the same browser tab in as the
target user. Browser cookies are domain-scoped, not tab-scoped — so opening
the consume URL in a new tab would still overwrite the admin's
`refreshToken` cookie and break the original session anyway. Replacing the
current tab is the honest UX. Admins log back in with their own credentials
to end an impersonated session, the same way "view as user" / "assume role"
tools work in most admin platforms.

Guardrails:

- Admin must pass fresh-auth before issuance
- Cannot impersonate yourself, a banned user, or another admin
- Token is HMAC-SHA256 (`JWT_SECRET`), 5-minute TTL, single-use
- Atomic CAS on `jti` in `impersonationTokens` prevents replay
- The consume endpoint refuses if the caller already holds a Bearer JWT —
  forces session boundary clarity
- Two audit rows: `USER_IMPERSONATE_ISSUED` and `USER_IMPERSONATE_CONSUMED`
  (consume row carries IP/UA at consume time)
- Actions during the impersonated session are recorded as the target user;
  cross-reference via the `meta.jti` field on the audit consume row

## Privacy: viewing message content

The admin role is permitted to view message content. Every content fetch is
recorded in the audit log with action `MESSAGES_VIEW_CONTENT`. The list
endpoint with `includeContent=true` writes a single row per page (with
`meta.messageCount`) rather than one row per message, so the audit log
remains readable. List requests with `includeContent=false` write a row with
the lighter `MESSAGES_VIEW_LIST` action.

## Audit log

Every admin mutation and most reads write a row to `adminAuditLogs` with:

- `actorId`, `actorEmail`, `actorIp`, `userAgent`
- `action` (see `AdminAuditActions` in `@librechat/data-schemas`)
- `targetType`, `targetId`
- `before`, `after`, `meta` (each capped at 16KB; over-cap rows are rejected)
- `reason` (free-text; required on destructive actions)
- `status` (`success` / `failure`), `errorMessage`
- `createdAt`

Indexes:
- `(actorId, createdAt)` — fast "what did this admin do recently"
- `(targetType, targetId, createdAt)` — fast "what happened to this user"
- `(action, createdAt)` — fast filter by action type
- TTL on `createdAt` driven by `ADMIN_AUDIT_LOG_RETENTION_DAYS`

There is no API to update or delete audit rows; the schema is append-only by
design.

### Audit log retention

`adminAuditLogs` carries a TTL index whose `expireAfterSeconds` is decided at
schema definition time from `ADMIN_AUDIT_LOG_RETENTION_DAYS` (default 365).
MongoDB does not allow `expireAfterSeconds` to be edited in place: changing
the env var requires manually dropping and recreating the index against the
running cluster, e.g.

```
db.adminAuditLogs.dropIndex({ createdAt: 1 });
db.adminAuditLogs.createIndex(
  { createdAt: 1 },
  { expireAfterSeconds: <new_seconds> },
);
```

Setting `ADMIN_AUDIT_LOG_RETENTION_DAYS=0` skips creating the TTL index
entirely; you'll need to drop any existing TTL index by hand to fully retain
all records.

## Observability

Every admin request emits a structured log line on completion:

```
INFO  [admin] request    { admin: true, adminAction, adminActorId, adminActorEmail,
                            adminTargetType, adminTargetId, adminStatus,
                            adminStatusCode, adminDurationMs, adminMethod, adminPath }
WARN  [admin] request failed   (same shape, status === 'failure')
```

This is in addition to the durable `adminAuditLogs` row. Logs are produced
even when audit-log writes fail (the two paths are independent).

## Frontend layout

- Route: `/admin/*` — wrapped in `AdminRoute` layout (`client/src/routes/Layouts/Admin.tsx`)
- Pages (in `client/src/routes/Admin/`): `Overview`, `Users`, `UserDetail`,
  `Subscriptions`, `Usage`, `Messages`, `Audit`
- Data hooks (in `client/src/data-provider/Admin/`): `queries.ts`, `mutations.ts`
- Fresh-auth provider: `client/src/hooks/useFreshAuth.tsx` — exposes
  `useFreshAuth()` and the convenience `useAdminMutation(mutation)` wrapper
- Admin dashboard entry: rendered in the user account menu only when
  `user.role === SystemRoles.ADMIN`

## CLI scripts

The legacy CLI scripts under `config/` (e.g. `grant-pro-subscription.js`,
`ban-user.js`, `add-balance.js`) remain as out-of-band tools. The admin API
endpoints share the underlying logic with these scripts; either path produces
the same outcome.
