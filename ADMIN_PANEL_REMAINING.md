# Admin Panel — Remaining Config Work

## Critical: `saveBaseConfigFn` sends the entire config instead of touched fields

**File:** `C:\ai\experimental\admin-panel\src\server\config.ts` (line ~551)

`saveBaseConfigFn` currently calls `PUT /api/admin/config/role/__base__` with the **entire merged config** as `overrides`. This bakes every default value into the DB override, making it impossible to distinguish admin-configured fields from defaults.

**Fix:** Use `PATCH /api/admin/config/role/__base__/fields` with only the changed fields.

`ConfigPage.tsx` (`C:\ai\experimental\admin-panel\src\components\configuration\ConfigPage.tsx`, line ~244) already tracks changed fields via `touchedPaths` (`Set<string>`). Build `entries` from that:

```ts
const entries = [...touchedPaths].map((path) => ({
  fieldPath: path,
  value: getValueAtPath(editedValues, path),
}));

await apiFetch(`/api/admin/config/role/${BASE_CONFIG_PRINCIPAL_ID}/fields`, {
  method: 'PATCH',
  body: JSON.stringify({ entries, priority: 0 }),
});
```

The `PUT` endpoint should only be used for bulk operations like YAML import.

"Reset to default" per-field should call:
```
DELETE /api/admin/config/role/__base__/fields?fieldPath=interface.endpointsMenu
```

## Config UI/UX overhaul

### Configured vs default indicators

**Files:**
- `C:\ai\experimental\admin-panel\src\components\configuration\ConfigPage.tsx`
- `C:\ai\experimental\admin-panel\src\server\config.ts`

`getBaseConfigFn` returns `{ config, dbOverrides }`. `dbOverrides` is the `__base__` doc's overrides (or `undefined` if none exists). Use it to determine which fields are explicitly set:

- Fields with no DB override → muted/dimmed with "Default" indicator
- Fields with a DB override → normal/highlighted with "Configured" badge
- Per-field "Reset to default" action → `DELETE .../fields?fieldPath=...`

### Section collapse with counts

- Auto-collapse sections with zero DB overrides
- Section headers show count: "Interface (5/18 configured)"
- Per-tab summary in tab bar: "AI and capabilities (3)"
- "Show only configured" toggle

### Save confirmation

- Toast on successful save
- "Saving..." → "Saved" indicator for auto-save
- Dirty state indicator if using explicit save

## LibreChat API reference

All endpoints require JWT + `ACCESS_ADMIN`. `:principalType` is `role`, `group`, or `user`.

| Method | Path | Params/Body | Response |
|--------|------|-------------|----------|
| GET | `/api/admin/config` | — | `{ configs: AdminConfig[] }` |
| GET | `/api/admin/config/base` | — | `{ config: AppConfig }` |
| GET | `/api/admin/config/:type/:id` | — | `{ config: AdminConfig }` |
| PUT | `/api/admin/config/:type/:id` | `{ overrides, priority? }` | `{ config }` (201 on create, 200 on update) |
| PATCH | `/api/admin/config/:type/:id/fields` | `{ entries: [{fieldPath, value}], priority? }` | `{ config }` |
| DELETE | `/api/admin/config/:type/:id/fields?fieldPath=...` | query param | `{ config }` |
| DELETE | `/api/admin/config/:type/:id` | — | `{ success: true }` |
| PATCH | `/api/admin/config/:type/:id/active` | `{ isActive }` | `{ config }` |

**Base config** uses `principalType: 'role'`, `principalId: '__base__'`, `priority: 0`.

**Caching:** Per-user/role merged configs are cached with a 60s TTL. No explicit cache invalidation on admin writes — changes propagate within 60s.

**Max entries:** `PATCH .../fields` accepts at most 100 entries per request.

**Field path validation:** Rejects `__proto__`, `constructor`, `prototype`, and any dunder-prefixed segments.

## Not part of config wiring (separate work)

- `C:\ai\experimental\admin-panel\src\server\roles.ts` — still mocked
- `C:\ai\experimental\admin-panel\src\server\groups.ts` — still mocked
- `C:\ai\experimental\admin-panel\src\server\users.ts` — still mocked
- `C:\ai\experimental\admin-panel\src\server\capabilities.ts` — still mocked
