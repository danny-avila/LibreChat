# fix: filter admin config reads by section-scoped read capability

**Branch:** `fix/admin-config-section-scoped-read-filtering` (base: `main`)

---

## Summary

`listConfigs`, `getBaseConfig`, and `getConfig` (the admin config read handlers) only ever checked the broad `read:configs` capability, so a caller holding nothing but `read:configs:<section>` grants got a blanket 403 on all three instead of a response filtered to the sections they actually hold. Any deployment using section-scoped config grants hits this.

Adds `hasAnyConfigReadAccess` as a cheap pre-flight check (true if the caller holds the broad `read:configs`/`manage:configs` capability or any section-scoped `read:configs:<section>`/`manage:configs:<section>` grant), so a zero-access caller still 403s before a DB fetch, while a section-scoped caller passes through and gets the response filtered to exactly what they hold instead of being denied outright. `manage:configs`/`manage:configs:<section>` are included because manage already implies read; a caller who can write a section must be able to read it too.

The actual section resolution (`getReadableConfigSections`) resolves every section for a request in one batched `getHeldCapabilities` query instead of one `hasConfigCapability` round trip per section, so `/base` no longer fans out roughly one query per `AppConfig` section. The same manage-implies-read rule applies here: fixed at its root in `getParentCapabilities` (`packages/data-schemas/src/methods/systemGrant.ts`) so a `manage:configs:<section>`-only caller correctly sees the section they manage, rather than passing the pre-flight and then having that exact section stripped by the resolution query.

Includes the `AppConfig` field-renaming normalization (`interfaceConfig`/`turnstileConfig`/`mcpConfig`), needed so the filter checks the canonical section name rather than the renamed response field; without it, a caller holding `read:configs:interface` would have `interfaceConfig` incorrectly stripped from the response.

`STRUCTURAL_APP_CONFIG_KEYS` (the small set of top-level response keys exempt from the generic per-key check) no longer includes `fileStrategy`. Unlike `paths` (a server-computed constant with no corresponding `TCustomConfig` section at all) and the nested `config` container (exempted only so its own contents get filtered individually instead of the whole object being dropped), `fileStrategy` is a genuine, grantable section. Exempting it meant it was always returned regardless of what the caller actually holds.

`availableTools` stays in that exemption set for the same structural reason `config` does (there is no `read:configs:availableTools` grant type to check), but it is no longer unconditionally returned. It is derived from the `filteredTools`/`includedTools` sections plus a filesystem scan, so it is now gated on the caller holding read access to either of those two source sections instead of being shown to everyone regardless of grants.

## Change Type

- [x] Bug fix (non-breaking change which fixes an issue)

## Testing

Added `describe('read handlers: section-scoped-only caller (no broad read:configs)', ...)` to `config.handler.spec.ts` covering `getConfig`, `listConfigs`, and `getBaseConfig` for a caller holding only a single section-scoped read grant, plus cases for the field-renaming normalization and the `availableTools` gating (present when the caller holds `filteredTools` or `includedTools`, stripped otherwise). Existing 403 tests for a caller with no capability at all were updated to also mock `hasAnyConfigReadAccess: false`.

Added regression coverage in `systemGrant.spec.ts` and `capabilities.integration.spec.ts` for a broad `manage:configs` holder, a section-scoped `manage:configs:<section>` holder, and confirming a different section's manage grant does not leak read access into an unrelated section. Added coverage in `capabilities.integration.spec.ts` asserting `getReadableConfigSections` resolves an entire request's sections via a single `getHeldCapabilities` call regardless of section count.

Also verified live against a real backend and real MongoDB, comparing `main` and this branch with the same role, holding only `access:admin` and `read:configs:memory` (no broad `read:configs`):

**Before** (`main`):
```
GET /api/admin/config/base
-> 403 {"error":"Insufficient permissions"}
```

**After** (this branch):
```
GET /api/admin/config/base
-> 200 {"config": {
     "paths": { "uploads": "<server upload dir>", "structuredTools": "<server tools dir>", ... },
     "config": { "memory": { "disabled": false, "tokenLimit": 3000, ... } },
     "memory": { "disabled": false, "tokenLimit": 3000, ... }
   }}
```

Only `memory` (the one section this role actually holds) plus the always-present structural keys (`paths`/`config`) come through; every other section (`endpoints`, `interface`, `mcpServers`, `availableTools`, etc.) is correctly stripped instead of the whole request being denied.

### **Test Configuration**:
- `packages/api`: `config.handler.spec.ts`, `capabilities.spec.ts`, `capabilities.integration.spec.ts` (167 tests) all pass
- `packages/data-schemas`: `systemGrant.spec.ts` (118 tests) passes
- `tsc --noEmit` clean

## Checklist

- [x] My code adheres to this project's style guidelines
- [x] I have performed a self-review of my own code
- [x] I have written tests demonstrating that my changes are effective or that my feature works
- [x] Local unit tests pass with my changes
- [x] My changes do not introduce new warnings
