import { PrincipalType } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import {
  isSameScope,
  applyScopeGates,
  formatScopeName,
  getScopeIndex,
  buildScopeIndex,
  findPriorityTies,
  isCurrentSelection,
  countScopeOverrides,
  collectOverridePaths,
  scopeGateSkipReason,
  scopeOverrideEntries,
  listScopeOverrideItems,
} from './scopes';

function scope(overrides: Partial<t.ConfigScope> & Pick<t.ConfigScope, 'principalId'>) {
  return {
    principalType: PrincipalType.GROUP,
    name: overrides.principalId,
    priority: 20,
    isActive: true,
    overridePaths: [],
    tombstones: [],
    ...overrides,
  } satisfies t.ConfigScope;
}

describe('collectOverridePaths', () => {
  it('lists leaves, keeps arrays whole and skips emptied objects', () => {
    expect(
      collectOverridePaths({
        interface: { parameters: false, webSearch: { placeholder: 'x' } },
        endpoints: { custom: [{ name: 'a' }] },
        actions: {},
      }),
    ).toEqual(['interface.parameters', 'interface.webSearch.placeholder', 'endpoints.custom']);
  });
});

describe('countScopeOverrides', () => {
  it('counts leaves, tombstones, and each MCP server once', () => {
    const s = scope({
      principalId: 'eng',
      overridePaths: [
        'interface.parameters',
        'mcpServers.docs.url',
        'mcpServers.docs.type',
        'mcpServers.wiki.url',
      ],
      tombstones: ['balance.startBalance'],
    });
    expect(countScopeOverrides(s)).toBe(4);
  });

  it('is zero for a profile with nothing set', () => {
    expect(countScopeOverrides(scope({ principalId: 'empty', overridePaths: undefined }))).toBe(0);
  });

  it('counts each custom endpoint a profile overrides, as the tab badge does', () => {
    const s = scope({
      principalId: 'USER',
      overridePaths: ['endpoints.custom', 'interface.customWelcome'],
      overrideEntries: { 'endpoints.custom': ['Claude', 'Gemini'] },
    });
    expect(countScopeOverrides(s)).toBe(3);
    expect(listScopeOverrideItems(s).map((item) => [item.path, item.entry])).toEqual([
      ['endpoints.custom', 'Claude'],
      ['endpoints.custom', 'Gemini'],
      ['interface.customWelcome', undefined],
    ]);
  });
});

describe('scopeOverrideEntries', () => {
  it('names the entries stored in lists merged by entry, not in lists replaced whole', () => {
    expect(
      scopeOverrideEntries({
        endpoints: { custom: [{ name: 'Claude', modelDisplayLabel: 'C' }, { iconURL: 'x' }] },
        modelSpecs: { list: [{ name: 'spec-a', label: 'A' }] },
      }),
    ).toEqual({ 'endpoints.custom': ['Claude'] });
  });
});

describe('formatScopeName', () => {
  it('appends the email of a user profile', () => {
    const bob = scope({
      principalType: PrincipalType.USER,
      principalId: 'u1',
      name: 'Bob Test',
      email: 'bob@test.local',
    });
    expect(formatScopeName(bob)).toBe('Bob Test (bob@test.local)');
  });

  it('shows just the name when there is no email or it is the name', () => {
    expect(formatScopeName(scope({ principalId: 'g', name: 'Design' }))).toBe('Design');
    expect(formatScopeName(scope({ principalId: 'u', name: 'a@b.c', email: 'a@b.c' }))).toBe(
      'a@b.c',
    );
  });
});

describe('isCurrentSelection / isSameScope', () => {
  const eng = scope({ principalId: 'eng' });
  it('treats the same principal as the same profile', () => {
    expect(isSameScope(eng, { ...eng, name: 'renamed', priority: 5 })).toBe(true);
    expect(isSameScope(eng, scope({ principalId: 'design' }))).toBe(false);
  });

  it('matches base to base and a profile to the same profile only', () => {
    expect(isCurrentSelection({ type: 'BASE' }, { type: 'BASE' })).toBe(true);
    expect(isCurrentSelection({ type: 'BASE' }, { type: 'SCOPE', scope: eng })).toBe(false);
    expect(isCurrentSelection({ type: 'SCOPE', scope: eng }, { type: 'BASE' })).toBe(false);
    expect(
      isCurrentSelection({ type: 'SCOPE', scope: eng }, { type: 'SCOPE', scope: { ...eng } }),
    ).toBe(true);
  });
});

describe('findPriorityTies', () => {
  const eng = scope({ principalId: 'eng', overridePaths: ['interface.parameters'] });
  const design = scope({ principalId: 'design', overridePaths: ['interface'] });
  const qa = scope({ principalId: 'qa', overridePaths: ['balance.startBalance'] });
  const low = scope({ principalId: 'low', priority: 10, overridePaths: ['interface.parameters'] });
  const off = scope({ principalId: 'off', isActive: false, overridePaths: ['interface'] });

  it('reports active same-priority profiles with the settings both change', () => {
    const ties = findPriorityTies(eng, [eng, design, qa, low, off]);
    expect(ties.map((tie) => [tie.scope.principalId, tie.sharedPaths])).toEqual([
      ['design', ['interface.parameters']],
      ['qa', []],
    ]);
  });

  it('ignores profiles that never apply to the same user', () => {
    const roleA = scope({ principalType: PrincipalType.ROLE, principalId: 'USER', priority: 10 });
    const roleB = scope({ principalType: PrincipalType.ROLE, principalId: 'ADMIN', priority: 10 });
    const user = scope({ principalType: PrincipalType.USER, principalId: 'u1', priority: 10 });
    expect(findPriorityTies(roleA, [roleA, roleB]).length).toBe(0);
    expect(findPriorityTies(roleA, [roleA, user]).map((tie) => tie.scope.principalId)).toEqual([
      'u1',
    ]);
  });

  it('reports nothing for an inactive profile', () => {
    expect(findPriorityTies(off, [eng, design, off])).toEqual([]);
  });
});

describe('buildScopeIndex', () => {
  it('indexes each override and hidden path with its ancestors, lowest priority first', () => {
    const user = scope({
      principalType: PrincipalType.USER,
      principalId: 'u1',
      priority: 100,
      overridePaths: ['interface.parameters'],
    });
    const role = scope({
      principalType: PrincipalType.ROLE,
      principalId: 'USER',
      priority: 10,
      overridePaths: ['interface.parameters', 'interface.presets'],
      tombstones: ['balance.startBalance'],
    });
    const { byPath, scopes } = buildScopeIndex([user, role]);
    expect(scopes.map((s) => s.principalId)).toEqual(['USER', 'u1']);
    expect(byPath.get('interface.parameters')?.map((s) => s.principalId)).toEqual(['USER', 'u1']);
    expect(byPath.get('interface')?.map((s) => s.principalId)).toEqual(['USER', 'u1']);
    expect(byPath.get('balance.startBalance')?.map((s) => s.principalId)).toEqual(['USER']);
    expect(byPath.get('interface.webSearch')).toBeUndefined();
  });
});

describe('getScopeIndex', () => {
  it('builds the index once per scopes list', () => {
    const scopes = [scope({ principalId: 'eng', overridePaths: ['interface.parameters'] })];
    expect(getScopeIndex(scopes)).toBe(getScopeIndex(scopes));
    expect(getScopeIndex([...scopes])).not.toBe(getScopeIndex(scopes));
  });
});

describe('applyScopeGates', () => {
  const sections: t.ConfigSectionConfig[] = [
    { id: 'registration', titleKey: 'r', fields: [] },
    { id: 'filters', titleKey: 'f', fields: [], readOnlyReason: 'baseOnly' },
    { id: 'turnstile', titleKey: 't', fields: [] },
    { id: 'langfuse', titleKey: 'l', fields: [] },
    { id: 'balance', titleKey: 'b', fields: [] },
    { id: 'virtual', schemaKey: 'registration', titleKey: 'v', fields: [] },
  ];

  it('returns base-mode sections untouched', () => {
    expect(applyScopeGates(sections, false)).toBe(sections);
  });

  it('gates content filters, registration, Turnstile and Langfuse in a profile', () => {
    const gated = applyScopeGates(sections, true);
    expect(gated[0].tocItems).toEqual([]);
    expect(gated[4].tocItems).toBeUndefined();
    const gates = gated.map((s) => [s.id, s.scopeGate]);
    expect(gates).toEqual([
      ['registration', 'preAuth'],
      ['filters', 'baseOnly'],
      ['turnstile', 'yamlOnly'],
      ['langfuse', 'tenantWide'],
      ['balance', undefined],
      ['virtual', 'preAuth'],
    ]);
  });
});

describe('scopeGateSkipReason', () => {
  it('skips gated sections with the reason shown in the review', () => {
    expect(scopeGateSkipReason('registration.socialLogins')).toBe('baseScope');
    expect(scopeGateSkipReason('filters.messages.unattributedAssistantContent')).toBe('baseOnly');
    expect(scopeGateSkipReason('langfuse.baseUrl')).toBe('dedicated');
    expect(scopeGateSkipReason('balance.startBalance')).toBeUndefined();
  });
});
