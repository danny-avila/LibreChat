# Magic Link Login for Students

**Date:** 2026-04-13
**Status:** Approved

## Summary

Admins can generate a permanent, reusable login link tied to a student's email address. When a student clicks the link, their account is auto-created (if it doesn't exist) and they are logged in — no password required. Links remain valid until an admin revokes them.

---

## Data Model

New `MagicLink` collection in `packages/data-schemas/src/schema/magiclink.ts`.

```ts
{
  token: string        // SHA-256 hash of raw 32-byte random token
  email: string        // lowercase student email
  createdBy: ObjectId  // admin userId
  active: boolean      // false = revoked
  userId?: ObjectId    // populated on first use
  createdAt: Date
  lastUsedAt?: Date
  useCount: number     // default 0
  tenantId?: string
}
```

**Indices:**
- `{ token: 1 }` — unique, primary lookup key
- `{ email: 1, tenantId: 1 }` — unique, one active link per email per tenant
- `{ createdBy: 1 }` — admin listing

The raw token (never stored) is embedded in the link URL as a hex string. On login the server SHA-256-hashes it and looks up the document.

---

## Backend API

All business logic in `packages/api/src/auth/` (TypeScript). Thin JS wrappers registered in `api/server/routes/`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/admin/magic-links` | Admin JWT | Generate link for an email |
| `DELETE` | `/api/admin/magic-links/:id` | Admin JWT | Revoke a link |
| `GET` | `/api/admin/magic-links` | Admin JWT | List links (filterable by createdBy) |
| `GET` | `/api/auth/magic-link` | None | Student login via link |

### Generate (`POST /api/admin/magic-links`)

1. Validate email format and domain allowlist (reuse `isEmailDomainAllowed`).
2. Reject if an active link already exists for that email + tenant.
3. Generate 32 random bytes → raw hex → SHA-256 hash (stored).
4. Save `MagicLink` with `active: true`, `createdBy: adminId`, `useCount: 0`.
5. Return `{ id, email, url: '/auth/magic-link?token=<raw_hex>' }`.

### Revoke (`DELETE /api/admin/magic-links/:id`)

1. Load `MagicLink` by id, verify `createdBy` matches admin (or admin has ADMIN role).
2. Set `active: false`. Return 204.

### List (`GET /api/admin/magic-links`)

Return all `MagicLink` docs for the tenant, optionally filtered by `createdBy`. Include `email`, `active`, `useCount`, `lastUsedAt`, `createdAt`, `userId`.

### Login (`GET /api/auth/magic-link?token=<raw_hex>`)

1. SHA-256-hash the raw token. Look up `MagicLink` where `{ token: hash, active: true }`.
2. Not found or inactive → redirect to `/login?error=invalid_magic_link`.
3. If `userId` is set → load existing user.
4. If `userId` is null → create user: `{ email, provider: 'magic_link', role: 'USER', emailVerified: true }`. Populate `userId` on the `MagicLink` doc.
5. Increment `useCount`, set `lastUsedAt`.
6. Call existing `setAuthTokens()` → set cookies → redirect to `/`.

**Security notes:**
- SHA-256 is appropriate here: tokens are 32 random bytes (256 bits of entropy), so password-stretching via bcrypt is unnecessary.
- No rate limiting needed on the login endpoint beyond standard infrastructure (the token entropy makes brute-force infeasible).
- The raw token is never logged or stored.

---

## Admin UI

### Per-user magic link panel

Shown in the existing user detail view in the admin panel. Contains:
- Current link URL (copyable) or "No link generated"
- "Generate Link" button (if no active link exists)
- "Revoke" button (if an active link exists)
- Created date, use count, last used date

### Generate link for new student

A "Generate Student Link" button in the user list header. Opens a modal with:
- Email field
- "Generate" button
- On success: displays the URL with a one-click copy button and a note that the account is created on first use

### Frontend files

- `client/src/components/Admin/MagicLink/MagicLinkPanel.tsx` — panel shown in user detail view
- `client/src/components/Admin/MagicLink/GenerateLinkModal.tsx` — modal for new student links
- `client/src/components/Admin/MagicLink/index.ts` — exports
- `client/src/data-provider/MagicLinks/queries.ts` — React Query hooks
- `client/src/data-provider/MagicLinks/index.ts` — re-exports
- `packages/data-provider/src/api-endpoints.ts` — new endpoint constants
- `packages/data-provider/src/keys.ts` — new QueryKeys / MutationKeys
- `client/src/locales/en/translation.json` — new `com_ui_magic_link_*` keys

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Invalid / revoked token | Redirect to `/login?error=invalid_magic_link` |
| Duplicate email on generate | 409 with descriptive message |
| Email domain not allowed | 400 with domain validation error |
| Admin revokes another admin's link | 403 (unless ADMIN role overrides) |
| Account creation fails | 500, `MagicLink.userId` not populated, link remains valid for retry |

---

## Testing

- **Backend unit tests** (`packages/api`): generate, revoke, list, login flows; duplicate-email rejection; revoked-token rejection; account auto-creation; `useCount`/`lastUsedAt` updates.
- **Frontend tests** (`client/__tests__`): MagicLinkPanel renders correct state (no link, active link); GenerateLinkModal submit and copy behavior; loading/error states.
- Use `mongodb-memory-server` for DB tests. No mocking of the `MagicLink` model.
