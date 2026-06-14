# Location Tool for Agents — Design

**Issue:** [#13413](https://github.com/danny-avila/LibreChat/issues/13413) — add location as available variable or tool
**Date:** 2026-06-15
**Status:** Approved design, pending spec review

## Goal

Let an agent obtain the user's current location on demand so it can tailor responses
(language, weather, regional context). Exposed as a **built-in agent tool**
(`get_location`), not a prompt variable. Location is sourced from **opt-in browser
geolocation** with a **manual text fallback**, configured in **Settings →
Personalization** and persisted on the user profile.

### Non-goals

- No prompt variable (e.g. `{{current_location}}`). Tool-only by decision.
- No server-side reverse-geocoding service / external egress from the backend.
- No continuous/background location tracking. Location is captured on explicit user
  action (enabling the toggle or pressing "Use my device location") and on settings open.
- No use outside the agents endpoint (tools are an agents feature).

## Decisions (locked)

| Decision | Choice |
|---|---|
| Exposure | Tool only (`get_location`), per-agent opt-in in the tool picker |
| Source | Opt-in browser geolocation + manual text fallback |
| Tool output | Reverse-geocoded place + coordinates + timezone (+ source) |
| Reverse geocoding | **Client-side**, configurable CORS endpoint; raw coords never sent to server |
| Persistence | `user.personalization.location` (user profile) |
| Settings home | Settings → Personalization tab |
| Admin config | `librechat.yaml` `location` block, default enabled |
| Privacy | Coordinates rounded (~2 decimals) before storage; raw GPS never persisted |

## Data flow

```
Settings → Personalization tab
  ├─ Switch "Share my location with agents"  → personalization.location.enabled
  ├─ "Use my device location" button
  │     → navigator.geolocation.getCurrentPosition() → { lat, lng }
  │     → Intl.DateTimeFormat().resolvedOptions().timeZone
  │     → client-side reverse geocode (configurable endpoint) → place string
  └─ "Set location manually" Input → manual override string
        │
        ▼  PATCH /api/user/settings/location  { enabled, source, manual?, place?, coordinates?, timezone? }
   Backend validates + persists (no geocoding):
   user.personalization.location = { enabled, source, manual?, place?, coordinates?, timezone?, updatedAt }
        │
        ▼
   Agent run → initialize.ts instantiates createLocationTool({ userId, getUserLocation })
        │
        ▼
   Model calls get_location → reads stored location →
        returns { place, coordinates, timezone, source } when enabled,
        or a graceful "user has not shared their location" message otherwise.
```

## Data model

Extend the existing `personalization` object on the user (where `memories` already
lives). No new collection.

```ts
// packages/data-schemas/src/types/user.ts — IUser.personalization & UpdateUserRequest.personalization
// packages/data-provider/src/types.ts     — TUser.personalization
location?: {
  enabled: boolean;
  source?: 'auto' | 'manual';
  manual?: string;                 // user-typed override; used as place when set
  place?: string;                  // resolved "City, Region, Country"
  coordinates?: { latitude: number; longitude: number }; // rounded ~2 decimals
  timezone?: string;               // IANA tz (Intl), e.g. "Europe/Berlin"
  updatedAt?: Date;
};
```

Schema definition mirrors the existing `personalization.memories` field in
`packages/data-schemas/src/schema/user.ts`.

**Precedence:** when `manual` is a non-empty string, the tool reports it as `place`
(explicit override). Otherwise it reports the device-derived `place`/`coordinates`.

## Backend

### Persistence
- `updateUserLocation(userId, location)` method in
  `packages/data-schemas/src/methods/user.ts`, using dot-notation `$set`
  (mirrors `toggleUserMemories`). Sets `personalization.location.*` and `updatedAt`.
- Controller (new, e.g. `api/server/controllers/LocationController.js` or a handler
  added alongside the existing settings controllers) that validates the body and calls
  `updateUserLocation`. Validation: bound string lengths (`manual`, `place`, `timezone`),
  numeric/finite coordinates re-rounded server-side, `enabled` boolean. Trusting
  client-supplied `place` is acceptable (same trust level as the manual field; it is the
  user's own profile data).
- Route `PATCH /api/user/settings/location` in `api/server/routes/settings.js`
  (next to `favorites` and `skills/active`).

### Tool
- New built-in definition `get_location` in
  `packages/api/src/tools/registry/definitions.ts` (`toolType: 'builtin'`, empty input
  schema) so it appears in the agent-builder tool picker and loads via
  `loadToolDefinitions()`.
- `createLocationTool({ userId, getUserLocation })` factory in a new
  `packages/api/src/agents/location.ts`, mirroring `createMemoryTool` in
  `packages/api/src/agents/memory.ts` (closure over `userId`, returns a
  `DynamicStructuredTool` with an empty zod schema).
- Instantiated per-request in `packages/api/src/agents/initialize.ts` at the same point
  the other context-bound tools are wired, and included in the agent's tool list when the
  agent has `get_location` enabled.
- Output: a compact, model-friendly object/string with `place`, `coordinates`,
  `timezone`, and `source`. When the feature is admin-disabled, the user has not opted in,
  or no data exists, return a clear message (e.g. "The user has not shared their
  location.") so the model degrades gracefully rather than erroring.

### Gating
- The tool returns real data only when **both** the admin feature flag is on **and**
  `user.personalization.location.enabled` is true.

## Frontend

### Personalization tab
`client/src/components/Nav/SettingsTabs/Personalization.tsx` — add a "Location" section
below the existing Memory section:
- `Switch` "Share my location with agents" (master opt-in), wired to
  `personalization.location.enabled`.
- "Use my device location" button → `navigator.geolocation.getCurrentPosition`, capture
  `Intl` timezone, client-side reverse geocode, then persist. Handle denied/unavailable
  permission with a toast and fall back to the manual field.
- Manual `Input` "Set location manually" (override), persisted on change (debounced).
- Reuse the existing optimistic-update + `useToastContext` pattern from the memory toggle;
  accessible labels via `aria-labelledby`/`aria-describedby`.
- The Personalization tab is gated by `usePersonalizationAccess`; ensure the location
  feature contributes to `hasAnyPersonalizationFeature` so the tab shows when enabled.

### Client-side geocoding utility
A small helper (e.g. `client/src/utils/geocode.ts`) that calls the configured CORS
reverse-geocoding endpoint and returns a place string. Default: BigDataCloud's free,
no-key client endpoint
(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=…&longitude=…&localityLanguage=en`),
which is CORS-enabled and requires no API key. Endpoint URL comes from startup config
(admin-overridable). Network/permission failures degrade to "coordinates only" (place
undefined) without blocking save.

### data-provider wiring
- `api-endpoints.ts`: `userLocation()` → `/api/user/settings/location`.
- `data-service.ts`: `updateUserLocation(payload)`.
- `keys.ts`: query key if needed (user query already carries personalization).
- Hook `useUpdateLocationPreferencesMutation` (mirrors
  `useUpdateMemoryPreferencesMutation`), invalidating the user query on success.

### Localization
English keys only in `client/src/locales/en/translation.json`, e.g.
`com_ui_location`, `com_ui_share_location_with_agents`,
`com_ui_share_location_with_agents_description`, `com_ui_use_device_location`,
`com_ui_set_location_manually`, plus error/permission toasts. All copy via `useLocalize()`.

## Admin configuration

Add a `location` block to the `librechat.yaml` config schema
(`packages/data-provider/src/config.ts`), default enabled:

```yaml
location:
  enabled: true                         # gates feature, Personalization control, and tool
  geocoder:
    # optional override; default is BigDataCloud's free no-key client endpoint
    endpoint: "https://api.bigdatacloud.net/data/reverse-geocode-client"
```

Surface the resolved flag (and geocoder endpoint) to the client through the existing
startup-config endpoint so the frontend can hide the control and the geocode utility can
target the right endpoint. The backend tool independently respects `location.enabled`.

## Privacy

- Browser reverse-geocodes; only the resolved place + **rounded** coordinates (~2 decimals,
  ~1 km) + timezone reach the server. Raw precise GPS is never transmitted or persisted.
- Server re-rounds coordinates defensively before storage.
- Tool returns identifying data only when the user has explicitly opted in.

## Testing

- **data-schemas** (`mongodb-memory-server`): `updateUserLocation` persists/updates nested
  `personalization.location` fields; round-trips through the real schema.
- **Tool** (`packages/api`): `createLocationTool` returns the expected shape when location
  is enabled+present, and the graceful message when disabled/empty. Real closure, no SDK stubs.
- **Controller/route**: validation rejects malformed payloads; valid payload persists.
- **Frontend**: Personalization "Location" section renders; toggle and manual input call the
  mutation; geolocation-denied path shows a toast and keeps manual entry usable. Cover
  loading/success/error states.

## Primary implementation risk

The exact registration path for a **per-request, context-bound built-in tool** to appear in
the agent-builder tool picker and execute under both the legacy and event-driven tool paths
needs verification first (model on `createMemoryTool` + `tools/registry/definitions.ts` +
`initialize.ts`). Confirm this end-to-end before building the UI/persistence layers.
