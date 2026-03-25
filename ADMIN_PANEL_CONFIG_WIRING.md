# Roles & Groups API Wiring — Comprehensive Handoff

## Overview

The admin panel (`\\wsl.localhost\Ubuntu-22.04\home\danny\ai\experimental\admin-panel`) has fully working UI for roles and groups management, but the server functions in `src/server/roles.ts` and `src/server/groups.ts` use **mock data** (in-memory arrays in `src/server/mock-store.ts`). The work is to:

1. Create Express API routes in LibreChat for roles and groups (following the pattern in `api/server/routes/admin/config.js`)
2. Create handler factories in `packages/api/src/admin/` (following the pattern in `packages/api/src/admin/config.ts`)
3. Replace the mock implementations in the admin panel with `apiFetch()` calls to the new endpoints

**Reference pattern**: The config management PR (#12354) established the architecture. Study these files:
- `api/server/routes/admin/config.js` — Express route wiring with DI
- `packages/api/src/admin/config.ts` — Handler factory with dependency injection
- `admin-panel/src/server/scopes.ts` — Admin panel server functions calling real API

## Existing backend infrastructure

Almost everything exists already. You are NOT writing CRUD from scratch — you're wiring existing methods to API routes.

### Roles

**Methods** (`packages/data-schemas/src/methods/role.ts`):
| Method | What it does |
|--------|-------------|
| `listRoles()` | Returns all roles with name and permissions |
| `getRoleByName(roleName, fieldsToSelect?, cache?)` | Get role by name, auto-creates if system role |
| `updateRoleByName(roleName, updates)` | Update role fields, invalidates cache |
| `updateAccessPermissions(roleName, permissionsUpdate, roleData?)` | Update the permission matrix with schema validation |
| `initializeRoles()` | Seeds default ADMIN/USER roles |
| `migrateRoleSchema(roleName?)` | Migrates old permission format to new |

**Types** (`packages/data-schemas/src/types/role.ts`):
- `IRole` — Main role interface: `name`, `permissions: { [PermissionTypes]?: { [Permissions]?: boolean } }`, `tenantId?`
- `RolePermissions` — Type alias for the permissions object
- `CreateRoleRequest` — `{ name, permissions }`
- `UpdateRoleRequest` — `{ name?, permissions? }`
- `RoleFilterOptions` — `{ search?, hasPermission? }` extends cursor pagination

**Permission types** (`packages/data-provider/src/permissions.ts`):
- `PermissionTypes` enum: PROMPTS, BOOKMARKS, AGENTS, MEMORIES, MULTI_CONVO, TEMPORARY_CHAT, RUN_CODE, WEB_SEARCH, PEOPLE_PICKER, MARKETPLACE, FILE_SEARCH, FILE_CITATIONS, MCP_SERVERS, REMOTE_AGENTS
- `Permissions` enum: USE, CREATE, UPDATE, READ, READ_AUTHOR, SHARE, OPT_OUT, VIEW_USERS, VIEW_GROUPS, VIEW_ROLES, SHARE_PUBLIC
- 14 individual Zod schemas defining which permissions apply to which type

**System roles** (`packages/data-provider/src/roles.ts`):
- `SystemRoles` enum: ADMIN, USER
- `roleDefaults` — Default permission matrix for both system roles

**What's missing in backend:**
- **No `deleteRole` method** — needs to be added to `packages/data-schemas/src/methods/role.ts`. Must guard against deleting system roles (ADMIN, USER).
- **No role member management methods** — users have a `role: string` field on the User model. "Add member to role" = `User.findByIdAndUpdate(userId, { role: roleName })`. "List role members" = `User.find({ role: roleName })`. These may need new methods in the user methods file.
- **No admin API routes** — `api/server/routes/admin/roles.js` doesn't exist yet.

### Groups

**Methods** (`packages/data-schemas/src/methods/userGroup.ts`):
| Method | What it does |
|--------|-------------|
| `findGroupById(groupId, projection?, session?)` | Find group by ID |
| `findGroupByExternalId(idOnTheSource, source, projection?, session?)` | Find by external ID (Entra) |
| `findGroupsByNamePattern(namePattern, source?, limit?, session?)` | Search groups by name regex |
| `findGroupsByMemberId(userId, session?)` | Find all groups a user belongs to |
| `createGroup(groupData, session?)` | Create a group |
| `updateGroupById(groupId, data, session?)` | Update group fields |
| `addUserToGroup(userId, groupId, session?)` | Add user to group's memberIds array |
| `removeUserFromGroup(userId, groupId, session?)` | Remove user from group's memberIds |
| `removeUserFromAllGroups(userId)` | Remove user from all groups |
| `getUserGroups(userId, session?)` | Get all groups for a user |
| `getUserPrincipals(params, session?)` | Resolve user + role + groups into principals array (used by config resolution — DO NOT duplicate) |
| `searchPrincipals()` | Search users and groups together |
| `findGroupByQuery(filter, session?)` | Generic query |
| `bulkUpdateGroups(filter, update, options?)` | Bulk update |

**Types** (`packages/data-schemas/src/types/group.ts`):
- `IGroup` — `name`, `description?`, `email?`, `avatar?`, `memberIds?: string[]`, `source: 'local' | 'entra'`, `idOnTheSource?`, `tenantId?`
- `CreateGroupRequest` — name, description, email, avatar, memberIds, source, idOnTheSource
- `UpdateGroupRequest` — All fields optional
- `GroupFilterOptions` — search, source, hasMember

**Schema** (`packages/data-schemas/src/schema/group.ts`):
- `memberIds` is an array of strings (stores `idOnTheSource` values, not ObjectIds)
- Supports `local` and `entra` sources
- Compound unique index on `(idOnTheSource, source, tenantId)`

**What's missing in backend:**
- **No `deleteGroup` method** — needs to be added to `packages/data-schemas/src/methods/userGroup.ts`. Should also call `removeUserFromAllGroups` or equivalent cleanup.
- **No `listGroups` method** — `findGroupsByNamePattern` exists but there's no simple "list all groups with pagination". May need a new method or the handler can use `findGroupByQuery({})`.
- **No admin API routes** — `api/server/routes/admin/groups.js` doesn't exist yet.

---

## Admin panel mock functions to replace

### `src/server/roles.ts` — 10 functions, all mock

| Function | Mock behavior | API endpoint needed |
|----------|--------------|-------------------|
| `getRolesFn()` | Returns `MOCK_ROLES` array | `GET /api/admin/roles` |
| `getRoleAssignmentsFn()` | Returns userId → roles mapping | `GET /api/admin/roles/assignments` |
| `reorderRolesFn(orderedIds)` | Reorders mock array | `PATCH /api/admin/roles/reorder` |
| `createRoleFn(name, description?)` | Pushes to mock array | `POST /api/admin/roles` |
| `updateRoleFn(id, name?, description?)` | Updates mock object | `PATCH /api/admin/roles/:id` |
| `updateRolePermissionsFn(id, permissions)` | Updates mock permissions | `PATCH /api/admin/roles/:id/permissions` |
| `deleteRoleFn(id)` | Splices mock array (guards system roles) | `DELETE /api/admin/roles/:id` |
| `getRoleMembersFn(roleId)` | Returns mock members | `GET /api/admin/roles/:id/members` |
| `addRoleMemberFn(roleId, userId)` | Adds to mock | `POST /api/admin/roles/:id/members` |
| `removeRoleMemberFn(roleId, userId)` | Removes from mock | `DELETE /api/admin/roles/:id/members/:userId` |

### `src/server/groups.ts` — 9 functions, all mock

| Function | Mock behavior | API endpoint needed |
|----------|--------------|-------------------|
| `getGroupsFn()` | Returns `MOCK_GROUPS` array | `GET /api/admin/groups` |
| `getGroupAssignmentsFn()` | Returns userId → groups mapping | `GET /api/admin/groups/assignments` |
| `reorderGroupsFn(orderedIds)` | Reorders mock array | `PATCH /api/admin/groups/reorder` |
| `createGroupFn(name, description)` | Pushes to mock array | `POST /api/admin/groups` |
| `updateGroupFn(id, name?, description?)` | Updates mock object | `PATCH /api/admin/groups/:id` |
| `deleteGroupFn(id)` | Splices mock array | `DELETE /api/admin/groups/:id` |
| `getGroupMembersFn(groupId)` | Returns mock members | `GET /api/admin/groups/:id/members` |
| `addGroupMemberFn(groupId, userId)` | Adds to mock | `POST /api/admin/groups/:id/members` |
| `removeGroupMemberFn(groupId, userId)` | Removes from mock | `DELETE /api/admin/groups/:id/members/:userId` |

---

## Work breakdown

### Phase 1: LibreChat API — Groups (AI-720)

**1a. Add missing backend methods** (`packages/data-schemas/src/methods/userGroup.ts`):
- `deleteGroup(groupId, session?)` — delete a group, remove all member references
- `listGroups(filter?, session?)` — list all groups with optional filtering/pagination (existing `findGroupsByNamePattern` is search-only, not a general list)

**1b. Create handler factory** (`packages/api/src/admin/groups.ts`):
- Follow the pattern in `packages/api/src/admin/config.ts`
- DI interface accepting the group methods from data-schemas
- Handlers: `listGroups`, `getGroup`, `createGroup`, `updateGroup`, `deleteGroup`, `getGroupMembers`, `addGroupMember`, `removeGroupMember`, `getGroupAssignments`
- All handlers require `ACCESS_ADMIN` capability (enforced at route level)

**1c. Create Express routes** (`api/server/routes/admin/groups.js`):
- Follow the pattern in `api/server/routes/admin/config.js`
- Wire handlers with DI from `~/models`
- Register in `api/server/routes/index.js` (check how `admin/config` is mounted and follow the same pattern)

**1d. Wire admin panel** (`admin-panel/src/server/groups.ts`):
- Replace each mock function with `apiFetch()` call
- Follow the pattern in `admin-panel/src/server/scopes.ts`
- Import `apiFetch` from `./utils/api`

### Phase 2: LibreChat API — Roles (AI-719)

**2a. Add missing backend methods** (`packages/data-schemas/src/methods/role.ts`):
- `deleteRole(roleName, session?)` — delete a non-system role. Guard: cannot delete ADMIN or USER (use `SystemRoles` enum for the check).
- Role member management is fundamentally different from groups: users have a `role` field on the User model. "Add member to role" means `User.findByIdAndUpdate(userId, { role: roleName })`. "Remove member" means setting back to `SystemRoles.USER`. "List role members" means `User.find({ role: roleName })`. These may need new methods in the user methods file, or the handler can query the User model directly.

**2b. Create handler factory** (`packages/api/src/admin/roles.ts`):
- DI interface accepting role methods from data-schemas + user methods for member management
- Handlers: `listRoles`, `getRole`, `createRole`, `updateRole`, `deleteRole`, `updateRolePermissions`, `getRoleMembers`, `addRoleMember`, `removeRoleMember`, `getRoleAssignments`, `reorderRoles`
- `updateRolePermissions` is the most important handler — it calls `updateAccessPermissions()` which handles the full permission matrix with schema validation

**2c. Create Express routes** (`api/server/routes/admin/roles.js`):
- Same pattern as groups
- Permissions endpoint at `PATCH /api/admin/roles/:id/permissions`

**2d. Wire admin panel** (`admin-panel/src/server/roles.ts`):
- Replace each mock function with `apiFetch()` call

---

## Important notes

### Role member management is NOT like group member management
- **Groups**: `Group.memberIds` is an array field on the Group document. `addUserToGroup()` pushes to this array.
- **Roles**: There is no `Role.memberIds`. Users have a `role: string` field on the User model. To "add a member to a role" you update `User.role = 'roleName'`. To "list role members" you query `User.find({ role: roleName })`. This is a fundamentally different data model.

### System roles cannot be deleted
`SystemRoles.ADMIN` and `SystemRoles.USER` are built-in. The `deleteRole` method and the admin panel mock both guard against deleting them. The API endpoint should return 403 if deletion of a system role is attempted.

### `getUserPrincipals` is critical — don't duplicate it
This method in `userGroup.ts` resolves a user's full principal list (user + role + groups) for config resolution. It's already used by the config service (`packages/api/src/app/service.ts`). Don't create a parallel implementation.

### No priority/reorder on roles or groups
The current mock UI has drag-and-drop reordering for roles and groups. **Remove it.** Priority is a **config** concept, not a role/group concept. The Config document already has `priority` (base=0, role=10, group=20, user=100) which determines merge order in config resolution.

Roles and groups themselves have no inherent ordering. Display order in the UI should be alphabetical, by creation date, or by member count — not a custom sort.

- Remove `reorderRolesFn` and `reorderGroupsFn` from the admin panel
- Remove the drag-and-drop UI from the Groups and Roles tabs
- Remove the "Drag items to reorder priority. Higher items take precedence." hint text

### People picker permissions
The "Search users to add" input in the Create Group / member management dialogs requires **people picker permissions** (`PermissionTypes.PEOPLE_PICKER` with `Permissions.VIEW_USERS`, `VIEW_GROUPS`, `VIEW_ROLES`). The user search endpoint that powers this input must respect these permissions. The admin has all permissions by default (`roleDefaults.ADMIN` enables all PEOPLE_PICKER permissions), but the API endpoint should still validate this.

Relevant existing method: `searchPrincipals()` in `packages/data-schemas/src/methods/userGroup.ts` — searches users and groups together. This can power the member search UI.

### System grants
System grants control which capabilities a principal has. The backend methods already exist in `packages/data-schemas/src/methods/systemGrant.ts`:
- `hasCapabilityForPrincipals({ principals, capability })` — check if any principal has a capability
- `grantCapability(...)` — grant a capability to a principal
- `revokeCapability(...)` — revoke a capability from a principal
- `getCapabilitiesForPrincipal({ principalType, principalId })` — list all grants for a principal
- `seedSystemGrants()` — seed default grants

Since roles and groups are being wired up with real data, the system grants should be implemented as part of this work — the "Grants" page in the admin panel (`src/server/capabilities.ts`) needs real endpoints too.

This is relevant because:
- When creating/editing a role, you need to assign capabilities to it
- When viewing a group's effective permissions, grants determine what capabilities propagate
- The admin panel's `EditCapabilitiesDialog` and `AssignCapabilitiesDialog` components depend on grant data

The grant-related mock functions in `src/server/capabilities.ts` to wire:
- `getPrincipalGrantsFn(principalType, principalId)` — get grants for a principal
- `getEffectiveCapabilitiesFn()` — get effective caps for current user
- `assignCapabilityFn(principalType, principalId, capability)` — grant a capability
- `removeCapabilityFn(principalType, principalId, capability)` — revoke a capability
- `getAuditLogFn()` — capability change audit log

### Naming conventions
- Single-word file/directory names preferred
- Multiple words → group under a single-word directory (e.g., `admin/config.ts`, `admin/roles.ts`, `admin/groups.ts`)
- Handler factories: `createAdminRolesHandlers(deps)`, `createAdminGroupsHandlers(deps)`

### Import order convention (enforced by linter)
1. External packages (`express`, `zod`, `mongoose`)
2. `@librechat/*` packages
3. Type imports from external packages
4. Type imports from internal packages
5. Local imports (`~/models`, `./utils`)

### Import source conventions
- `PrincipalType`, `SystemRoles`, `PermissionTypes`, `Permissions` → from `librechat-data-provider`
- `IRole`, `IGroup`, DB methods, `SystemCapabilities` → from `@librechat/data-schemas`
- Admin panel: never import runtime values from `@librechat/data-schemas` in client-reachable code (it has Node.js-only deps like winston, async_hooks). Use type-only imports or the `@librechat/data-schemas/capabilities` subpath for browser-safe constants.

---

## Capability enforcement

### All SystemCapabilities constants (already defined in `packages/data-schemas/src/admin/capabilities.ts`)

```
ACCESS_ADMIN      'access:admin'
READ_USERS        'read:users'
MANAGE_USERS      'manage:users'
READ_GROUPS       'read:groups'
MANAGE_GROUPS     'manage:groups'
READ_ROLES        'read:roles'
MANAGE_ROLES      'manage:roles'
READ_CONFIGS      'read:configs'
MANAGE_CONFIGS    'manage:configs'
ASSIGN_CONFIGS    'assign:configs'
READ_USAGE        'read:usage'
READ_AGENTS       'read:agents'
MANAGE_AGENTS     'manage:agents'
MANAGE_MCP_SERVERS 'manage:mcpservers'
READ_PROMPTS      'read:prompts'
MANAGE_PROMPTS    'manage:prompts'
READ_ASSISTANTS   'read:assistants'   (reserved)
MANAGE_ASSISTANTS 'manage:assistants' (reserved)
```

**Implications** (manage implies read): `MANAGE_USERS → READ_USERS`, `MANAGE_GROUPS → READ_GROUPS`, `MANAGE_ROLES → READ_ROLES`, etc. Utility functions `hasImpliedCapability()` and `expandImplications()` handle this.

### LibreChat API — capability enforcement per route

Every new route file must enforce capabilities. The pattern from `config.js`:

```js
// Route-level: gate the entire router to admin access
const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);
router.use(requireJwtAuth, requireAdminAccess);
```

**For groups routes**: read endpoints should check `READ_GROUPS`, write endpoints should check `MANAGE_GROUPS`. Two options:
1. Per-route middleware: `router.get('/', requireCapability(SystemCapabilities.READ_GROUPS), handlers.listGroups)`
2. Inject the check into the handler factory (like `hasConfigCapability` is injected into config handlers)

Option 1 is simpler and preferred for roles/groups since there's no section-level granularity (unlike configs which have per-section capabilities).

**Mapping:**

| Endpoint | Capability |
|----------|-----------|
| `GET /api/admin/roles` | `READ_ROLES` |
| `POST /api/admin/roles` | `MANAGE_ROLES` |
| `PATCH /api/admin/roles/:id` | `MANAGE_ROLES` |
| `DELETE /api/admin/roles/:id` | `MANAGE_ROLES` |
| `GET /api/admin/roles/:id/members` | `READ_ROLES` |
| `POST /api/admin/roles/:id/members` | `MANAGE_ROLES` |
| `DELETE /api/admin/roles/:id/members/:userId` | `MANAGE_ROLES` |
| `PATCH /api/admin/roles/:id/permissions` | `MANAGE_ROLES` |
| `GET /api/admin/groups` | `READ_GROUPS` |
| `POST /api/admin/groups` | `MANAGE_GROUPS` |
| `PATCH /api/admin/groups/:id` | `MANAGE_GROUPS` |
| `DELETE /api/admin/groups/:id` | `MANAGE_GROUPS` |
| `GET /api/admin/groups/:id/members` | `READ_GROUPS` |
| `POST /api/admin/groups/:id/members` | `MANAGE_GROUPS` |
| `DELETE /api/admin/groups/:id/members/:userId` | `MANAGE_GROUPS` |

### Admin panel — capability enforcement

The admin panel already has a working capability system:

1. **Route-level auth** (`src/routes/_app.tsx` `beforeLoad`): Calls `verifyAdminTokenFn()` + `getEffectiveCapabilitiesFn()`. Results stored in route context.
2. **Component-level checks**: `useCapabilities()` hook provides `hasCapability()`. Pages check their required capability and render `<AccessDenied />` if missing. Example from `src/routes/_app/users.tsx`:
   ```ts
   const { hasCapability } = useCapabilities();
   if (!hasCapability(SystemCapabilities.READ_USERS)) return <AccessDenied />;
   ```
3. **Server function level**: `apiFetch()` sends the JWT, and LibreChat's middleware does the real enforcement. The admin panel's component checks are UX only (hide UI the user can't use). The actual security boundary is the API.

**What needs to happen:**
- `getEffectiveCapabilitiesFn()` in `src/server/capabilities.ts` is currently mock — it reads from `MOCK_SYSTEM_GRANTS`. Wire it to a real API endpoint (e.g., `GET /api/admin/grants/effective`).
- `grantCapabilityFn()` and `revokeCapabilityFn()` are also mock — wire to `POST /api/admin/grants` and `DELETE /api/admin/grants`.
- The `beforeLoad` in `_app.tsx` already calls `getEffectiveCapabilitiesFn()` on every navigation — once wired to the real API, this enforces real capabilities throughout the admin panel.

### DRY middleware for TanStack Start server functions

Currently, every server function in the admin panel independently calls `apiFetch()` and handles errors. There's no shared middleware pattern for:
- Checking capabilities before making the API call (avoids unnecessary round-trips)
- Consistent error handling (401 → redirect to login, 403 → throw capability error)
- Consistent response parsing

**Recommendation: Create a `protectedFetch` wrapper** (`src/server/utils/protectedFetch.ts`):

```ts
import { apiFetch } from './api';
import { useCapabilities } from '@/hooks/useCapabilities';

export async function protectedFetch(
  path: string,
  options?: RequestInit & { requiredCapability?: string }
): Promise<Response> {
  const response = await apiFetch(path, options);

  if (response.status === 401) {
    throw redirect({ to: '/login' });
  }
  if (response.status === 403) {
    throw new Error('Insufficient permissions');
  }

  return response;
}
```

This keeps error handling DRY across all server functions. The actual capability check is still server-side (LibreChat's `requireCapability` middleware), but the admin panel gets consistent error handling.

For TanStack Start specifically, `createServerFn` doesn't have built-in middleware chaining like Express. The recommended pattern is:
1. **Shared utility functions** (like `protectedFetch`) for common concerns
2. **Route-level `beforeLoad`** for auth/capability context (already in place)
3. **Component-level hooks** for UI gating (already in place via `useCapabilities()`)
