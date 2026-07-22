# My Favorites Dropdown Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "My Favorites" section to the top of LibreChat's model-selection dropdown, showing every pinned model/modelSpec/agent grouped by provider, using the favorites system that already exists but is currently write-only.

**Architecture:** A new pure function (`resolveFavoriteGroups`) resolves the raw favorites list (`{model,endpoint}` / `{spec}` / `{agentId}` refs) against data already loaded in the menu (`mappedEndpoints`, `modelSpecs`, `agentsMap`) into provider-bucketed groups, dropping anything that no longer resolves (stale favorites). A new `FavoritesSection` component renders those groups by reusing the *existing* row components (`ModelSpecItem`, `EndpointModelItem`) so selection and the pin/unpin toggle behave identically to the rest of the menu — no new selection logic, no backend changes. A small shared `GroupMenu` wrapper is extracted from the existing `CustomGroup` component so both the provider-groups-within-favorites and the existing custom-groups-by-provider share one collapsible-group implementation instead of duplicating it.

**Tech Stack:** React + TypeScript (client), Jest + `@testing-library/react` for tests, Jotai (favorites client cache), React Query (favorites server sync — untouched by this plan).

## Global Constraints

- All new/modified frontend code is TypeScript with explicit types — no `any`, minimal `unknown` (per `CLAUDE.md` Type Safety).
- All user-facing text uses `useLocalize()`; new English keys only go in `client/src/locales/en/translation.json` (per `CLAUDE.md` Frontend Rules > Localization).
- No backend/schema changes — the favorites data model, `MAX_FAVORITES` cap, and sync mechanism are untouched (per spec's "Out of Scope").
- Zero favorites (or all-stale favorites) → the "My Favorites" section does not render at all (per spec requirement 3).
- A favorite that can't be resolved against currently-available models/specs/agents is silently skipped, never rendered broken (per spec requirement 5).
- Tests follow this repo's existing patterns exactly: `jest.mock()` for hooks/context (not deep rendering of providers), `@testing-library/react` `render`/`screen`/`fireEvent`, `renderHook`/`act` for hook-only tests — matching `ModelSpecItem.test.tsx` and `useFavorites.spec.tsx`.

---

### Task 1: Extract shared `GroupMenu` wrapper from `CustomGroup`

**Files:**
- Create: `client/src/components/Chat/Menus/Endpoints/components/GroupMenu.tsx`
- Create: `client/src/components/Chat/Menus/Endpoints/components/__tests__/GroupMenu.test.tsx`
- Modify: `client/src/components/Chat/Menus/Endpoints/components/CustomGroup.tsx`
- Create: `client/src/components/Chat/Menus/Endpoints/components/__tests__/CustomGroup.test.tsx`

**Interfaces:**
- Produces: `GroupMenu` component, default export from `GroupMenu.tsx`, props `{ id: string; groupName: string; groupIcon?: string; children: React.ReactNode }`. Task 3 (`FavoritesSection`) consumes this directly.
- Consumes: nothing new — only existing `CustomMenu` (`Menu`) and `GroupIcon` components already used by `CustomGroup.tsx`.

This task is a pure extraction — no behavior change. `CustomGroup` currently has no test file, so step 1 adds a characterization test for its *current* behavior first, then the refactor must keep that test green.

- [ ] **Step 1: Write a test locking in `CustomGroup`'s current rendered behavior, before refactoring**

Create `client/src/components/Chat/Menus/Endpoints/components/__tests__/CustomGroup.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import type { TModelSpec } from 'librechat-data-provider';
import { CustomGroup } from '../CustomGroup';

jest.mock('~/components/Chat/Menus/Endpoints/ModelSelectorContext', () => ({
  useModelSelectorContext: () => ({
    selectedValues: { endpoint: '', model: '', modelSpec: 'spec-b' },
  }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useFavorites: () => ({
    isFavoriteSpec: () => false,
    toggleFavoriteSpec: jest.fn(),
  }),
  useIsActiveItem: () => ({ ref: { current: null }, isActive: false }),
}));

jest.mock('../SpecIcon', () => ({
  __esModule: true,
  default: () => <span data-testid="spec-icon" />,
}));

const specs: TModelSpec[] = [
  { name: 'spec-a', label: 'Spec A', preset: { endpoint: 'openai', model: 'gpt-5' } },
  { name: 'spec-b', label: 'Spec B', preset: { endpoint: 'openai', model: 'gpt-5' } },
];

describe('CustomGroup', () => {
  it('renders nothing when specs is empty', () => {
    const { container } = render(<CustomGroup groupName="Empty" specs={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the group name and every spec row', () => {
    render(<CustomGroup groupName="My Group" specs={specs} />);
    expect(screen.getByText('My Group')).toBeInTheDocument();
    expect(screen.getByText('Spec A')).toBeInTheDocument();
    expect(screen.getByText('Spec B')).toBeInTheDocument();
  });

  it('marks the selected spec row as selected', () => {
    render(<CustomGroup groupName="My Group" specs={specs} />);
    const rows = screen.getAllByRole('menuitem');
    expect(rows[1]).toHaveAttribute('aria-selected', 'true');
    expect(rows[0]).not.toHaveAttribute('aria-selected');
  });
});
```

- [ ] **Step 2: Run the test to verify it currently passes against the un-refactored `CustomGroup`**

Run: `cd client && npx jest components/Chat/Menus/Endpoints/components/__tests__/CustomGroup.test.tsx`
Expected: PASS (all 3 tests) — this locks in current behavior before touching the code.

- [ ] **Step 3: Create `GroupMenu.tsx` with the extracted wrapper markup**

Create `client/src/components/Chat/Menus/Endpoints/components/GroupMenu.tsx`:

```tsx
import React from 'react';
import { CustomMenu as Menu } from '../CustomMenu';
import GroupIcon from './GroupIcon';

interface GroupMenuProps {
  id: string;
  groupName: string;
  groupIcon?: string;
  children: React.ReactNode;
}

export default function GroupMenu({ id, groupName, groupIcon, children }: GroupMenuProps) {
  return (
    <Menu
      id={id}
      className="transition-opacity duration-200 ease-in-out"
      label={
        <div className="group flex w-full flex-shrink cursor-pointer items-center justify-between rounded-xl px-1 py-1 text-sm">
          <div className="flex items-center gap-2">
            {groupIcon && (
              <div className="flex-shrink-0">
                <GroupIcon iconURL={groupIcon} groupName={groupName} />
              </div>
            )}
            <span className="truncate text-left">{groupName}</span>
          </div>
        </div>
      }
    >
      {children}
    </Menu>
  );
}
```

- [ ] **Step 4: Write a test for `GroupMenu` directly**

Create `client/src/components/Chat/Menus/Endpoints/components/__tests__/GroupMenu.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import GroupMenu from '../GroupMenu';

jest.mock('../GroupIcon', () => ({
  __esModule: true,
  default: ({ groupName }: { groupName: string }) => (
    <span data-testid="group-icon">{groupName}</span>
  ),
}));

describe('GroupMenu', () => {
  it('renders the group name and children', () => {
    render(
      <GroupMenu id="test-menu" groupName="My Group">
        <div>child content</div>
      </GroupMenu>,
    );
    expect(screen.getByText('My Group')).toBeInTheDocument();
    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('does not render a GroupIcon when groupIcon is not provided', () => {
    render(
      <GroupMenu id="test-menu" groupName="My Group">
        <div>child</div>
      </GroupMenu>,
    );
    expect(screen.queryByTestId('group-icon')).not.toBeInTheDocument();
  });

  it('renders a GroupIcon when groupIcon is provided', () => {
    render(
      <GroupMenu id="test-menu" groupName="My Group" groupIcon="https://example.com/icon.png">
        <div>child</div>
      </GroupMenu>,
    );
    expect(screen.getByTestId('group-icon')).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run the new `GroupMenu` test to verify it passes**

Run: `cd client && npx jest components/Chat/Menus/Endpoints/components/__tests__/GroupMenu.test.tsx`
Expected: PASS (all 3 tests)

- [ ] **Step 6: Refactor `CustomGroup` to use `GroupMenu`**

Modify `client/src/components/Chat/Menus/Endpoints/components/CustomGroup.tsx` — replace the full file with:

```tsx
import React from 'react';
import type { TModelSpec } from 'librechat-data-provider';
import { ModelSpecItem } from './ModelSpecItem';
import { useModelSelectorContext } from '../ModelSelectorContext';
import GroupMenu from './GroupMenu';

interface CustomGroupProps {
  groupName: string;
  specs: TModelSpec[];
  groupIcon?: string;
}

export function CustomGroup({ groupName, specs, groupIcon }: CustomGroupProps) {
  const { selectedValues } = useModelSelectorContext();
  const { modelSpec: selectedSpec } = selectedValues;

  if (!specs || specs.length === 0) {
    return null;
  }

  return (
    <GroupMenu id={`custom-group-${groupName}-menu`} groupName={groupName} groupIcon={groupIcon}>
      {specs.map((spec: TModelSpec) => (
        <ModelSpecItem key={spec.name} spec={spec} isSelected={selectedSpec === spec.name} />
      ))}
    </GroupMenu>
  );
}

export function renderCustomGroups(
  modelSpecs: TModelSpec[],
  mappedEndpoints: Array<{ value: string }>,
) {
  // Get all endpoint values to exclude them from custom groups
  const endpointValues = new Set(mappedEndpoints.map((ep) => ep.value));

  // Group specs by their group field (excluding endpoint-matched groups and ungrouped)
  // Also track the groupIcon for each group (first spec with groupIcon wins)
  const customGroups = modelSpecs.reduce(
    (acc, spec) => {
      if (!spec.group || endpointValues.has(spec.group)) {
        return acc;
      }
      if (!acc[spec.group]) {
        acc[spec.group] = { specs: [], groupIcon: undefined };
      }
      acc[spec.group].specs.push(spec);
      // Use the first groupIcon found for the group
      if (!acc[spec.group].groupIcon && spec.groupIcon) {
        acc[spec.group].groupIcon = spec.groupIcon;
      }
      return acc;
    },
    {} as Record<string, { specs: TModelSpec[]; groupIcon?: string }>,
  );

  // Render each custom group
  return Object.entries(customGroups).map(([groupName, { specs, groupIcon }]) => (
    <CustomGroup key={groupName} groupName={groupName} specs={specs} groupIcon={groupIcon} />
  ));
}
```

(Only change from the original: the inline `Menu`/label JSX and the `GroupIcon` import are replaced by the `GroupMenu` import/usage. `renderCustomGroups` is untouched.)

- [ ] **Step 7: Run both `CustomGroup` and `GroupMenu` tests to verify the refactor didn't break anything**

Run: `cd client && npx jest components/Chat/Menus/Endpoints/components/__tests__/CustomGroup.test.tsx components/Chat/Menus/Endpoints/components/__tests__/GroupMenu.test.tsx`
Expected: PASS (all 6 tests — the 3 from Step 1 must still pass unchanged)

- [ ] **Step 8: Commit**

```bash
git add client/src/components/Chat/Menus/Endpoints/components/GroupMenu.tsx client/src/components/Chat/Menus/Endpoints/components/CustomGroup.tsx client/src/components/Chat/Menus/Endpoints/components/__tests__/GroupMenu.test.tsx client/src/components/Chat/Menus/Endpoints/components/__tests__/CustomGroup.test.tsx
git commit -m "refactor: extract GroupMenu wrapper from CustomGroup

Pulls the collapsible-group Menu/label markup out of CustomGroup into
a standalone GroupMenu component so the upcoming My Favorites section
can reuse it instead of duplicating the wrapper JSX. No behavior
change — locked in with a new CustomGroup characterization test."
```

---

### Task 2: `resolveFavoriteGroups` — pure resolve + bucket logic

**Files:**
- Create: `client/src/components/Chat/Menus/Endpoints/resolveFavorites.ts`
- Create: `client/src/components/Chat/Menus/Endpoints/__tests__/resolveFavorites.test.ts`

**Interfaces:**
- Consumes: `TUserFavorite` (from `librechat-data-provider`, shape `{ agentId?: string; model?: string; endpoint?: string; spec?: string }`), `TModelSpec` (from `librechat-data-provider`), `Endpoint` (from `~/common`, has at minimum `value: string`, `label: string`, `models?: Array<{name: string}>`), `TAgentsMap` (from `librechat-data-provider`, a `Record<string, {name?: string} | undefined>`).
- Produces: `resolveFavoriteGroups(input): FavoriteGroup[]` and the `FavoriteGroup`/`ResolvedFavoriteItem` types, both exported from `resolveFavorites.ts`. Task 3 (`FavoritesSection`) imports and calls this directly.

- [ ] **Step 1: Write the failing tests**

Create `client/src/components/Chat/Menus/Endpoints/__tests__/resolveFavorites.test.ts`:

```typescript
import type { TModelSpec, TUserFavorite, TAgentsMap } from 'librechat-data-provider';
import type { Endpoint } from '~/common';
import { resolveFavoriteGroups } from '../resolveFavorites';

const openAIEndpoint = {
  value: 'openAI',
  label: 'OpenAI',
  models: [{ name: 'gpt-4o' }, { name: 'gpt-5' }],
} as Endpoint;

const anthropicEndpoint = {
  value: 'anthropic',
  label: 'Anthropic',
  models: [{ name: 'claude-opus-4-20250514' }],
} as Endpoint;

const agentsEndpoint = {
  value: 'agents',
  label: 'Agents',
  models: [{ name: 'agent-1' }],
} as Endpoint;

const modelSpecs: TModelSpec[] = [
  {
    name: 'hermes-3-70b',
    label: 'Hermes 3 70B',
    group: 'OpenRouter',
    preset: { endpoint: 'OpenRouter', model: 'nousresearch/hermes-3-llama-3.1-70b' },
  },
  {
    name: 'ungrouped-spec',
    label: 'Ungrouped Spec',
    preset: { endpoint: 'openAI', model: 'gpt-5' },
  },
];

const agentsMap: TAgentsMap = {
  'agent-1': { id: 'agent-1', name: 'My Agent' } as TAgentsMap[string],
};

const mappedEndpoints: Endpoint[] = [openAIEndpoint, anthropicEndpoint, agentsEndpoint];

describe('resolveFavoriteGroups', () => {
  it('returns an empty array when there are no favorites', () => {
    const groups = resolveFavoriteGroups({
      favorites: [],
      modelSpecs,
      mappedEndpoints,
      agentsMap,
    });
    expect(groups).toEqual([]);
  });

  it('groups a plain model favorite by its endpoint', () => {
    const favorites: TUserFavorite[] = [{ model: 'gpt-4o', endpoint: 'openAI' }];
    const groups = resolveFavoriteGroups({ favorites, modelSpecs, mappedEndpoints, agentsMap });
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('openAI');
    expect(groups[0].label).toBe('OpenAI');
    expect(groups[0].items).toEqual([
      { type: 'model', endpoint: openAIEndpoint, modelId: 'gpt-4o' },
    ]);
  });

  it('groups a spec favorite by its spec.group field', () => {
    const favorites: TUserFavorite[] = [{ spec: 'hermes-3-70b' }];
    const groups = resolveFavoriteGroups({ favorites, modelSpecs, mappedEndpoints, agentsMap });
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('OpenRouter');
    expect(groups[0].label).toBe('OpenRouter');
    expect(groups[0].items).toEqual([{ type: 'spec', spec: modelSpecs[0] }]);
  });

  it('puts a spec favorite with no group field into the Other bucket', () => {
    const favorites: TUserFavorite[] = [{ spec: 'ungrouped-spec' }];
    const groups = resolveFavoriteGroups({ favorites, modelSpecs, mappedEndpoints, agentsMap });
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('__other__');
    expect(groups[0].label).toBe('Other');
    expect(groups[0].items).toEqual([{ type: 'spec', spec: modelSpecs[1] }]);
  });

  it('puts an agent favorite into a single Agents bucket', () => {
    const favorites: TUserFavorite[] = [{ agentId: 'agent-1' }];
    const groups = resolveFavoriteGroups({ favorites, modelSpecs, mappedEndpoints, agentsMap });
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('__agents__');
    expect(groups[0].label).toBe('Agents');
    expect(groups[0].items).toEqual([
      { type: 'model', endpoint: agentsEndpoint, modelId: 'agent-1' },
    ]);
  });

  it('merges multiple favorites from different providers into separate groups, preserving first-seen order', () => {
    const favorites: TUserFavorite[] = [
      { model: 'claude-opus-4-20250514', endpoint: 'anthropic' },
      { model: 'gpt-4o', endpoint: 'openAI' },
      { agentId: 'agent-1' },
    ];
    const groups = resolveFavoriteGroups({ favorites, modelSpecs, mappedEndpoints, agentsMap });
    expect(groups.map((g) => g.key)).toEqual(['anthropic', 'openAI', '__agents__']);
  });

  it('adds a second model to an existing group rather than creating a duplicate', () => {
    const favorites: TUserFavorite[] = [
      { model: 'gpt-4o', endpoint: 'openAI' },
      { model: 'gpt-5', endpoint: 'openAI' },
    ];
    const groups = resolveFavoriteGroups({ favorites, modelSpecs, mappedEndpoints, agentsMap });
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
  });

  it('skips a spec favorite whose spec no longer exists (stale)', () => {
    const favorites: TUserFavorite[] = [{ spec: 'deleted-spec' }];
    const groups = resolveFavoriteGroups({ favorites, modelSpecs, mappedEndpoints, agentsMap });
    expect(groups).toEqual([]);
  });

  it('skips a model favorite whose endpoint no longer exists (stale)', () => {
    const favorites: TUserFavorite[] = [{ model: 'some-model', endpoint: 'removed-endpoint' }];
    const groups = resolveFavoriteGroups({ favorites, modelSpecs, mappedEndpoints, agentsMap });
    expect(groups).toEqual([]);
  });

  it('skips a model favorite whose model is no longer in its endpoint (stale)', () => {
    const favorites: TUserFavorite[] = [{ model: 'gpt-3-ancient', endpoint: 'openAI' }];
    const groups = resolveFavoriteGroups({ favorites, modelSpecs, mappedEndpoints, agentsMap });
    expect(groups).toEqual([]);
  });

  it('skips an agent favorite no longer present in agentsMap (stale)', () => {
    const favorites: TUserFavorite[] = [{ agentId: 'deleted-agent' }];
    const groups = resolveFavoriteGroups({ favorites, modelSpecs, mappedEndpoints, agentsMap });
    expect(groups).toEqual([]);
  });

  it('skips an agent favorite when no agents endpoint is mapped', () => {
    const favorites: TUserFavorite[] = [{ agentId: 'agent-1' }];
    const groups = resolveFavoriteGroups({
      favorites,
      modelSpecs,
      mappedEndpoints: [openAIEndpoint, anthropicEndpoint],
      agentsMap,
    });
    expect(groups).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd client && npx jest components/Chat/Menus/Endpoints/__tests__/resolveFavorites.test.ts`
Expected: FAIL — `Cannot find module '../resolveFavorites'`

- [ ] **Step 3: Implement `resolveFavorites.ts`**

Create `client/src/components/Chat/Menus/Endpoints/resolveFavorites.ts`:

```typescript
import { isAgentsEndpoint } from 'librechat-data-provider';
import type { TModelSpec, TUserFavorite, TAgentsMap } from 'librechat-data-provider';
import type { Endpoint } from '~/common';

export type ResolvedFavoriteItem =
  | { type: 'spec'; spec: TModelSpec }
  | { type: 'model'; endpoint: Endpoint; modelId: string };

export interface FavoriteGroup {
  key: string;
  label: string;
  items: ResolvedFavoriteItem[];
}

const OTHER_GROUP_KEY = '__other__';
const OTHER_GROUP_LABEL = 'Other';
const AGENTS_GROUP_KEY = '__agents__';
const AGENTS_GROUP_LABEL = 'Agents';

export function resolveFavoriteGroups({
  favorites,
  modelSpecs,
  mappedEndpoints,
  agentsMap,
}: {
  favorites: TUserFavorite[];
  modelSpecs: TModelSpec[];
  mappedEndpoints: Endpoint[];
  agentsMap: TAgentsMap | undefined;
}): FavoriteGroup[] {
  const groupsByKey = new Map<string, FavoriteGroup>();

  const addItem = (key: string, label: string, item: ResolvedFavoriteItem) => {
    const existing = groupsByKey.get(key);
    if (existing) {
      existing.items.push(item);
      return;
    }
    groupsByKey.set(key, { key, label, items: [item] });
  };

  for (const favorite of favorites) {
    if (favorite.spec) {
      const spec = modelSpecs.find((s) => s.name === favorite.spec);
      if (!spec) {
        continue;
      }
      const key = spec.group ?? OTHER_GROUP_KEY;
      const label = spec.group ?? OTHER_GROUP_LABEL;
      addItem(key, label, { type: 'spec', spec });
      continue;
    }

    if (favorite.agentId) {
      const agentsEndpoint = mappedEndpoints.find((endpoint) => isAgentsEndpoint(endpoint.value));
      if (!agentsEndpoint || !agentsMap?.[favorite.agentId]) {
        continue;
      }
      addItem(AGENTS_GROUP_KEY, AGENTS_GROUP_LABEL, {
        type: 'model',
        endpoint: agentsEndpoint,
        modelId: favorite.agentId,
      });
      continue;
    }

    if (favorite.model && favorite.endpoint) {
      const endpoint = mappedEndpoints.find((e) => e.value === favorite.endpoint);
      if (!endpoint) {
        continue;
      }
      const modelExists = endpoint.models?.some((m) => m.name === favorite.model);
      if (!modelExists) {
        continue;
      }
      addItem(endpoint.value, endpoint.label || endpoint.value, {
        type: 'model',
        endpoint,
        modelId: favorite.model,
      });
    }
  }

  return Array.from(groupsByKey.values());
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd client && npx jest components/Chat/Menus/Endpoints/__tests__/resolveFavorites.test.ts`
Expected: PASS (all 12 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Chat/Menus/Endpoints/resolveFavorites.ts client/src/components/Chat/Menus/Endpoints/__tests__/resolveFavorites.test.ts
git commit -m "feat: add resolveFavoriteGroups pure logic for My Favorites section

Resolves raw favorite refs (model+endpoint / spec / agentId) against
currently-loaded endpoints/specs/agents into provider-bucketed groups.
Stale references (pointing at removed models/specs/agents) are
silently dropped rather than rendered broken."
```

---

### Task 3: `FavoritesSection` component

**Files:**
- Create: `client/src/components/Chat/Menus/Endpoints/components/FavoritesSection.tsx`
- Create: `client/src/components/Chat/Menus/Endpoints/components/__tests__/FavoritesSection.test.tsx`
- Modify: `client/src/locales/en/translation.json`

**Interfaces:**
- Consumes: `resolveFavoriteGroups` (Task 2), `GroupMenu` (Task 1), existing `ModelSpecItem`/`EndpointModelItem` components, `useFavorites`/`useLocalize` from `~/hooks`, `useModelSelectorContext` from `../ModelSelectorContext`.
- Produces: `FavoritesSection`, default export from `FavoritesSection.tsx`, no props (reads everything from hooks/context). Task 4 (`ModelSelector.tsx`) renders `<FavoritesSection />` directly.

- [ ] **Step 1: Check for an existing "favorites" localization key before adding a new one**

Run: `cd client && grep -n "com_ui_my_favorites\|\"com_ui_favorites\":" src/locales/en/translation.json`
Expected: no match (confirms no existing key already covers this exact label — `com_ui_tools_view_favorites` exists but is scoped to the unrelated tools-marketplace view, and `com_ui_favorite`/`com_ui_unfavorite` are per-item action labels, not a section heading).

- [ ] **Step 2: Add the new localization key**

Modify `client/src/locales/en/translation.json` — add this line alphabetically near the other `com_ui_favorite*` keys (immediately after the `"com_ui_favorite": "Add to favorites",` line):

```json
  "com_ui_my_favorites": "My Favorites",
```

- [ ] **Step 3: Write the failing test**

Create `client/src/components/Chat/Menus/Endpoints/components/__tests__/FavoritesSection.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import type { FavoriteGroup } from '../../resolveFavorites';
import { FavoritesSection } from '../FavoritesSection';

let mockGroups: FavoriteGroup[] = [];

jest.mock('../../resolveFavorites', () => ({
  ...jest.requireActual('../../resolveFavorites'),
  resolveFavoriteGroups: () => mockGroups,
}));

jest.mock('~/components/Chat/Menus/Endpoints/ModelSelectorContext', () => ({
  useModelSelectorContext: () => ({
    modelSpecs: [],
    mappedEndpoints: [],
    agentsMap: {},
    selectedValues: { endpoint: '', model: '', modelSpec: '' },
  }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useFavorites: () => ({ favorites: [] }),
  useIsActiveItem: () => ({ ref: { current: null }, isActive: false }),
}));

jest.mock('../SpecIcon', () => ({
  __esModule: true,
  default: () => <span data-testid="spec-icon" />,
}));

jest.mock('../GroupIcon', () => ({
  __esModule: true,
  default: () => <span data-testid="group-icon" />,
}));

const specItem: FavoriteGroup = {
  key: 'OpenRouter',
  label: 'OpenRouter',
  items: [
    {
      type: 'spec',
      spec: {
        name: 'hermes-3-70b',
        label: 'Hermes 3 70B',
        group: 'OpenRouter',
        preset: { endpoint: 'OpenRouter', model: 'nousresearch/hermes-3-llama-3.1-70b' },
      },
    },
  ],
};

const modelItem: FavoriteGroup = {
  key: 'openAI',
  label: 'OpenAI',
  items: [
    {
      type: 'model',
      endpoint: { value: 'openAI', label: 'OpenAI', models: [{ name: 'gpt-4o' }] } as never,
      modelId: 'gpt-4o',
    },
  ],
};

describe('FavoritesSection', () => {
  beforeEach(() => {
    mockGroups = [];
  });

  it('renders nothing when there are no favorite groups', () => {
    mockGroups = [];
    const { container } = render(<FavoritesSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the "My Favorites" heading when there is at least one group', () => {
    mockGroups = [specItem];
    render(<FavoritesSection />);
    expect(screen.getByText('com_ui_my_favorites')).toBeInTheDocument();
  });

  it('renders a provider sub-header and its spec row', () => {
    mockGroups = [specItem];
    render(<FavoritesSection />);
    expect(screen.getByText('OpenRouter')).toBeInTheDocument();
    expect(screen.getByText('Hermes 3 70B')).toBeInTheDocument();
  });

  it('renders multiple provider groups, each with their own rows', () => {
    mockGroups = [specItem, modelItem];
    render(<FavoritesSection />);
    expect(screen.getByText('OpenRouter')).toBeInTheDocument();
    expect(screen.getByText('Hermes 3 70B')).toBeInTheDocument();
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd client && npx jest components/Chat/Menus/Endpoints/components/__tests__/FavoritesSection.test.tsx`
Expected: FAIL — `Cannot find module '../FavoritesSection'`

- [ ] **Step 5: Implement `FavoritesSection.tsx`**

Create `client/src/components/Chat/Menus/Endpoints/components/FavoritesSection.tsx`:

```tsx
import React from 'react';
import { useFavorites, useLocalize } from '~/hooks';
import { useModelSelectorContext } from '../ModelSelectorContext';
import { resolveFavoriteGroups } from '../resolveFavorites';
import { ModelSpecItem } from './ModelSpecItem';
import { EndpointModelItem } from './EndpointModelItem';
import GroupMenu from './GroupMenu';

export function FavoritesSection() {
  const localize = useLocalize();
  const { favorites } = useFavorites();
  const { modelSpecs, mappedEndpoints, agentsMap, selectedValues } = useModelSelectorContext();

  const groups = resolveFavoriteGroups({
    favorites,
    modelSpecs,
    mappedEndpoints,
    agentsMap,
  });

  if (groups.length === 0) {
    return null;
  }

  return (
    <GroupMenu id="favorites-menu" groupName={localize('com_ui_my_favorites')}>
      {groups.map((group) => (
        <div key={group.key} className="px-2 py-1">
          <div className="px-1 py-1 text-xs font-medium text-text-secondary">{group.label}</div>
          {group.items.map((item) =>
            item.type === 'spec' ? (
              <ModelSpecItem
                key={`fav-spec-${item.spec.name}`}
                spec={item.spec}
                isSelected={selectedValues.modelSpec === item.spec.name}
              />
            ) : (
              <EndpointModelItem
                key={`fav-model-${item.endpoint.value}-${item.modelId}`}
                modelId={item.modelId}
                endpoint={item.endpoint}
              />
            ),
          )}
        </div>
      ))}
    </GroupMenu>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd client && npx jest components/Chat/Menus/Endpoints/components/__tests__/FavoritesSection.test.tsx`
Expected: PASS (all 4 tests)

- [ ] **Step 7: Commit**

```bash
git add client/src/components/Chat/Menus/Endpoints/components/FavoritesSection.tsx client/src/components/Chat/Menus/Endpoints/components/__tests__/FavoritesSection.test.tsx client/src/locales/en/translation.json
git commit -m "feat: add FavoritesSection component

Renders resolved+bucketed favorite groups (from resolveFavoriteGroups)
using the existing ModelSpecItem/EndpointModelItem row components, so
selecting or unpinning a favorited item here behaves identically to
doing so anywhere else in the menu. Renders nothing when there are no
resolvable favorites."
```

---

### Task 4: Wire `FavoritesSection` into `ModelSelector.tsx`

**Files:**
- Modify: `client/src/components/Chat/Menus/Endpoints/components/index.ts`
- Modify: `client/src/components/Chat/Menus/Endpoints/ModelSelector.tsx:402-407,505-516`

**Interfaces:**
- Consumes: `FavoritesSection` (Task 3).
- Produces: nothing new — this is the final integration point.

- [ ] **Step 1: Export `FavoritesSection` from the components barrel**

Modify `client/src/components/Chat/Menus/Endpoints/components/index.ts` — add one line:

```typescript
export * from './ModelSpecItem';
export * from './EndpointModelItem';
export * from './EndpointItem';
export * from './SearchResults';
export * from './CustomGroup';
export * from './Marketplace';
export * from './FavoritesSection';
```

- [ ] **Step 2: Render `FavoritesSection` first in `ModelSelector.tsx`**

Modify `client/src/components/Chat/Menus/Endpoints/ModelSelector.tsx`. First, add `FavoritesSection` to the existing import from `./components` (currently at line 402-407):

```tsx
import {
  renderModelSpecs,
  renderEndpoints,
  renderSearchResults,
  renderCustomGroups,
  FavoritesSection,
} from './components';
```

Then, in the JSX (currently lines 505-516), render it before everything else, but only when the user isn't actively searching (favorites are a browse aid, not a search result):

```tsx
        {searchResults ? (
          renderSearchResults(searchResults, localize, searchValue)
        ) : (
          <>
            <FavoritesSection />
            {/* Render ungrouped modelSpecs (no group field) */}
            {renderModelSpecs(
              modelSpecs?.filter((spec) => !spec.group) || [],
              selectedValues.modelSpec || '',
            )}
            {/* Render endpoints (will include grouped specs matching endpoint names) */}
            {renderEndpoints(mappedEndpoints ?? [])}
            {/* Render custom groups (specs with group field not matching any endpoint) */}
            {renderCustomGroups(modelSpecs || [], mappedEndpoints ?? [])}
          </>
        )}
```

- [ ] **Step 3: Run the full Endpoints menu test suite to verify nothing broke**

Run: `cd client && npx jest components/Chat/Menus/Endpoints`
Expected: PASS — every test under this directory (including all tests added in Tasks 1-3) passes.

- [ ] **Step 4: Manually verify in the running app**

Run: `npm run backend:dev` (from repo root, in one terminal) and `npm run frontend:dev` (in another).

In the browser at `http://localhost:3090`:
1. Open the model dropdown — confirm no "My Favorites" section appears (nothing pinned yet).
2. Pin at least one model, one modelSpec, and (if you have an agent configured) one agent using the existing Pin button on their rows.
3. Reopen the dropdown — confirm "My Favorites" now appears at the very top, above everything else, with each pinned item under its own provider sub-header (e.g. pinned Anthropic model under "Anthropic", pinned OpenRouter spec under "OpenRouter", pinned agent under "Agents").
4. Click a favorited item — confirm it selects correctly, same as selecting it from its normal (non-favorites) location in the menu.
5. Unpin an item from within the My Favorites section itself — confirm it disappears from My Favorites immediately, and reappears there if re-pinned.
6. Unpin every item — confirm the "My Favorites" section disappears entirely again.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Chat/Menus/Endpoints/components/index.ts client/src/components/Chat/Menus/Endpoints/ModelSelector.tsx
git commit -m "feat: render My Favorites section at the top of the model dropdown

Wires FavoritesSection into ModelSelector, ahead of the existing
ungrouped-specs / endpoints / custom-groups render order, completing
the My Favorites feature."
```

---

## Spec Coverage Check

- Requirement 1 (all three pinnable types) → Task 2 resolves `spec`/`model+endpoint`/`agentId`; Task 3 renders all three via existing row components.
- Requirement 2 (top position) → Task 4, Step 2.
- Requirement 3 (empty state hidden) → Task 2's empty-favorites test + Task 3's `groups.length === 0` early return, both tested.
- Requirement 4 (grouping rules: models by endpoint, specs by `spec.group`, agents in one "Agents" bucket) → Task 2, covered by dedicated tests for each case.
- Requirement 5 (stale favorites silently skipped) → Task 2, four dedicated stale-reference tests.
