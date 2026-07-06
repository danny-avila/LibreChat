# User Data Migration — Backend Work Plan

**Feature:** Allow platform (super) admins to migrate one user's data
(conversations, messages, files, agents, prompts, financial records, etc.) into
another user's account.

**Tracking issue:** [AIWP#103](https://github.com/SMB-Team-Technology/AI-Workforce-Pro/issues/103)
**Frontend companion:** [Admin-Panel#12](https://github.com/SMB-Team-Technology/AI-Workforce-Pro-Admin-Panel/issues/12)
**Reference plan:** `AI-Workforce-Pro-Admin-Panel@claude/user-data-migration-feature-d8lrsw:docs/user-migration-plan.md`

This document is the **backend-specific** work plan. It supersedes the shared
plan doc where the two disagree, because the anchors below were re-verified
against the current `main` and several references in the original spec were
found to differ (see [§8 Spec corrections](#8-spec-corrections)).

---

## 1. Scope & confirmed decisions

| Decision | Choice |
|---|---|
| Move vs. copy | **Move — merge into target.** Reassign the source's data to the target; the target keeps their own data and gains the source's; the source ends empty. Not an overwrite. |
| Tenant boundary | **Cross-tenant allowed, platform-admin only.** Requires system context + `tenantId` rewrite on every moved doc. |
| Data scope | **Everything migratable** (content + financial/account). All scopes selectable. `Session` / `Token` default **OFF** (auth-security footgun). |
| Execution | **Synchronous**, preceded by a **dry-run preview** returning per-collection counts. Async job deferred (no job queue exists). |
| Authorization | **`requirePlatformAdmin()`** — no tenant + `ACCESS_ADMIN`. Mandatory given cross-tenant moves. |
| Conflict strategy (open) | Default **skip-and-report** for name-keyed collisions (`PromptGroup`, `ConversationTag`) in cross-tenant moves. Rename-on-conflict deferred. |

---

## 2. What migrates (verified ownership map)

Owner fields verified against `packages/data-schemas/src/schema/`. This table is
the source of truth for the ownership registry (§3.1).

### Content (reassign owner → target)

| Model | Schema | Owner field | Type | Special handling |
|---|---|---|---|---|
| Conversation | `convo.ts` | `user` | String | UUID key — no collision |
| Message | `message.ts` | `user` | String | **artifacts ride along** (§2.1) |
| Preset | `preset.ts` | `user` | String (nullable) | |
| SharedLink | `share.ts` | `user` | String | |
| ConversationTag | `conversationTag.ts` | `user` | String | name-per-user index → possible conflict |
| File | `file.ts` | `user` | ObjectId | storage blobs stay; only DB ref moves |
| Agent | `agent.ts` | `author` | ObjectId | reassign owner `AclEntry` |
| Assistant | `assistant.ts` | `user` | ObjectId | |
| Action | `action.ts` | `user` | ObjectId | |
| PromptGroup | `promptGroup.ts` | `author` | ObjectId | sole-vs-shared ACL (mirror `deleteUserPrompts`) |
| Prompt | `prompt.ts` | `author` | ObjectId | moves with its group |
| Memory | `memory.ts` | `userId` | ObjectId | |
| ToolCall | `toolCall.ts` | `user` | ObjectId | |
| Skill | `skill.ts` | `author` | ObjectId | + SkillFile |
| MCPServer | `mcpServer.ts` | `author` | ObjectId | reassign AclEntries + live-session handling |
| AgentApiKey | `agentApiKey.ts` | `userId` | ObjectId | |
| AgentJob | `agentJob.ts` | `user` | ObjectId | **not in delete cascade** |
| SkillSchedule | `skillSchedule.ts` | `user` | ObjectId | **not in delete cascade** |
| NangoConnection | `nangoConnection.ts` | `userId` | ObjectId | **not in delete cascade** |
| PluginAuth | `pluginAuth.ts` | `userId` | String | |
| AclEntry (owner grants) | `aclEntry.ts` | `principalId` | Mixed | reassign entries where principal = source |

### Financial / account (included per decision)

| Model | Schema | Owner field | Type | Caveat |
|---|---|---|---|---|
| Transaction | `transaction.ts` | `user` | ObjectId | usage ledger |
| Balance | `balance.ts` | `user` | ObjectId | credit balance — merge semantics TBD (§7) |
| Key | `key.ts` | `userId` | ObjectId | stored API keys |
| SystemGrant | `systemGrant.ts` | `principalId` | Mixed | capability grants |
| per-principal Config | (config store) | `principalId` | String | config overrides |
| Token | `token.ts` | `userId` | ObjectId | ⚠️ default **OFF** |
| Session | `session.ts` | `user` | ObjectId | ⚠️ default **OFF** |

**Group membership stays with the person** — it describes who they are, not owned data.

> **#1 correctness hazard — owner-field split.** Some owners are **String**
> (Conversation, Message, Preset, SharedLink, ConversationTag, PluginAuth),
> others **ObjectId**, and the field name varies (`user` / `author` / `userId` /
> `principalId`). Each `updateMany` must write the correct representation. The
> registry encodes this per-collection so it is data-driven, not hand-written.

### 2.1 Artifacts

Artifacts are **not a persisted collection** — they are parsed client-side from
message content. Migrating **Messages** migrates artifacts for free. No separate
handling.

---

## 3. Implementation plan

### 3.1 `packages/data-schemas` — ownership registry

**New:** `packages/data-schemas/src/admin/ownership.ts`

Declarative single source of truth:

```ts
interface OwnedCollection {
  modelName: string;
  ownerField: 'user' | 'author' | 'userId' | 'principalId';
  ownerType: 'string' | 'objectId';
  scope: MigrationScope;              // grouping for UI + selectability
  special?: 'acl' | 'prompts' | 'mcp';
}
export const OWNERSHIP_REGISTRY: OwnedCollection[] = [ /* §2 table */ ];
```

Consumed by the migration methods below and, per the existing JSDoc intent in
`packages/api/src/admin/users.ts:75-81`, a future consolidated delete cascade.

### 3.2 `packages/data-schemas` — migration methods

**New:** `packages/data-schemas/src/methods/migration.ts`

- `countUserData({ sourceUserId, scopes })` → per-collection counts for dry-run.
- `reassignUserData({ sourceUserId, targetUserId, targetTenantId, scopes, session })`
  driven by the registry:
  - Generic collections: `updateMany({ [ownerField]: sourceRepr }, { $set: { [ownerField]: targetRepr, tenantId: targetTenantId } }, { session })`,
    coercing `sourceRepr` / `targetRepr` to String or ObjectId per `ownerType`.
  - `special: 'acl'` — reassign `AclEntry.principalId` where principal = source.
  - `special: 'prompts'` — mirror sole-vs-shared logic in
    `packages/data-schemas/src/methods/prompt.ts:638-678` (`deleteUserPrompts`):
    only reassign sole-owned PromptGroups; for shared groups move the source's
    ACL principal entry, don't touch shared authorship blindly.
  - `special: 'mcp'` — mirror `deleteUserMcpServers`
    (**located in `api/server/controllers/UserController.js:113-174`**, not
    data-schemas): reassign sole-owned MCPServers + their AclEntries; leave
    shared ones; handle live MCP session disconnect on the reassigned servers.
- Return a per-collection result report (`{ modelName, matched, modified, skipped }`).

### 3.3 `packages/data-schemas` — audit log (new; none exists today)

Only the **types** exist (`src/types/admin.ts`: `AuditAction`,
`AdminAuditLogEntry`). There is no model, schema, methods, or write path.

- Extend `AuditAction` in `src/types/admin.ts`:
  `'grant_assigned' | 'grant_removed'` → add `'user_migrated'`.
- New `src/schema/auditLog.ts` (Mongoose schema shaped after `AdminAuditLogEntry`,
  tenant-scoped, with `applyTenantIsolation`).
- New `src/models/auditLog.ts`.
- New `src/methods/auditLog.ts`: `createAuditEntry(...)`, `listAuditEntries(...)`
  (tenant-scoped, paginated).
- Wire model + methods into the data-schemas barrel/`createMethods` so `db.*`
  exposes them to the API layer.

**Bonus:** this un-stubs the admin panel's already-built audit UI (Admin-Panel#12).

### 3.4 `packages/api` — handler factory

**New:** `packages/api/src/admin/migrations.ts`, mirroring the
`createAdminUsersHandlers(deps)` pattern in
`packages/api/src/admin/users.ts:100` (deps interface → factory → returns
`{ ... }` of handlers; exported from `packages/api/src/admin/index.ts`).

- `AdminMigrationsDeps` — inject `countUserData`, `reassignUserData`,
  `createAuditEntry`, user lookups, `getTransactionSupport`, mongoose handle.
- `previewMigrationHandler` (dry run): validate both users exist, `source ≠ target`,
  target active; return per-collection counts + `crossTenant` flag.
- `migrateUserHandler`:
  1. Re-validate guards (same-user, missing-user, target inactive).
  2. `runAsSystem(async () => { ... })` wrap (§3.6).
  3. Transaction when supported: `getTransactionSupport(mongoose, cache)` then
     `mongoose.startSession()` + `startTransaction()` (pattern from
     `api/server/services/PermissionService.js:686,704-706`). Else sequential
     best-effort with a per-collection report.
  4. `createAuditEntry({ action: 'user_migrated', actorId, sourceUserId, targetUserId, counts, crossTenant })`.
  5. Return summary.

### 3.5 `api/server` — thin router

**New:** `api/server/routes/admin/migrations.js`

```js
const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);
router.use(requireJwtAuth, requireAdminAccess, superAdminContextMiddleware);
router.use(requirePlatformAdmin());          // platform-admin only
router.post('/preview', handlers.previewMigration);
router.post('/',        handlers.migrateUser);
```

- `requireCapability` / `superAdminContextMiddleware` from
  `~/server/middleware/roles/capabilities` (defined in
  `packages/api/src/middleware/capabilities.ts:178,212`).
- `requirePlatformAdmin` wired via `generatePlatformAdminCheck`
  (`packages/api/src/middleware/platform.ts:37-76`).
- Register `app.use('/api/admin/migrations', routes.adminMigrations)` in
  `api/server/index.js` alongside the block at ~line 204.
- **Note:** `api/server/experimental.js` mounts only `/api/admin` (auth). If the
  feature must work under experimental mode, add the mount there too.
- Optional: `GET /api/admin/audit` backed by `listAuditEntries` to power the
  panel's audit tab.

### 3.6 Cross-tenant handling (required)

- **System context:** wrap the whole op in `runAsSystem()`
  (`packages/data-schemas/src/config/tenantContext.ts:38`) so the
  `tenantIsolation` plugin
  (`packages/data-schemas/src/models/plugins/tenantIsolation.ts`,
  `applyTenantIsolation`) neither scopes to the caller's tenant nor throws on
  cross-tenant `tenantId` mutation (guard at lines 49-50 / 70-71 / 130-131;
  skipped under `SYSTEM_TENANT_ID`).
- **Rewrite `tenantId`** on every moved doc to the target's tenant in the same
  `$set`. Use `tenantSafeBulkWrite` (exported name — **not** `tenantBulkWrite`)
  from `packages/data-schemas/src/utils/tenantBulkWrite.ts` where a bulk op fits.
- **Re-check tenant-scoped uniqueness** at destination: UUID-keyed docs are safe;
  name-keyed (`PromptGroup`, `ConversationTag`) can collide → **skip-and-report**.
- **Same-tenant** moves run the same path with a no-op `tenantId` rewrite.

---

## 4. Verification (Jest + `mongodb-memory-server`)

Per repo conventions (real in-memory Mongo, no mocked DB calls):

- Seed a source user with docs across **every** registry collection, for both a
  same-tenant and a cross-tenant target.
- `previewMigrationHandler` → assert per-collection counts + `crossTenant` flag.
- `migrateUserHandler` → assert: docs now owned by target; source empty;
  `tenantId` rewritten on cross-tenant; ACLs reassigned (owner grants, prompts,
  mcp sole-vs-shared preserved); `user_migrated` audit entry written.
- Guard rejections fire: same user, missing user, inactive target,
  non-platform-admin caller.
- Transactional rollback on a forced mid-migration error (skipped/aliased when
  the test deployment lacks replica-set transaction support — match existing
  `getTransactionSupport` gating).
- Name-collision path: seed a colliding `ConversationTag` / `PromptGroup` in the
  target tenant → assert skip-and-report.

---

## 5. Phasing / PR breakdown

1. **PR 1 — registry + methods:** `admin/ownership.ts`, `methods/migration.ts`
   (`countUserData`, `reassignUserData` incl. special handlers), unit tests.
2. **PR 2 — audit log:** `AuditAction` extension, schema/model/methods, barrel
   wiring, tests. (Un-stubs panel audit UI.)
3. **PR 3 — handler + route:** `admin/migrations.ts`, `routes/admin/migrations.js`,
   registration, integration tests (guards, transaction, cross-tenant).
4. **PR 4 (optional) — `GET /api/admin/audit`** endpoint.

Backend lands **before** the panel (Admin-Panel#12) — the panel is a thin BFF
with no DB and cannot function until these endpoints exist.

---

## 6. Risks

- **Irreversibility** → strong confirmation (panel), audit trail, dry-run preview.
  Consider persisting a migration record for manual recovery (open, §7).
- **Owner-field split** (String vs ObjectId, varied field names) → registry-driven
  coercion + per-collection tests.
- **Cross-tenant `tenantId` exhaustiveness** → any doc left on the old tenant
  becomes invisible under isolation; dedicated tests.
- **Shared resources** (ACL-shared agents/prompts/mcp, shared links) → moving
  `author` changes who collaborators see as owner; sole-vs-shared logic limits
  blast radius but confirm desired behavior.
- **No job queue** → large migrations risk inline timeout; dry-run count is the
  guardrail; async deferred.
- **Session/Token** → default OFF; explicit opt-in in the confirm dialog.

---

## 7. Open questions

- **Balance merge semantics:** reassign vs. sum into the target's existing
  balance (a user can't have two balances). Likely **add source balance to
  target, delete source balance**. Confirm.
- **Name-collision strategy:** skip-and-report (default) vs. rename-on-conflict.
- **Reversible migration record** for manual recovery given the move is
  irreversible — persist yes/no?
- **`AgentJob` / `SkillSchedule` reassignment** of in-flight scheduled work —
  re-target ownership only, or also re-anchor tenant/cron context?

---

## 8. Spec corrections

Verified against current `main`; the original shared plan referenced a few
anchors that differ:

| Spec reference | Actual |
|---|---|
| delete cascade `~308-363` | `deleteUserController` at `UserController.js:308-362` |
| `// TODO` in `admin/users.ts:76-82` | JSDoc intent (not a `// TODO`) at `users.ts:75-81` |
| `tenantIsolation` under `config/` | `packages/data-schemas/src/models/plugins/tenantIsolation.ts` |
| `startSession` in `transactions.ts` | Only `getTransactionSupport`/`supportsTransactions`; `startSession` is called on `mongoose` directly (see `PermissionService.js:704`) |
| `tenantBulkWrite` | Exported as **`tenantSafeBulkWrite`** |
| `deleteUserMcpServers` in data-schemas | Lives in `UserController.js:113-174` |
| `AuditAction` union | Currently `'grant_assigned' \| 'grant_removed'` (add `'user_migrated'`) |
| `experimental.js` admin mounts | Only `/api/admin` (auth); sub-routers not mounted |
| delete cascade completeness | `AgentJob`, `SkillSchedule`, `NangoConnection` are **not** in the delete cascade but **are** owned data to migrate |
