# Location Tool for Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a built-in `get_location` agent tool that returns the user's current location (place, coordinates, timezone), sourced from opt-in browser geolocation with a manual fallback, configured in Settings → Personalization.

**Architecture:** The client captures coordinates (`navigator.geolocation`) + timezone (`Intl`), reverse-geocodes **in the browser** via a configurable CORS endpoint, and persists only the resolved place + rounded coords + timezone to `user.personalization.location`. A new `get_location` structured tool reads that stored location at call time and returns it to the agent. An admin `location` block in `librechat.yaml` gates the feature and sets the geocoder endpoint, surfaced to the client via startup config.

**Tech Stack:** TypeScript (packages/data-provider, packages/data-schemas, packages/api), JS (api/ Express + structured tool), React + React Query + Recoil (client), Jest + mongodb-memory-server.

**Spec:** `docs/superpowers/specs/2026-06-15-location-tool-for-agents-design.md`

**Conventions:** Commit messages are plain, no AI attribution. Run `npm run build:data-provider` after editing `packages/data-provider`, and build data-schemas after editing it, so downstream workspaces pick up types. Tests run per-workspace (`cd <workspace> && npx jest <pattern>`).

---

## File Map

| File | Change | Responsibility |
|---|---|---|
| `packages/data-provider/src/types.ts` | modify | `TUserLocation` type; add `location` to the three `personalization` shapes |
| `packages/data-schemas/src/types/user.ts` | modify | add `location` to `IUser` + `UpdateUserRequest` personalization; declare `updateUserLocation` method type |
| `packages/data-schemas/src/schema/user.ts` | modify | persist nested `personalization.location` fields |
| `packages/data-schemas/src/methods/user.ts` | modify | `updateUserLocation` method + export |
| `packages/api/src/agents/location.ts` | create | pure `formatLocationToolResult` formatter (TS, testable) |
| `packages/api/src/index.ts` (barrel) | modify | export `formatLocationToolResult` |
| `api/app/clients/tools/structured/GetLocation.js` | create | `createLocationTool` factory (reads req.user location + config) |
| `api/app/clients/tools/index.js` | modify | export `createLocationTool` |
| `api/app/clients/tools/util/handleTools.js` | modify | register `get_location` in `customConstructors` |
| `api/app/clients/tools/manifest.json` | modify | tool-picker entry |
| `packages/api/src/tools/registry/definitions.ts` | modify | event-driven tool definition |
| `api/server/controllers/LocationController.js` | create | validate + persist location preference |
| `api/server/routes/settings.js` | modify | `PATCH /api/user/settings/location` |
| `packages/data-provider/src/config.ts` | modify | `locationSchema` + root config + `TStartupConfig` |
| `packages/data-schemas/src/app/location.ts` | create | `loadLocationConfig` |
| `packages/data-schemas/src/app/service.ts` | modify | wire `loadLocationConfig` into resolved config |
| `api/server/routes/config.js` | modify | surface `location` in startup config |
| `packages/data-provider/src/api-endpoints.ts` | modify | `userLocation()` endpoint |
| `packages/data-provider/src/data-service.ts` | modify | `updateUserLocation()` data-service fn |
| `packages/data-provider/src/keys.ts` | modify | `updateUserLocation` mutation key |
| `client/src/data-provider/Location/queries.ts` | create | `useUpdateUserLocationMutation` |
| `client/src/data-provider/Location/index.ts` | create | barrel |
| `client/src/data-provider/index.ts` | modify | re-export Location hooks |
| `client/src/utils/geocode.ts` | create | client-side reverse-geocode helper |
| `client/src/hooks/usePersonalizationAccess.ts` | modify | add `hasLocationSharing` from startup config |
| `client/src/components/Nav/Settings.tsx` | modify | thread `hasLocationSharing` prop |
| `client/src/components/Nav/SettingsTabs/Personalization.tsx` | modify | Location section UI |
| `client/src/locales/en/translation.json` | modify | English copy |

---

## Task 1: Shared `TUserLocation` type (data-provider)

**Files:**
- Modify: `packages/data-provider/src/types.ts` (the three `personalization?: { memories?: boolean }` declarations near lines 51, 96, 225)

- [ ] **Step 1: Add the `TUserLocation` type**

In `packages/data-provider/src/types.ts`, add near the other user-related types (e.g. just above the `TUser` type definition):

```ts
export type TUserLocationCoordinates = {
  latitude: number;
  longitude: number;
};

export type TUserLocation = {
  enabled: boolean;
  source?: 'auto' | 'manual';
  /** User-typed override; reported as `place` when set */
  manual?: string;
  /** Resolved "City, Region, Country" */
  place?: string;
  /** Rounded (~2 decimals) for privacy */
  coordinates?: TUserLocationCoordinates;
  /** IANA timezone, e.g. "Europe/Berlin" */
  timezone?: string;
  updatedAt?: string | Date;
};
```

- [ ] **Step 2: Thread `location` into the three personalization shapes**

Replace each of the three occurrences of:

```ts
  personalization?: {
    memories?: boolean;
  };
```

with:

```ts
  personalization?: {
    memories?: boolean;
    location?: TUserLocation;
  };
```

(There are three: `TUser`, and two request/response shapes. Use Grep for `personalization?: {` to find all and edit each.)

- [ ] **Step 3: Build data-provider and typecheck**

Run: `npm run build:data-provider`
Expected: builds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add packages/data-provider/src/types.ts
git commit -m "feat(types): add TUserLocation to user personalization"
```

---

## Task 2: Persist `personalization.location` (data-schemas)

**Files:**
- Modify: `packages/data-schemas/src/schema/user.ts:130-138` (personalization block)
- Modify: `packages/data-schemas/src/types/user.ts` (IUser ~51, UpdateUserRequest ~96, method-type interface ~108)
- Modify: `packages/data-schemas/src/methods/user.ts` (add `updateUserLocation`, export ~519)
- Test: `packages/data-schemas/src/methods/user.methods.spec.ts` (existing file — append a describe block)

- [ ] **Step 1: Write the failing test**

Append to the existing `packages/data-schemas/src/methods/user.methods.spec.ts`, which already sets up `methods = createUserMethods(mongoose)`, registers `mongoose.models.User`, and drops the DB in `beforeEach`. Add only this describe block (reuses the existing `methods` global):

```ts
describe('updateUserLocation', () => {
  it('persists a manual location on a user with no personalization object', async () => {
    const user = await mongoose.models.User.create({ email: 'loc1@test.com' });
    const updated = await methods.updateUserLocation(user._id.toString(), {
      enabled: true,
      source: 'manual',
      manual: 'Berlin, Germany',
      timezone: 'Europe/Berlin',
    });
    expect(updated?.personalization?.location?.enabled).toBe(true);
    expect(updated?.personalization?.location?.manual).toBe('Berlin, Germany');
    expect(updated?.personalization?.location?.timezone).toBe('Europe/Berlin');
  });

  it('persists device coordinates and place', async () => {
    const user = await mongoose.models.User.create({ email: 'loc2@test.com' });
    const updated = await methods.updateUserLocation(user._id.toString(), {
      enabled: true,
      source: 'auto',
      place: 'Paris, Île-de-France, France',
      coordinates: { latitude: 48.85, longitude: 2.35 },
      timezone: 'Europe/Paris',
    });
    expect(updated?.personalization?.location?.place).toBe('Paris, Île-de-France, France');
    expect(updated?.personalization?.location?.coordinates?.latitude).toBe(48.85);
  });

  it('returns null for a missing user', async () => {
    const result = await methods.updateUserLocation(new mongoose.Types.ObjectId().toString(), {
      enabled: false,
    });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/data-schemas && npx jest src/methods/user.methods.spec.ts -t updateUserLocation`
Expected: FAIL — `methods.updateUserLocation is not a function`.

- [ ] **Step 3: Add the schema fields**

In `packages/data-schemas/src/schema/user.ts`, replace the `personalization` block (lines 130-138):

```ts
    personalization: {
      type: {
        memories: {
          type: Boolean,
          default: true,
        },
      },
      default: {},
    },
```

with:

```ts
    personalization: {
      type: {
        memories: {
          type: Boolean,
          default: true,
        },
        location: {
          type: {
            enabled: { type: Boolean, default: false },
            source: { type: String, enum: ['auto', 'manual'] },
            manual: { type: String, maxlength: 256 },
            place: { type: String, maxlength: 256 },
            coordinates: {
              type: {
                latitude: { type: Number },
                longitude: { type: Number },
              },
              default: undefined,
            },
            timezone: { type: String, maxlength: 64 },
            updatedAt: { type: Date },
          },
          default: undefined,
        },
      },
      default: {},
    },
```

- [ ] **Step 4: Add the types**

In `packages/data-schemas/src/types/user.ts`, update both `IUser` and `UpdateUserRequest` personalization shapes from:

```ts
  personalization?: {
    memories?: boolean;
  };
```

to:

```ts
  personalization?: {
    memories?: boolean;
    location?: import('librechat-data-provider').TUserLocation;
  };
```

In the user-methods interface (near the `toggleUserMemories` declaration ~line 108), add:

```ts
  updateUserLocation: (
    userId: string,
    location: import('librechat-data-provider').TUserLocation,
  ) => Promise<IUser | null>;
```

- [ ] **Step 5: Implement `updateUserLocation`**

In `packages/data-schemas/src/methods/user.ts`, add this function next to `toggleUserMemories` (after line 339):

```ts
  /**
   * Update a user's location personalization setting.
   * Creates the personalization object if it doesn't exist.
   */
  async function updateUserLocation(
    userId: string,
    location: import('librechat-data-provider').TUserLocation,
  ): Promise<IUser | null> {
    const User = mongoose.models.User;

    const user = await User.findById(userId);
    if (!user) {
      return null;
    }

    const updateOperation = {
      $set: {
        'personalization.location': { ...location, updatedAt: new Date() },
      },
    };

    return await User.findByIdAndUpdate(userId, updateOperation, {
      new: true,
      runValidators: true,
    }).lean<IUser>();
  }
```

Then add `updateUserLocation` to the returned methods object (next to `toggleUserMemories` near line 519):

```ts
    toggleUserMemories,
    updateUserLocation,
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd packages/data-schemas && npx jest src/methods/user.methods.spec.ts -t updateUserLocation`
Expected: PASS (3 tests).

- [ ] **Step 7: Build data-schemas**

Run: `cd packages/data-schemas && npm run build`
Expected: builds with no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add packages/data-schemas/src/schema/user.ts packages/data-schemas/src/types/user.ts packages/data-schemas/src/methods/user.ts packages/data-schemas/src/methods/user.methods.spec.ts
git commit -m "feat(user): persist personalization.location with updateUserLocation"
```

---

## Task 3: Location result formatter (packages/api)

**Files:**
- Create: `packages/api/src/agents/location.ts`
- Modify: `packages/api/src/agents/index.ts` (barrel export)
- Test: `packages/api/src/agents/location.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/agents/location.spec.ts`:

```ts
import { formatLocationToolResult } from './location';

describe('formatLocationToolResult', () => {
  it('reports a disabled message when the feature is off', () => {
    const result = formatLocationToolResult(
      { enabled: true, place: 'Paris' },
      { featureEnabled: false },
    );
    expect(result).toMatch(/disabled/i);
  });

  it('reports not-shared when the user has not opted in', () => {
    const result = formatLocationToolResult(undefined, { featureEnabled: true });
    expect(result).toMatch(/has not shared/i);
  });

  it('reports not-shared when enabled is false', () => {
    const result = formatLocationToolResult({ enabled: false }, { featureEnabled: true });
    expect(result).toMatch(/has not shared/i);
  });

  it('prefers the manual override as the place', () => {
    const result = formatLocationToolResult(
      { enabled: true, source: 'manual', manual: 'Tokyo, Japan', place: 'ignored' },
      { featureEnabled: true },
    );
    expect(result).toContain('Tokyo, Japan');
    expect(result).not.toContain('ignored');
  });

  it('includes place, coordinates, and timezone for device location', () => {
    const result = formatLocationToolResult(
      {
        enabled: true,
        source: 'auto',
        place: 'Paris, Île-de-France, France',
        coordinates: { latitude: 48.85, longitude: 2.35 },
        timezone: 'Europe/Paris',
      },
      { featureEnabled: true },
    );
    expect(result).toContain('Paris, Île-de-France, France');
    expect(result).toContain('48.85');
    expect(result).toContain('2.35');
    expect(result).toContain('Europe/Paris');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/api && npx jest src/agents/location.spec.ts`
Expected: FAIL — cannot find module `./location`.

- [ ] **Step 3: Implement the formatter**

Create `packages/api/src/agents/location.ts`:

```ts
import type { TUserLocation } from 'librechat-data-provider';

export interface FormatLocationOptions {
  /** Resolved admin feature flag (`librechat.yaml` location.enabled) */
  featureEnabled: boolean;
}

const NOT_SHARED = 'The user has not shared their location.';
const DISABLED = 'The location feature is disabled by the administrator.';

/**
 * Formats the user's stored location into a concise, model-friendly string.
 * Returns a graceful message when the feature is disabled or no location is shared.
 */
export function formatLocationToolResult(
  location: TUserLocation | undefined,
  options: FormatLocationOptions,
): string {
  if (!options.featureEnabled) {
    return DISABLED;
  }
  if (!location || location.enabled !== true) {
    return NOT_SHARED;
  }

  const place = location.manual?.trim() || location.place?.trim();
  const parts: string[] = [];
  if (place) {
    parts.push(`Location: ${place}`);
  }
  if (location.coordinates) {
    const { latitude, longitude } = location.coordinates;
    parts.push(`Coordinates: ${latitude}, ${longitude}`);
  }
  if (location.timezone) {
    parts.push(`Timezone: ${location.timezone}`);
  }

  if (parts.length === 0) {
    return NOT_SHARED;
  }
  return parts.join('\n');
}
```

- [ ] **Step 4: Export from the package barrel**

`packages/api/src/index.ts` does `export * from './agents'` (line 44), and `packages/api/src/agents/index.ts` re-exports sibling modules (e.g. `export * from './memory';` at line 12). Add to `packages/api/src/agents/index.ts`:

```ts
export * from './location';
```

This makes `formatLocationToolResult` reachable as `require('@librechat/api').formatLocationToolResult`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/api && npx jest src/agents/location.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Build packages/api**

Run: `cd packages/api && npm run build`
Expected: builds with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/agents/location.ts packages/api/src/agents/location.spec.ts packages/api/src/agents/index.ts
git commit -m "feat(api): add formatLocationToolResult helper"
```

---

## Task 4: `get_location` structured tool (api/)

**Files:**
- Create: `api/app/clients/tools/structured/GetLocation.js`
- Modify: `api/app/clients/tools/index.js` (export)
- Modify: `api/app/clients/tools/util/handleTools.js` (import + `customConstructors`)
- Modify: `api/app/clients/tools/manifest.json` (picker entry)
- Modify: `packages/api/src/tools/registry/definitions.ts` (event-driven definition)
- Test: `api/app/clients/tools/structured/GetLocation.spec.js`

- [ ] **Step 1: Write the failing test**

Create `api/app/clients/tools/structured/GetLocation.spec.js`:

```js
const createLocationTool = require('./GetLocation');

const makeReq = ({ location, featureEnabled = true } = {}) => ({
  config: { location: { enabled: featureEnabled } },
  user: { id: 'user-1', personalization: location ? { location } : {} },
});

describe('createLocationTool', () => {
  it('returns the user location when enabled', async () => {
    const tool = await createLocationTool({
      userId: 'user-1',
      req: makeReq({
        location: {
          enabled: true,
          source: 'manual',
          manual: 'Berlin, Germany',
          timezone: 'Europe/Berlin',
        },
      }),
    });
    const result = await tool.invoke({});
    expect(result).toContain('Berlin, Germany');
    expect(result).toContain('Europe/Berlin');
  });

  it('returns a not-shared message when the user has not opted in', async () => {
    const tool = await createLocationTool({ userId: 'user-1', req: makeReq({}) });
    const result = await tool.invoke({});
    expect(result).toMatch(/has not shared/i);
  });

  it('returns a disabled message when the admin flag is off', async () => {
    const tool = await createLocationTool({
      userId: 'user-1',
      req: makeReq({ location: { enabled: true, manual: 'X' }, featureEnabled: false }),
    });
    const result = await tool.invoke({});
    expect(result).toMatch(/disabled/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && npx jest app/clients/tools/structured/GetLocation.spec.js`
Expected: FAIL — cannot find module `./GetLocation`.

- [ ] **Step 3: Implement the tool factory**

Create `api/app/clients/tools/structured/GetLocation.js`:

```js
const { tool } = require('@librechat/agents/langchain/tools');
const { formatLocationToolResult } = require('@librechat/api');

const locationSchema = {
  type: 'object',
  properties: {},
  required: [],
};

/**
 * Factory for the `get_location` tool, bound to the current request/user.
 * @param {{ userId?: string, req?: import('express').Request }} params
 * @returns {Promise<import('@librechat/agents/langchain/tools').DynamicStructuredTool>}
 */
module.exports = async function createLocationTool({ req } = {}) {
  return tool(
    async () => {
      const featureEnabled = req?.config?.location?.enabled !== false;
      const location = req?.user?.personalization?.location;
      return formatLocationToolResult(location, { featureEnabled });
    },
    {
      name: 'get_location',
      description:
        "Returns the user's current location (place, coordinates, timezone) when they have shared it. Use it to tailor language, regional context, units, or weather lookups.",
      schema: locationSchema,
    },
  );
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd api && npx jest app/clients/tools/structured/GetLocation.spec.js`
Expected: PASS (3 tests).

If `formatLocationToolResult` is not yet resolvable from `@librechat/api`, run `cd packages/api && npm run build` first (Task 3 must be built so the CJS consumer in `api/` can require it).

- [ ] **Step 5: Export the factory**

In `api/app/clients/tools/index.js`, add the require near the other structured-tool requires and add `createLocationTool` to `module.exports`:

```js
const createLocationTool = require('./structured/GetLocation');
```

and in the exported object, add:

```js
  createLocationTool,
```

- [ ] **Step 6: Register in `handleTools.js`**

In `api/app/clients/tools/util/handleTools.js`, add `createLocationTool` to the destructured import from `'../'` (the same block that imports `OpenWeather`, `FluxAPI`, etc.), then add an entry to `customConstructors` (after the `gemini_image_gen` entry, around line 232):

```js
    get_location: async () => {
      return createLocationTool({ userId: user, req: options.req });
    },
```

- [ ] **Step 7: Add the picker manifest entry**

In `api/app/clients/tools/manifest.json`, add an object to the array (mirror the shape of existing no-auth entries; `authConfig: []` keeps it permitted by default):

```json
  {
    "name": "Get Location",
    "pluginKey": "get_location",
    "description": "Returns the user's shared location (place, coordinates, timezone) so the assistant can tailor language, units, and regional context.",
    "icon": "https://raw.githubusercontent.com/danny-avila/LibreChat/main/client/public/assets/web-search.svg",
    "authConfig": []
  }
```

Use an existing bundled icon path/url consistent with neighboring entries (Grep `manifest.json` for `"icon"` and reuse the same style; pick a location/map-appropriate asset if one exists, else reuse a generic one).

- [ ] **Step 8: Add the event-driven definition**

In `packages/api/src/tools/registry/definitions.ts`, add to the `toolDefinitions` record (after the `dalle` entry, ~line 370):

```ts
  get_location: {
    name: 'get_location',
    description:
      "Returns the user's current location (place, coordinates, timezone) when shared.",
    schema: {
      type: 'object',
      properties: {},
      required: [],
    },
    toolType: 'builtin',
  },
```

- [ ] **Step 9: Rebuild packages/api and re-run the tool test**

Run: `cd packages/api && npm run build && cd ../../api && npx jest app/clients/tools/structured/GetLocation.spec.js`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add api/app/clients/tools/structured/GetLocation.js api/app/clients/tools/structured/GetLocation.spec.js api/app/clients/tools/index.js api/app/clients/tools/util/handleTools.js api/app/clients/tools/manifest.json packages/api/src/tools/registry/definitions.ts
git commit -m "feat(tools): add get_location built-in agent tool"
```

---

## Task 5: Persistence endpoint (api/)

**Files:**
- Create: `api/server/controllers/LocationController.js`
- Modify: `api/server/routes/settings.js`
- Test: `api/server/controllers/LocationController.spec.js`

- [ ] **Step 1: Write the failing test**

Create `api/server/controllers/LocationController.spec.js`:

```js
const { updateLocationController } = require('./LocationController');

jest.mock('~/models', () => ({
  updateUserLocation: jest.fn(),
}));
const { updateUserLocation } = require('~/models');

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('updateLocationController', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a non-boolean enabled', async () => {
    const res = makeRes();
    await updateLocationController({ user: { id: 'u1' }, body: { enabled: 'yes' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(updateUserLocation).not.toHaveBeenCalled();
  });

  it('persists a valid payload with rounded coordinates', async () => {
    updateUserLocation.mockResolvedValue({
      personalization: { location: { enabled: true } },
    });
    const res = makeRes();
    await updateLocationController(
      {
        user: { id: 'u1' },
        body: {
          enabled: true,
          source: 'auto',
          place: 'Paris, France',
          coordinates: { latitude: 48.8566, longitude: 2.3522 },
          timezone: 'Europe/Paris',
        },
      },
      res,
    );
    expect(updateUserLocation).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        enabled: true,
        coordinates: { latitude: 48.86, longitude: 2.35 },
      }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ updated: true }),
    );
  });

  it('returns 404 when the user is missing', async () => {
    updateUserLocation.mockResolvedValue(null);
    const res = makeRes();
    await updateLocationController({ user: { id: 'u1' }, body: { enabled: false } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && npx jest server/controllers/LocationController.spec.js`
Expected: FAIL — cannot find module `./LocationController`.

- [ ] **Step 3: Implement the controller**

Create `api/server/controllers/LocationController.js`:

```js
const { logger } = require('@librechat/data-schemas');
const { updateUserLocation } = require('~/models');

const round = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);

/**
 * PATCH /api/user/settings/location
 * Body: TUserLocation. Persists the user's location preference.
 */
const updateLocationController = async (req, res) => {
  const body = req.body || {};
  if (typeof body.enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be a boolean value.' });
  }

  const location = { enabled: body.enabled };
  if (body.source === 'auto' || body.source === 'manual') {
    location.source = body.source;
  }
  const manual = str(body.manual, 256);
  if (manual) {
    location.manual = manual;
  }
  const place = str(body.place, 256);
  if (place) {
    location.place = place;
  }
  const timezone = str(body.timezone, 64);
  if (timezone) {
    location.timezone = timezone;
  }
  const lat = round(body.coordinates?.latitude);
  const lon = round(body.coordinates?.longitude);
  if (lat !== undefined && lon !== undefined) {
    location.coordinates = { latitude: lat, longitude: lon };
  }

  try {
    const updatedUser = await updateUserLocation(req.user.id, location);
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found.' });
    }
    return res.json({ updated: true, location: updatedUser.personalization?.location });
  } catch (error) {
    logger.error('[updateLocationController]', error);
    return res.status(500).json({ error: 'Failed to update location.' });
  }
};

module.exports = { updateLocationController };
```

No `~/models` edit is needed: `api/models/index.js` does `module.exports = { ...methods }` where `methods = createMethods(mongoose, ...)` from `@librechat/data-schemas`. Adding `updateUserLocation` to the object returned by `createUserMethods` (Task 2 Step 5) automatically exposes it as `require('~/models').updateUserLocation`. Rebuild data-schemas (`cd packages/data-schemas && npm run build`) so the compiled output the `api/` workspace consumes includes the new method before running this task's test.

- [ ] **Step 4: Add the route**

In `api/server/routes/settings.js`, add the import and route:

```js
const { updateLocationController } = require('~/server/controllers/LocationController');
```

and below the existing routes:

```js
router.patch('/location', requireJwtAuth, updateLocationController);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd api && npx jest server/controllers/LocationController.spec.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add api/server/controllers/LocationController.js api/server/controllers/LocationController.spec.js api/server/routes/settings.js
git commit -m "feat(settings): add PATCH /api/user/settings/location endpoint"
```

---

## Task 6: Admin config block (`librechat.yaml` → startup config)

**Files:**
- Modify: `packages/data-provider/src/config.ts` (`locationSchema`, root `configSchema`, `TStartupConfig`)
- Create: `packages/data-schemas/src/app/location.ts`
- Modify: `packages/data-schemas/src/app/service.ts` (wire loader into resolved config)
- Modify: `api/server/routes/config.js` (surface in startup config)
- Test: `packages/data-schemas/src/app/location.spec.ts`

- [ ] **Step 1: Write the failing test for the loader**

Create `packages/data-schemas/src/app/location.spec.ts`:

```ts
import { loadLocationConfig } from './location';

describe('loadLocationConfig', () => {
  it('defaults to enabled when unset', () => {
    expect(loadLocationConfig(undefined)).toEqual({ enabled: true });
  });

  it('respects an explicit disable', () => {
    expect(loadLocationConfig({ enabled: false })).toEqual({ enabled: false });
  });

  it('passes through a geocoder endpoint', () => {
    const result = loadLocationConfig({
      enabled: true,
      geocoder: { endpoint: 'https://example.com/geo' },
    });
    expect(result.geocoder?.endpoint).toBe('https://example.com/geo');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/data-schemas && npx jest src/app/location.spec.ts`
Expected: FAIL — cannot find module `./location`.

- [ ] **Step 3: Add the config schema + types (data-provider)**

In `packages/data-provider/src/config.ts`, add the schema near the other feature schemas (e.g. just after `webSearchSchema`):

```ts
export const locationSchema = z.object({
  enabled: z.boolean().default(true),
  geocoder: z
    .object({
      endpoint: z.string().url().optional(),
    })
    .optional(),
});

export type TLocationConfig = z.infer<typeof locationSchema>;
```

Add `location` to the root config object (the `z.object({...})` named `configSchema`, alongside `webSearch`, `memory`, etc.):

```ts
  location: locationSchema.optional(),
```

Add the resolved shape to `TStartupConfig` (alongside the other optional feature flags):

```ts
  location?: {
    enabled: boolean;
    geocoder?: {
      endpoint?: string;
    };
  };
```

(Confirm exact symbol names with Grep for `webSearch:` in `config.ts` and `TStartupConfig`; mirror placement.)

- [ ] **Step 4: Implement the loader (data-schemas)**

Create `packages/data-schemas/src/app/location.ts`:

```ts
import type { TCustomConfig, TLocationConfig } from 'librechat-data-provider';

/**
 * Resolves the `location` section of librechat.yaml into the runtime config.
 * Defaults to enabled when the section is omitted.
 */
export function loadLocationConfig(
  location: TCustomConfig['location'],
): TLocationConfig {
  if (!location) {
    return { enabled: true };
  }
  return {
    enabled: location.enabled ?? true,
    ...(location.geocoder?.endpoint
      ? { geocoder: { endpoint: location.geocoder.endpoint } }
      : {}),
  };
}
```

(If `TCustomConfig` is not the root config type name, Grep `packages/data-schemas/src/app/service.ts` for how `config.webSearch` is typed and reuse that type.)

- [ ] **Step 5: Wire the loader into the resolved config (data-schemas)**

In `packages/data-schemas/src/app/service.ts`, mirror the `webSearch` wiring: import `loadLocationConfig`, call `const location = loadLocationConfig(config.location);`, and add `location` to the returned resolved-config object (next to `webSearch`). Grep the file for `webSearch` to find all three touch points and mirror each.

- [ ] **Step 6: Run the loader test to verify it passes**

Run: `cd packages/data-schemas && npm run build && npx jest src/app/location.spec.ts`
Expected: PASS (3 tests). (Build data-provider first if `TLocationConfig` isn't resolvable: `npm run build:data-provider` from repo root.)

- [ ] **Step 7: Surface in startup config**

In `api/server/routes/config.js`, add a helper and include `location` in both the authenticated and unauthenticated payloads. Mirror how `webSearch` is added (Grep the file for `webSearch`). Helper:

```js
function buildLocationStartupConfig(appConfig) {
  const loc = appConfig?.location;
  if (!loc || loc.enabled === false) {
    return undefined;
  }
  const out = { enabled: true };
  if (loc.geocoder?.endpoint) {
    out.geocoder = { endpoint: loc.geocoder.endpoint };
  }
  return out;
}
```

In each payload-assembly branch, after the `webSearch` assignment:

```js
    const location = buildLocationStartupConfig(appConfig);
    if (location) {
      payload.location = location;
    }
```

(Match the actual local variable name for the resolved config in each branch — it may be `appConfig` or `baseConfig`.)

- [ ] **Step 8: Build and verify no type errors**

Run: `npm run build:data-provider && cd packages/data-schemas && npm run build`
Expected: both build clean.

- [ ] **Step 9: Commit**

```bash
git add packages/data-provider/src/config.ts packages/data-schemas/src/app/location.ts packages/data-schemas/src/app/location.spec.ts packages/data-schemas/src/app/service.ts api/server/routes/config.js
git commit -m "feat(config): add location feature flag and geocoder config"
```

---

## Task 7: Client data-provider wiring

**Files:**
- Modify: `packages/data-provider/src/api-endpoints.ts`
- Modify: `packages/data-provider/src/data-service.ts`
- Modify: `packages/data-provider/src/keys.ts`
- Create: `client/src/data-provider/Location/queries.ts`
- Create: `client/src/data-provider/Location/index.ts`
- Modify: `client/src/data-provider/index.ts`

- [ ] **Step 1: Add the endpoint**

In `packages/data-provider/src/api-endpoints.ts`, near the other `/api/user/settings` endpoints, add:

```ts
export const userLocation = () => `${BASE_URL}/api/user/settings/location`;
```

- [ ] **Step 2: Add the data-service function**

In `packages/data-provider/src/data-service.ts`, add (import `TUserLocation` from the types barrel if not already in scope):

```ts
export const updateUserLocation = (
  location: t.TUserLocation,
): Promise<{ updated: boolean; location?: t.TUserLocation }> => {
  return request.patch(endpoints.userLocation(), location);
};
```

(Match the existing import alias for types in this file — Grep for `TUserFavorite` to see whether types are referenced as `t.TUserFavorite` or imported directly, and mirror it.)

- [ ] **Step 3: Add the mutation key**

In `packages/data-provider/src/keys.ts`, add to the `MutationKeys` enum (next to `updateMemoryPreferences`):

```ts
  updateUserLocation = 'updateUserLocation',
```

- [ ] **Step 4: Build data-provider**

Run: `npm run build:data-provider`
Expected: builds clean.

- [ ] **Step 5: Add the React Query hook**

Create `client/src/data-provider/Location/queries.ts`:

```ts
import { QueryKeys, MutationKeys, dataService } from 'librechat-data-provider';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import type { UseMutationOptions } from '@tanstack/react-query';
import type { TUserLocation } from 'librechat-data-provider';

export type UpdateUserLocationResponse = { updated: boolean; location?: TUserLocation };

export const useUpdateUserLocationMutation = (
  options?: UseMutationOptions<UpdateUserLocationResponse, Error, TUserLocation>,
) => {
  const queryClient = useQueryClient();
  return useMutation<UpdateUserLocationResponse, Error, TUserLocation>(
    [MutationKeys.updateUserLocation],
    (location: TUserLocation) => dataService.updateUserLocation(location),
    {
      ...options,
      onSuccess: (...params) => {
        queryClient.invalidateQueries([QueryKeys.user]);
        options?.onSuccess?.(...params);
      },
    },
  );
};
```

Create `client/src/data-provider/Location/index.ts`:

```ts
export * from './queries';
```

- [ ] **Step 6: Re-export from the data-provider barrel**

In `client/src/data-provider/index.ts`, add (next to the other feature re-exports such as `Memories`):

```ts
export * from './Location';
```

(Match the existing re-export style — some entries use `export * from './Feature/queries'`. Mirror the neighbors.)

- [ ] **Step 7: Typecheck the client**

Run: `cd client && npx tsc --noEmit` (or the project's configured typecheck script if present)
Expected: no new type errors related to these files.

- [ ] **Step 8: Commit**

```bash
git add packages/data-provider/src/api-endpoints.ts packages/data-provider/src/data-service.ts packages/data-provider/src/keys.ts client/src/data-provider/Location client/src/data-provider/index.ts
git commit -m "feat(client): add updateUserLocation data-provider wiring"
```

---

## Task 8: Personalization UI + geocode + gating + localization

**Files:**
- Create: `client/src/utils/geocode.ts`
- Modify: `client/src/hooks/usePersonalizationAccess.ts`
- Modify: `client/src/components/Nav/Settings.tsx`
- Modify: `client/src/components/Nav/SettingsTabs/Personalization.tsx`
- Modify: `client/src/locales/en/translation.json`
- Test: `client/src/components/Nav/SettingsTabs/__tests__/Personalization.spec.tsx`

- [ ] **Step 1: Add localization keys**

In `client/src/locales/en/translation.json`, add (keep alphabetical grouping loose; place near other `com_ui_` keys):

```json
  "com_ui_location": "Location",
  "com_ui_share_location_with_agents": "Share my location with agents",
  "com_ui_share_location_with_agents_description": "Let agents use the get_location tool to read your location for language, units, and regional context",
  "com_ui_use_device_location": "Use my device location",
  "com_ui_set_location_manually": "Set location manually",
  "com_ui_location_detecting": "Detecting your location…",
  "com_ui_location_permission_denied": "Location permission was denied. You can enter a location manually instead.",
  "com_ui_location_unavailable": "Could not detect your location. You can enter one manually instead.",
```

- [ ] **Step 2: Implement the geocode helper**

Create `client/src/utils/geocode.ts`:

```ts
const DEFAULT_ENDPOINT = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

const round = (n: number) => Math.round(n * 100) / 100;

export interface ResolvedLocation {
  place?: string;
  coordinates: { latitude: number; longitude: number };
  timezone?: string;
}

/**
 * Reverse-geocodes coordinates client-side via the configured (CORS) endpoint.
 * Always returns rounded coordinates + timezone; `place` is omitted on failure.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
  endpoint: string = DEFAULT_ENDPOINT,
): Promise<ResolvedLocation> {
  const coordinates = { latitude: round(latitude), longitude: round(longitude) };
  let timezone: string | undefined;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    timezone = undefined;
  }

  try {
    const url = `${endpoint}?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`;
    const response = await fetch(url);
    if (!response.ok) {
      return { coordinates, timezone };
    }
    const data = await response.json();
    const place = [data.city || data.locality, data.principalSubdivision, data.countryName]
      .filter((part: unknown): part is string => typeof part === 'string' && part.length > 0)
      .join(', ');
    return { place: place || undefined, coordinates, timezone };
  } catch {
    return { coordinates, timezone };
  }
}

/**
 * Promisified navigator.geolocation.getCurrentPosition.
 */
export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 600000,
    });
  });
}
```

- [ ] **Step 3: Extend personalization access gating**

Replace `client/src/hooks/usePersonalizationAccess.ts` with:

```ts
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import useHasAccess from './Roles/useHasAccess';
import { useGetStartupConfig } from '~/data-provider';

export default function usePersonalizationAccess() {
  const { data: startupConfig } = useGetStartupConfig();
  const hasMemoryOptOut = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.OPT_OUT,
  });

  const hasLocationSharing = startupConfig?.location?.enabled === true;
  const hasAnyPersonalizationFeature = hasMemoryOptOut || hasLocationSharing;

  return {
    hasMemoryOptOut,
    hasLocationSharing,
    hasAnyPersonalizationFeature,
  };
}
```

- [ ] **Step 4: Thread the prop through Settings.tsx**

In `client/src/components/Nav/Settings.tsx`:
- Update the destructure (line ~37) to include `hasLocationSharing`:

```tsx
  const { hasAnyPersonalizationFeature, hasMemoryOptOut, hasLocationSharing } =
    usePersonalizationAccess();
```

- Pass it to `<Personalization>` (lines ~255-258):

```tsx
                        <Personalization
                          hasMemoryOptOut={hasMemoryOptOut}
                          hasLocationSharing={hasLocationSharing}
                          hasAnyPersonalizationFeature={hasAnyPersonalizationFeature}
                        />
```

- [ ] **Step 5: Write the failing UI test**

Create `client/src/components/Nav/SettingsTabs/__tests__/Personalization.spec.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from 'test/layout-test-utils';
import Personalization from '../Personalization';

const mutate = jest.fn();
jest.mock('~/data-provider', () => ({
  useGetUserQuery: () => ({ data: { personalization: {} } }),
  useGetStartupConfig: () => ({ data: { location: { enabled: true } } }),
  useUpdateMemoryPreferencesMutation: () => ({ mutate: jest.fn(), isLoading: false }),
  useUpdateUserLocationMutation: () => ({ mutate, isLoading: false }),
}));

describe('Personalization location section', () => {
  beforeEach(() => {
    mutate.mockClear();
    // @ts-expect-error test stub
    global.navigator.geolocation = {
      getCurrentPosition: (success: PositionCallback) =>
        success({ coords: { latitude: 48.85, longitude: 2.35 } } as GeolocationPosition),
    };
  });

  it('renders the location toggle and manual field when enabled', () => {
    render(
      <Personalization
        hasMemoryOptOut={false}
        hasLocationSharing
        hasAnyPersonalizationFeature
      />,
    );
    expect(screen.getByText('Share my location with agents')).toBeInTheDocument();
    expect(screen.getByLabelText('Set location manually')).toBeInTheDocument();
    expect(screen.getByText('Use my device location')).toBeInTheDocument();
  });

  it('persists a manual location on blur', async () => {
    render(
      <Personalization
        hasMemoryOptOut={false}
        hasLocationSharing
        hasAnyPersonalizationFeature
      />,
    );
    const input = screen.getByLabelText('Set location manually');
    fireEvent.change(input, { target: { value: 'Tokyo, Japan' } });
    fireEvent.blur(input);
    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ manual: 'Tokyo, Japan', source: 'manual' }),
    );
  });
});
```

- [ ] **Step 6: Run the UI test to verify it fails**

Run: `cd client && npx jest src/components/Nav/SettingsTabs/__tests__/Personalization.spec.tsx`
Expected: FAIL — the location section / props don't exist yet.

- [ ] **Step 7: Implement the Location section**

Replace `client/src/components/Nav/SettingsTabs/Personalization.tsx` with:

```tsx
import { useState, useEffect } from 'react';
import { Switch, Input, useToastContext } from '@librechat/client';
import type { TUserLocation } from 'librechat-data-provider';
import {
  useGetUserQuery,
  useGetStartupConfig,
  useUpdateUserLocationMutation,
  useUpdateMemoryPreferencesMutation,
} from '~/data-provider';
import { reverseGeocode, getCurrentPosition } from '~/utils/geocode';
import { useLocalize } from '~/hooks';

interface PersonalizationProps {
  hasMemoryOptOut: boolean;
  hasLocationSharing: boolean;
  hasAnyPersonalizationFeature: boolean;
}

export default function Personalization({
  hasMemoryOptOut,
  hasLocationSharing,
  hasAnyPersonalizationFeature,
}: PersonalizationProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { data: user } = useGetUserQuery();
  const { data: startupConfig } = useGetStartupConfig();

  const [referenceSavedMemories, setReferenceSavedMemories] = useState(true);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [manualLocation, setManualLocation] = useState('');
  const [detecting, setDetecting] = useState(false);

  const updateMemoryPreferencesMutation = useUpdateMemoryPreferencesMutation({
    onSuccess: () => {
      showToast({ message: localize('com_ui_preferences_updated'), status: 'success' });
    },
    onError: () => {
      showToast({ message: localize('com_ui_error_updating_preferences'), status: 'error' });
      setReferenceSavedMemories((prev) => !prev);
    },
  });

  const updateLocationMutation = useUpdateUserLocationMutation({
    onSuccess: () => {
      showToast({ message: localize('com_ui_preferences_updated'), status: 'success' });
    },
    onError: () => {
      showToast({ message: localize('com_ui_error_updating_preferences'), status: 'error' });
    },
  });

  useEffect(() => {
    if (user?.personalization?.memories !== undefined) {
      setReferenceSavedMemories(user.personalization.memories);
    }
  }, [user?.personalization?.memories]);

  useEffect(() => {
    const loc = user?.personalization?.location;
    if (loc) {
      setLocationEnabled(loc.enabled ?? false);
      setManualLocation(loc.manual ?? '');
    }
  }, [user?.personalization?.location]);

  const handleMemoryToggle = (checked: boolean) => {
    setReferenceSavedMemories(checked);
    updateMemoryPreferencesMutation.mutate({ memories: checked });
  };

  const persistLocation = (payload: TUserLocation) => updateLocationMutation.mutate(payload);

  const handleLocationToggle = (checked: boolean) => {
    setLocationEnabled(checked);
    persistLocation({ enabled: checked, source: 'manual', manual: manualLocation || undefined });
  };

  const handleManualBlur = () => {
    if (!locationEnabled && !manualLocation) {
      return;
    }
    persistLocation({
      enabled: locationEnabled,
      source: 'manual',
      manual: manualLocation || undefined,
    });
  };

  const handleUseDeviceLocation = async () => {
    setDetecting(true);
    try {
      const position = await getCurrentPosition();
      const resolved = await reverseGeocode(
        position.coords.latitude,
        position.coords.longitude,
        startupConfig?.location?.geocoder?.endpoint,
      );
      setLocationEnabled(true);
      persistLocation({
        enabled: true,
        source: 'auto',
        place: resolved.place,
        coordinates: resolved.coordinates,
        timezone: resolved.timezone,
      });
    } catch (error) {
      const denied =
        typeof GeolocationPositionError !== 'undefined' &&
        error instanceof GeolocationPositionError &&
        error.code === error.PERMISSION_DENIED;
      showToast({
        message: localize(
          denied ? 'com_ui_location_permission_denied' : 'com_ui_location_unavailable',
        ),
        status: 'warning',
      });
    } finally {
      setDetecting(false);
    }
  };

  if (!hasAnyPersonalizationFeature) {
    return (
      <div className="flex flex-col gap-3 text-sm text-text-primary">
        <div className="text-text-secondary">
          {localize('com_ui_no_personalization_available')}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 text-sm text-text-primary">
      {hasMemoryOptOut && (
        <>
          <div className="border-b border-border-medium pb-3">
            <div className="text-base font-semibold">{localize('com_ui_memory')}</div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div id="reference-saved-memories-label" className="flex items-center gap-2">
                {localize('com_ui_reference_saved_memories')}
              </div>
              <div
                id="reference-saved-memories-description"
                className="mt-1 text-xs text-text-secondary"
              >
                {localize('com_ui_reference_saved_memories_description')}
              </div>
            </div>
            <Switch
              checked={referenceSavedMemories}
              onCheckedChange={handleMemoryToggle}
              disabled={updateMemoryPreferencesMutation.isLoading}
              aria-labelledby="reference-saved-memories-label"
              aria-describedby="reference-saved-memories-description"
            />
          </div>
        </>
      )}

      {hasLocationSharing && (
        <>
          <div className="border-b border-border-medium pb-3 pt-2">
            <div className="text-base font-semibold">{localize('com_ui_location')}</div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div id="share-location-label" className="flex items-center gap-2">
                {localize('com_ui_share_location_with_agents')}
              </div>
              <div id="share-location-description" className="mt-1 text-xs text-text-secondary">
                {localize('com_ui_share_location_with_agents_description')}
              </div>
            </div>
            <Switch
              checked={locationEnabled}
              onCheckedChange={handleLocationToggle}
              disabled={updateLocationMutation.isLoading}
              aria-labelledby="share-location-label"
              aria-describedby="share-location-description"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="manual-location-input" className="text-xs text-text-secondary">
              {localize('com_ui_set_location_manually')}
            </label>
            <Input
              id="manual-location-input"
              value={manualLocation}
              onChange={(e) => setManualLocation(e.target.value)}
              onBlur={handleManualBlur}
              aria-label={localize('com_ui_set_location_manually')}
              className="flex h-10 w-full px-3 py-2"
            />
            <button
              type="button"
              onClick={handleUseDeviceLocation}
              disabled={detecting}
              className="self-start rounded-md border border-border-medium px-3 py-1.5 text-xs text-text-primary hover:bg-surface-hover disabled:opacity-50"
            >
              {detecting
                ? localize('com_ui_location_detecting')
                : localize('com_ui_use_device_location')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

(Confirm `Input` is exported from `@librechat/client`; the spec investigation showed it is. If `showToast` doesn't accept `'warning'`, use `'error'`.)

- [ ] **Step 8: Run the UI test to verify it passes**

Run: `cd client && npx jest src/components/Nav/SettingsTabs/__tests__/Personalization.spec.tsx`
Expected: PASS (2 tests). Adjust the input query selector in the test if needed to match the rendered label/placeholder.

- [ ] **Step 9: Commit**

```bash
git add client/src/utils/geocode.ts client/src/hooks/usePersonalizationAccess.ts client/src/components/Nav/Settings.tsx client/src/components/Nav/SettingsTabs/Personalization.tsx client/src/components/Nav/SettingsTabs/__tests__/Personalization.spec.tsx client/src/locales/en/translation.json
git commit -m "feat(settings): add location sharing controls to Personalization"
```

---

## Task 9: End-to-end verification

- [ ] **Step 1: Run all touched workspaces' tests**

```bash
cd packages/data-schemas && npx jest src/methods/user.spec.ts src/app/location.spec.ts
cd ../api && npx jest src/agents/location.spec.ts
cd ../../api && npx jest app/clients/tools/structured/GetLocation.spec.js server/controllers/LocationController.spec.js
cd ../client && npx jest src/components/Nav/SettingsTabs/__tests__/Personalization.spec.tsx
```
Expected: all PASS.

- [ ] **Step 2: Full build**

Run: `npm run build`
Expected: Turborepo builds all workspaces with no errors.

- [ ] **Step 3: Manual smoke test (optional but recommended)**

Start backend + frontend (`npm run backend` + `npm run frontend:dev`). In Settings → Personalization, enable "Share my location with agents", click "Use my device location" (allow the browser prompt) or type a manual location. Create/edit an agent, add the "Get Location" tool, and ask the agent "where am I?" — confirm it calls `get_location` and reports the stored place/timezone. Verify that setting `location.enabled: false` in `librechat.yaml` hides the Personalization location section and makes the tool return the disabled message.

- [ ] **Step 4: Final commit (if any cleanup)**

```bash
git add -A
git commit -m "test: verify location tool end-to-end"
```

---

## Notes on conventions followed

- New backend logic is TypeScript in `packages/api` (`formatLocationToolResult`) and `packages/data-schemas` (`updateUserLocation`, `loadLocationConfig`); the `/api` additions are thin (a structured-tool factory, a controller, a route) that call into those.
- Types are shared via `librechat-data-provider` (`TUserLocation`) — no duplication.
- All user-facing strings use `useLocalize()` with English-only keys; the toggle/input carry `aria-labelledby`/`aria-describedby`/`aria-label`.
- No `useEffect` for derived state — effects only sync local form state from the fetched user (an external system), matching the existing memory-toggle pattern.
- Tests exercise real logic with `mongodb-memory-server` and real tool/formatter code; only the external geolocation/HTTP boundary and model barrel are stubbed.
```
