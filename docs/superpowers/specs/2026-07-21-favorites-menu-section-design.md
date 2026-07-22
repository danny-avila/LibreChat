# "My Favorites" Section in the Model Dropdown — Design

## Status
Approved by user 2026-07-21. Ready for implementation planning.

## Purpose

The model-selection dropdown (`ModelSelector.tsx`) already lets users pin
models, modelSpecs presets, and agents via an existing `Pin`/`PinOff`
toggle on each row (`ModelSpecItem.tsx`, `EndpointModelItem.tsx`), backed
by a full favorites system (`useFavorites` hook, `User.favorites` in
MongoDB, synced via `useGetFavoritesQuery`/`useUpdateFavoritesMutation`).
Pinning is currently write-only — nothing in the menu reads the favorites
list back and displays it. This spec adds a "My Favorites" section to the
dropdown that surfaces everything the user has pinned, grouped by
provider.

## Requirements (confirmed with user)

1. **Scope**: All three pinnable types appear in My Favorites — plain
   endpoint models, modelSpecs presets, and agents.
2. **Position**: The My Favorites section renders at the very top of the
   dropdown, above the existing ungrouped modelSpecs / endpoints / custom
   groups.
3. **Empty state**: If the user has zero pinned items, the section does
   not render at all (no placeholder/hint).
4. **Grouping**:
   - Plain models group by their `endpoint` (e.g. Anthropic, OpenRouter,
     Google Gemini) — the same provider concept used elsewhere in the app.
   - ModelSpecs group by their existing `spec.group` field — the same
     field already driving provider grouping for the non-favorited
     specs list (see `CustomGroup.tsx`).
   - Agents have no natural provider and all go into a single "Agents"
     bucket, separate from the provider groups.
5. **Stale favorites**: If a favorite reference can't be resolved against
   currently available models/specs/agents (e.g. the model was removed
   from `librechat.yaml`, or an agent was deleted), it is silently
   skipped — never rendered as a broken/blank row.

## Data Flow

No new persistence. The existing `useFavorites` hook (`client/src/hooks/
useFavorites.ts`) already returns the full favorites list as loaded from
the server. Each entry is one of:

```
{ model: string, endpoint: string }   // plain model
{ spec: string }                       // modelSpecs preset, by name
{ agentId: string }                    // agent
```

New logic (client-side only, no backend changes):

1. **Resolve** each favorite entry against data already loaded in the
   menu's rendering context:
   - `{model, endpoint}` → look up in `mappedEndpoints` (already available
     via `ModelSelectorContext`) to get display name/icon.
   - `{spec}` → look up by `name` in the loaded `modelSpecs.list`.
   - `{agentId}` → look up in the loaded agents list.
   - Unresolvable entries are dropped from the resolved list.
2. **Bucket** resolved items:
   - models → keyed by `endpoint`
   - specs → keyed by `spec.group` (specs without a `group` fall into an
     "Other" bucket within favorites, consistent with how ungrouped specs
     are handled elsewhere)
   - agents → single `"Agents"` bucket
3. **Render**: if the resolved+bucketed list is non-empty, render one
   top-level "My Favorites" section as the first item in the menu, ahead
   of the current `renderModelSpecs()` → `renderEndpoints()` →
   `renderCustomGroups()` sequence in `ModelSelector.tsx`. Inside it,
   render one sub-group per bucket, reusing the existing `CustomGroup`
   grouping/collapsing pattern rather than a new visual component. Each
   row reuses the existing row components (`ModelSpecItem`,
   `EndpointModelItem`, and an equivalent row for agents) so selection and
   the pin/unpin toggle behave identically to the rest of the menu.

## Component Design

- New: a thin composition layer (component or function, exact shape
  decided during implementation planning) that performs the resolve +
  bucket step and feeds the result into the existing `CustomGroup`
  rendering, labeled "My Favorites" at the top level.
- Modified: `ModelSelector.tsx` — insert the new favorites render call
  before the existing three render calls.
- No changes to `useFavorites.ts`, the favorites backend routes, or the
  `User.favorites` schema — this is purely an additive read/render layer.

## Edge Cases

- Zero favorites → section omitted entirely (per requirement 3).
- A favorite whose underlying model/spec/agent no longer exists → skipped
  silently (per requirement 5); this also means the resolve step must not
  throw on a missing lookup, only return `undefined`/skip.
- A favorited spec with no `group` set → falls into an "Other" bucket
  within the favorites section, not left ungrouped/unlabeled.
- User has favorites but all of them are unresolvable (fully stale list)
  → section is omitted, same as zero favorites (falls out of requirement
  3 naturally once resolution happens before the empty check).

## Out of Scope

- Reordering/drag-and-drop of favorites.
- Any change to how pinning itself works (the existing toggle, the
  50-item cap, the MongoDB schema) — untouched.
- Changing what counts as "provider" for models/specs — reusing existing
  `endpoint`/`spec.group` fields as-is, no new categorization scheme.

## Testing Considerations

- Unit test the resolve+bucket logic directly (pure function over a
  favorites array + loaded endpoints/specs/agents), independent of
  rendering — per this repo's testing philosophy (real logic over mocks).
- Component-level test confirming the section is absent with zero
  favorites and present with a mix of all three types, correctly grouped.
- Cover the stale-reference case explicitly (a favorite pointing at a
  since-removed model does not render or crash).
