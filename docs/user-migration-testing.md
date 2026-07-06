# User Data Migration — Testing Guide

Companion to [user-migration-plan.md](./user-migration-plan.md). Covers backend
verification for [AIWP#103](https://github.com/SMB-Team-Technology/AI-Workforce-Pro/issues/103).

## Prerequisites

- MongoDB (local or Atlas) with the API connected
- A **platform admin** account (`ACCESS_ADMIN` system grant, not tenant admin only)
- Two test users in the same or different tenants

## Unit tests

```bash
# Ownership registry + migration methods (mongodb-memory-server)
cd packages/data-schemas
npx jest src/methods/migration.spec.ts --no-coverage

# HTTP handler factory
cd packages/api
npx jest src/admin/migrations.spec.ts --no-coverage

# Route integration (mongodb-memory-server)
cd api
npx jest server/routes/admin/migrations.test.js --no-coverage
```

### What unit tests cover

| Test file | Assertions |
|-----------|------------|
| `migration.spec.ts` | Merge semantics (10+5 chats), timestamp preservation, balance merge, tag skip, ACL reassign |
| `migrations.spec.ts` | Preview validation, audit log on migrate, cross-tenant flag |
| `migrations.test.js` | End-to-end preview + migrate via HTTP router |

## Manual API testing

Start the API (`bun run backend` or `npm run backend` from repo root).

### 1. Obtain a platform-admin JWT

Log in via the admin panel or `POST /api/admin/login/local` with a platform admin account.

### 2. Preview (dry run)

```bash
curl -s -X POST http://localhost:3080/api/admin/migrations/preview \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceUserId": "<source-mongo-id>",
    "targetUserId": "<target-mongo-id>",
    "scopes": ["conversation", "message", "file"]
  }' | jq
```

Expected: `200` with `counts`, `crossTenant`, `sourceUser`, `targetUser`.

### 3. Execute migration

```bash
curl -s -X POST http://localhost:3080/api/admin/migrations \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceUserId": "<source-mongo-id>",
    "targetUserId": "<target-mongo-id>",
    "scopes": ["conversation", "message"]
  }' | jq
```

Expected: `200` with `results`, `totalModified`, `totalSkipped`.

### 4. Verify in MongoDB

```javascript
// Source should have 0 conversations (if conversation scope was included)
db.conversations.countDocuments({ user: "<sourceId>" })

// Target should have both their own + migrated conversations
db.conversations.countDocuments({ user: "<targetId>" })

// Migrated chats should keep original updatedAt (sidebar date grouping)
db.conversations.find({ user: "<targetId>" }, { title: 1, createdAt: 1, updatedAt: 1 })
```

### 5. Authorization checks

| Caller | Expected |
|--------|----------|
| Non-admin | `401` / `403` |
| Tenant admin (not platform) | `403` from `requirePlatformAdmin()` |
| Platform admin | `200` |

## Scopes reference

- **Default (UI):** all scopes except `session` and `token`
- **Session/Token:** opt-in only — invalidates active logins
- **Not migrated:** user `role`, group membership, tenant-level config

## Admin panel E2E

See the [Admin Panel testing guide](https://github.com/SMB-Team-Technology/AI-Workforce-Pro-Admin-Panel/blob/main/docs/user-migration-testing.md) for Playwright flows against the mock backend.

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| All chats show under "Today" after migrate | Pre-fix: `updatedAt` bumped on reassign. Re-run with latest `migration.ts` (`timestamps: false`) |
| `403` on preview | Caller is not a platform admin |
| `Target user has no tenant assignment` | Target user missing `tenantId` |
| Prompt/MCP items skipped | Shared resources — sole-owned only |
