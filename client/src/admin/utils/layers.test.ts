import type * as t from '~/admin/types';
import {
  setConfigPath,
  mergeScopeLayer,
  removeConfigPath,
  createBaseLayers,
  overlayPendingEdits,
} from './layers';
import { applyConfigEdit, buildSavePayload } from '~/admin/components/configuration/edits';
import { scopeLayersFixture, baseConfigFixture } from '~/admin/test/layers';
import { flattenObject, getValueAtPath } from './format';

describe('mergeScopeLayer', () => {
  const base: t.ConfigRecord = {
    balance: { enabled: true, startBalance: 1000 },
    endpoints: {
      custom: [
        { name: 'GPT', baseURL: 'a', models: { default: ['x'] } },
        { name: 'Claude', baseURL: 'b' },
      ],
    },
    modelSpecs: { list: [{ name: 'one' }, { name: 'two' }] },
    interface: { theme: { name: 'base', modes: { dark: true } }, parameters: true },
    filters: { messages: { enabled: true } },
    mcpServers: { github: { url: 'gh' }, docs: { url: 'd' } },
  };

  it('deep-merges objects and keeps everything the profile does not set', () => {
    const merged = mergeScopeLayer(base, { balance: { startBalance: 5 } });
    expect(merged.balance).toEqual({ enabled: true, startBalance: 5 });
    expect(merged.mcpServers).toBe(base.mcpServers);
  });

  it('merges custom endpoints by name and appends new ones', () => {
    const merged = mergeScopeLayer(base, {
      endpoints: {
        custom: [
          { name: 'GPT', baseURL: 'role' },
          { name: 'New', baseURL: 'n' },
        ],
      },
    });
    expect(getValueAtPath(merged, 'endpoints.custom')).toEqual([
      { name: 'GPT', baseURL: 'role', models: { default: ['x'] } },
      { name: 'Claude', baseURL: 'b' },
      { name: 'New', baseURL: 'n' },
    ]);
  });

  it('replaces other arrays and atomic objects whole', () => {
    const merged = mergeScopeLayer(base, {
      modelSpecs: { list: [{ name: 'mine' }] },
      interface: { theme: { name: 'role' } },
    });
    expect(getValueAtPath(merged, 'modelSpecs.list')).toEqual([{ name: 'mine' }]);
    expect(getValueAtPath(merged, 'interface.theme')).toEqual({ name: 'role' });
    expect(getValueAtPath(merged, 'interface.parameters')).toBe(true);
  });

  it('ignores sections a profile cannot override and removes tombstoned paths', () => {
    const merged = mergeScopeLayer(base, { filters: { messages: { enabled: false } } }, [
      'mcpServers.docs',
      'filters.messages',
    ]);
    expect(getValueAtPath(merged, 'filters.messages.enabled')).toBe(true);
    expect(Object.keys(merged.mcpServers as t.ConfigRecord)).toEqual(['github']);
    expect(base.mcpServers).toHaveProperty('docs');
  });
});

describe('removeConfigPath / setConfigPath', () => {
  it('removes a nested key without touching the original', () => {
    const tree = { a: { b: 1, c: 2 } };
    expect(removeConfigPath(tree, 'a.b')).toEqual({ a: { c: 2 } });
    expect(tree).toEqual({ a: { b: 1, c: 2 } });
    expect(removeConfigPath(tree, 'a.b.c')).toEqual(tree);
  });

  it('sets values through objects and array indices, creating missing objects', () => {
    const tree: t.ConfigRecord = { list: [{ name: 'a' }, { name: 'b' }] };
    expect(setConfigPath(tree, 'list.1.name', 'z')).toEqual({
      list: [{ name: 'a' }, { name: 'z' }],
    });
    expect(setConfigPath(tree, 'x.y', 1)).toEqual({ ...tree, x: { y: 1 } });
    expect(setConfigPath(tree, 'list.0', undefined)).toEqual({ list: [{ name: 'b' }] });
    expect(setConfigPath(tree, 'list.name', 'bad')).toBe(tree);
    expect(setConfigPath(tree, '__proto__.x', 1)).toBe(tree);
  });
});

describe('overlayPendingEdits', () => {
  const tree: t.ConfigRecord = {
    endpoints: { custom: [{ name: 'A' }, { name: 'B' }] },
    mcpServers: { yaml: { url: 'override' }, db: { url: 'db' } },
    balance: { startBalance: 1 },
  };
  const revertAt = (path: string): t.ConfigValue =>
    path === 'mcpServers.yaml' ? { url: 'yaml' } : undefined;

  it('applies whole-list edits and new entries, leaving primitive edits to the fields', () => {
    const result = overlayPendingEdits(
      tree,
      [
        ['endpoints.custom', [{ name: 'B' }]],
        ['mcpServers.added', { url: 'new' }],
        ['balance.startBalance', 5],
      ],
      revertAt,
    );
    expect(getValueAtPath(result, 'endpoints.custom')).toEqual([{ name: 'B' }]);
    expect(getValueAtPath(result, 'mcpServers.added')).toEqual({ url: 'new' });
    expect(getValueAtPath(result, 'balance.startBalance')).toBe(1);
  });

  it('shows a pending entry reset as its fallback, or removes the entry', () => {
    const result = overlayPendingEdits(
      tree,
      [
        ['mcpServers.yaml', undefined],
        ['mcpServers.db', undefined],
        ['balance.startBalance', undefined],
      ],
      revertAt,
    );
    expect(result.mcpServers).toEqual({ yaml: { url: 'yaml' } });
    expect(getValueAtPath(result, 'balance.startBalance')).toBe(1);
  });

  it('serializes key/value pair edits into records', () => {
    const result = overlayPendingEdits(
      tree,
      [['mcpServers.db.headers', [{ key: 'X-Id', value: '1', valueType: 'string' }]]],
      revertAt,
    );
    expect(getValueAtPath(result, 'mcpServers.db.headers')).toEqual({ 'X-Id': '1' });
  });
});

describe('createBaseLayers', () => {
  it('ignores `{}` overrides and maps secret preview paths to their secret', () => {
    const layers = createBaseLayers(
      baseConfigFixture({
        dbOverrides: { balance: {}, webSearch: { serperApiKeyPreview: 'sk-…1234' } },
        yamlPaths: ['cache'],
      }),
      new Set(['webSearch.serperApiKey']),
    );
    expect([...layers.baseOverridePaths.paths]).toEqual(['webSearch.serperApiKey']);
    expect(layers.baseOverridePaths.ancestors.has('webSearch')).toBe(true);
  });
});

describe('profile edits are diffed against the effective (inherited) value', () => {
  const layers = scopeLayersFixture();
  const baseline = flattenObject(layers.effective ?? {});

  it('drops an edit that sets an inherited value to what it already is', () => {
    const toggledOff = applyConfigEdit(
      {},
      'balance.enabled',
      false,
      baseline,
      new Set(),
      new Set(),
    );
    expect(toggledOff).toEqual({ 'balance.enabled': false });
    const toggledBack = applyConfigEdit(
      toggledOff,
      'balance.enabled',
      true,
      baseline,
      new Set(),
      new Set(),
    );
    expect(toggledBack).toEqual({});
  });

  it('does not save an edit equal to the inherited value', () => {
    const plan = buildSavePayload(
      new Set(['balance.enabled']),
      { 'balance.enabled': true },
      new Set(['balance.enabled']),
      {
        fields: [],
        baselineAt: (path) => getValueAtPath(layers.effective, path),
        hasOverride: () => false,
      },
    );
    expect(plan.saves).toEqual([]);
    expect(plan.resets).toEqual([]);
  });
});
