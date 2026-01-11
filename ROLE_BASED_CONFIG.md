# Role-Based Configuration Architecture

This document outlines the foundational architecture for role-based configuration management in LibreChat.

## Overview

The new architecture extends LibreChat's configuration system to support role, group, and user-specific configuration overrides while maintaining the existing `librechat.yaml` as the base configuration. The system uses a **priority-based merge strategy** where configurations are applied in order from lowest to highest priority.

## Architecture Components

### 1. Database Schema

A single unified MongoDB collection following the ACL pattern:

#### `Config`
- **Purpose**: Store configurations for any principal (user, group, or role)
- **Key Fields**:
  - `principalType`: Type of entity (`PrincipalType.USER`, `PrincipalType.GROUP`, `PrincipalType.ROLE`)
  - `principalId`: ID of the entity (ObjectId for users/groups, string for roles)
  - `principalModel`: Model reference (`PrincipalModel.USER`, `PrincipalModel.GROUP`, `PrincipalModel.ROLE`)
  - `priority`: Priority level for merge order (higher = more specific)
  - `overrides`: Object matching `librechat.yaml` structure
  - `isActive`: Toggle to enable/disable
  - `configVersion`: Auto-increments for cache invalidation

**Location**: 
- Type: `packages/data-schemas/src/types/config.ts`
- Schema: `packages/data-schemas/src/schema/config.ts`
- Model: `packages/data-schemas/src/models/config.ts`

**Design**: This follows LibreChat's existing ACL pattern (`AclEntry`), using a single collection for all principal types rather than separate collections per type.

### 2. Database Methods

**File**: `packages/data-schemas/src/methods/config.ts` (exported via `@librechat/data-schemas`)

Database operations for config management:

#### Key Methods:

- **`getApplicableConfigs(principals)`**: Fetches all configs for given principals
  - Takes array of principals from `getUserPrincipals`
  - Single optimized `$or` query to DB
  - Returns array of `IConfig` documents

- **`findConfigByPrincipal(principalType, principalId)`**: Find config for specific principal
- **`upsertConfig(...)`**: Create or update a config
- **`deleteConfig(...)`**: Delete a config
- **`toggleConfigActive(...)`**: Enable/disable a config

### 3. Configuration Resolution Service

**File**: `packages/api/src/config/resolution.ts` (exported via `@librechat/api`)

Simple service for merging configurations:

#### Key Functions:

- **`buildUserConfig({ baseConfig, cachedConfigs })`**: Merges base config with overrides
  - Takes fresh `baseConfig` from YAML
  - Takes cached `IConfig[]` documents
  - Returns merged `TCustomConfig`
  - Uses `deepmerge` npm package for merging

- **`mergeConfigsFromDB(baseConfig, configs)`**: Internal helper
  - Sorts configs by priority (ascending)
  - Merges each config's overrides in order

### 4. Updated `getAppConfig`

**File**: `api/server/services/Config/app.js`

The main config accessor with granular caching:
- `userId` or `role`: Determines which configs to apply
- **Granular caching**: Each config cached individually by principal
- Cache keys: `config:{principalType}:{principalId}`
- Graceful fallback to base config on errors

## Configuration Priority System

Configurations are applied in order from lowest to highest priority:

```
Priority 0:   Base YAML config (librechat.yaml)
Priority X:   All Config entries sorted by priority field
```

**Important**: 
- Priority values are **not hardcoded** - each Config has its own priority
- Suggested defaults: Role (10-30), Group (20-50), User (100+)
- Higher priority values always override lower ones
- If a user belongs to multiple groups, each group config is applied in priority order

## How It Works

### Request Flow

1. **Request comes in** with `userId` and/or `role`
2. **Load base config** from `librechat.yaml` (cached as `BASE_CONFIG_KEY`)
3. **Get user principals** via `getUserPrincipals({ userId, role, includeGroups: false })`
   - Returns array: user, role (no groups for initial implementation)
4. **Check cache individually** for each principal:
   - `config:role:admin` → admin role config
   - `config:user:123` → user 123's config
5. **If any cache miss**:
   - Single optimized DB query fetches all missing configs
   - Cache each returned config individually
6. **Merge fresh baseConfig** with all configs (cached + freshly fetched)
7. **Return** the final merged config

### Cache Strategy

**Granular individual caching**:
- `BASE_CONFIG_KEY`: The full processed AppConfig from YAML
- `config:role:{roleName}`: Role config from DB (shared across all users with that role)
- `config:user:{userId}`: User-specific config from DB

**Benefits**:
- **Efficient**: Role configs shared across users (e.g., all admins share `config:role:admin`)
- **Granular invalidation**: Change role config? Only clear that one cache entry
- **YAML independent**: Base config changes don't affect config caches
- **Optimized queries**: Single DB query for all missing configs

### Example Scenario

```javascript
// User "alice" has:
// - Role: "developer" 
//   Config: { principalType: 'role', principalId: 'developer', priority: 10 }
// - Groups: ["engineering-team", "beta-testers"]
//   Configs: [
//     { principalType: 'group', principalId: ObjectId(engineering-team), priority: 25 },
//     { principalType: 'group', principalId: ObjectId(beta-testers), priority: 30 }
//   ]
// - User config:
//   Config: { principalType: 'user', principalId: ObjectId(alice), priority: 100 }

// Merge order:
// 1. Base YAML (priority 0)
// 2. Role "developer" config (priority 10)
// 3. Group "engineering-team" config (priority 25)
// 4. Group "beta-testers" config (priority 30)
// 5. User "alice" config (priority 100)
```

## Integration Points

### Current Integration
- Uses existing ACL system for group membership (`getUserGroups`)
- Maintains existing role system (1:1 user-role relationship)
- Preserves existing cache infrastructure (Redis/in-memory)
- Compatible with current `librechat.yaml` structure

### What's NOT Yet Implemented
This is the **foundation only**. Still needed:

1. **Admin UI**: Interface to create/edit configs
2. **API Endpoints**: REST API for CRUD operations on configs
3. **Validation**: Schema validation for config objects
4. **Cache Invalidation**: Pub/sub for multi-instance cache invalidation
5. **Testing**: Integration and unit tests
6. **Migration Tools**: Scripts to help migrate existing configs
7. **Documentation**: Admin guide for managing configs
8. **Audit Logging**: Track who changed what configs when

## Usage Example

```javascript
// In a request handler
const { getAppConfig } = require('~/server/services/Config/app');

// Get config for specific user
const config = await getAppConfig({ userId: req.user.id });

// Config will include all applicable overrides merged in priority order
console.log(config.endpoints); // User's effective endpoint config
```

## File Structure

```
packages/data-schemas/src/
├── types/
│   └── config.ts           # IConfig type definitions
├── schema/
│   └── config.ts           # Config Mongoose schema
├── models/
│   └── config.ts           # Config model factory
└── methods/
    └── config.ts           # Config DB operations

packages/api/src/
├── config/
│   └── resolution.ts       # Config resolution service (uses TCustomConfig)
└── types/
    └── config.ts           # AppConfig type

api/server/services/Config/
└── app.js                  # Updated getAppConfig (main entry point)
```

**Note**: Uses `deepmerge` npm package for merging (not custom implementation)

## Next Steps

To build on this foundation, consider implementing in this order:

1. **Create API endpoints** for managing configs (CRUD)
2. **Add validation** to ensure config objects match expected structure
3. **Build simple CLI tools** to test config creation/assignment
4. **Add cache invalidation** logic (pub/sub for Redis)
5. **Create admin UI** for visual config management
6. **Write tests** for the resolution logic
7. **Document** the config format and best practices

## Design Decisions

### Why Priority-Based?
- **Predictable**: Always know which config wins
- **Flexible**: Can adjust priority for special cases
- **Scalable**: Works with complex org hierarchies

### Why Single Schema (ACL Pattern)?
- **Consistency**: Matches existing LibreChat ACL architecture
- **Simplicity**: One collection instead of three
- **Flexibility**: Easy to add new principal types in the future
- **Queries**: Simple to fetch all overrides for any principal

### Why MongoDB?
- **Flexible Schema**: `overrides` can match any YAML structure
- **Already in use**: No new dependencies
- **ACL Integration**: Leverages existing group/role system

### Why Granular Caching?
- **Individual cache entries**: Each config cached by `config:{type}:{id}`
- **Efficient sharing**: All admins share `config:role:admin` cache
- **Granular invalidation**: Change one config? Clear only that cache entry
- **YAML independence**: Base config changes don't invalidate config caches
- **Optimized queries**: Single DB query for all cache misses
- **Fresh merges**: Each request merges fresh baseConfig with cached overrides

## Type Safety & Architecture

- **DB Layer** (`data-schemas`): Uses `IConfig` interface for DB documents
- **App Layer** (`api`): Uses `TCustomConfig` from `librechat-data-provider` for type safety
- **No `any` types**: All types properly defined and enforced
- **Separation of Concerns**: DB methods in data-schemas, business logic in api
- **Optimized Queries**: Uses `getUserPrincipals` to batch principal lookup
- **Smart Caching**: Caches raw DB overrides separately from base config

## Notes

- The `overrides` field uses `Schema.Types.Mixed` to support any structure matching `librechat.yaml`
- Typed as `Partial<TCustomConfig>` at the app layer for type safety
- Priority values are just defaults - they can be customized per config
- All configs have `isActive` flag for easy enable/disable without deletion
- `configVersion` auto-increments on changes to help with cache invalidation

