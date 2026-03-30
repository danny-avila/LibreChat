# Pending Group Membership by Email

**Date:** 2026-03-30
**Status:** Approved

## Summary

Allow admins to add users to groups by email address before those users have logged in. Pending emails are stored on the group and resolved automatically (silently) when the user first logs in via OpenID (MS SSO).

---

## Data Model

Add `pendingEmails` to the Group schema and `IGroup` interface:

```ts
pendingEmails: string[]   // lowercase email addresses of not-yet-registered users
```

- Stored lowercase, deduplicated at write time.
- No expiry — entries persist until resolved on login or manually removed by an admin.
- Lives in `packages/data-schemas/src/schema/group.ts` and the corresponding `IGroup` type.

---

## Backend

### `addUserToGroupHandler` (`api/server/controllers/GroupController.js`)

Current behaviour when email lookup returns no user: 404.
New behaviour:
1. Push the lowercased email to `group.pendingEmails` (using `$addToSet` for idempotency).
2. Return `200 { success: true, pending: true, message: "User not found — added as pending. They will be added automatically when they log in." }`.

If the email is already in `memberIds` (user exists and is already a member), return `200` with a message saying so — no duplicate add.

### `resolvePendingMemberships(email, userId)` (new helper)

Location: `api/models/Group.js` (exported) — called from `openidStrategy.js`.

Steps:
1. `Group.find({ pendingEmails: email })` — case-insensitive via stored-lowercase invariant.
2. For each matched group, atomically: `$push memberIds userId` + `$pull pendingEmails email`.
3. All errors are caught and logged. Login is never blocked or delayed by failures here.

### Hook point in `openidStrategy.js`

After `user = await updateUser(user._id, user)` (~line 697), insert:

```js
await resolvePendingMemberships(email, user._id.toString());
```

Applies to both new and returning users (handles edge case where email was added as pending after a user's last login).

### New endpoint — remove pending email

`DELETE /api/groups/:id/pending/:email`

Pulls the email from `group.pendingEmails`. Protected by the same auth/admin middleware as other group member endpoints. Registered in `api/server/routes/groups.js`.

---

## Frontend

### `GroupMembersSection.tsx`

- **Add by email flow:** on `pending: true` response, refetch group data (which now includes the email in `pendingEmails`).
- **Pending section:** rendered below the members list when `group.pendingEmails.length > 0`. Each row shows:
  - Email address
  - "Pending" badge
  - Remove button → calls `DELETE /api/groups/:id/pending/:email`
- Group data fetch needs to include `pendingEmails` — ensure the `getGroupHandler` returns the field.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Email already pending | `$addToSet` is a no-op; return success |
| Email already a member | Return 200 "already a member", no DB write |
| `resolvePendingMemberships` fails | Log error, do not block login |
| Remove pending email not found | Return 200 (idempotent) |

---

## Files Changed

| File | Change |
|---|---|
| `packages/data-schemas/src/schema/group.ts` | Add `pendingEmails` field |
| `packages/data-schemas/src/types/` (IGroup) | Add `pendingEmails: string[]` |
| `api/models/Group.js` | Add `resolvePendingMemberships` export |
| `api/server/controllers/GroupController.js` | Update `addUserToGroupHandler`; add `removePendingEmailHandler` |
| `api/server/routes/groups.js` | Register DELETE pending email route |
| `api/strategies/openidStrategy.js` | Call `resolvePendingMemberships` after `updateUser` |
| `client/src/components/Groups/GroupMembersSection.tsx` | Show pending section; handle `pending: true` response |
