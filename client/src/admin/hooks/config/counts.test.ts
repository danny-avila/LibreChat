import { renderHook } from '@testing-library/react';
import { configSchema } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import { CONFIG_TABS } from '~/admin/components/configuration/configMeta';
import { extractSchemaTree } from '~/admin/api/config';
import { useTabBadges } from './counts';

const schemaTree = extractSchemaTree(configSchema as t.ZodSchemaLike);

const activeConfigValues: t.ConfigRecord = {
  endpoints: {
    custom: [{ name: 'GPT' }, { name: 'Claude' }],
    agents: { recursionLimit: 50, capabilities: ['tools'] },
  },
  modelSpecs: { prioritize: true, list: [{ name: 'spec-a' }] },
  mcpServers: { github: { url: 'x' } },
  balance: { enabled: true, startBalance: 1000 },
};

const activeConfiguredPaths = new Set([
  'endpoints.custom',
  'endpoints.agents.recursionLimit',
  'endpoints.agents.capabilities',
  'modelSpecs.prioritize',
  'modelSpecs.list',
  'mcpServers.github.url',
  'balance.enabled',
  'balance.startBalance',
  'fileConfig.endpoints.agents.fileSizeLimit',
]);

function badges(
  editedValues: t.FlatConfigMap = {},
  overridePaths?: ReadonlySet<string>,
  scope?: Pick<t.TabCountsOptions, 'listOverrideCounts' | 'isEditingScope'>,
): Record<string, t.TabBadge> {
  const { result } = renderHook(() =>
    useTabBadges({
      schemaTree,
      visibleTabs: CONFIG_TABS,
      activeConfiguredPaths,
      activeConfigValues,
      editedValues,
      overridePaths,
      ...scope,
    }),
  );
  return result.current;
}

describe('useTabBadges', () => {
  it('counts entries on collection tabs', () => {
    const result = badges();
    expect(result.specs).toMatchObject({ kind: 'entries', count: 1 });
    expect(result.custom).toMatchObject({ kind: 'entries', count: 2 });
    expect(result.mcp).toMatchObject({ kind: 'entries', count: 1 });
    expect(result.specs.labelKey).toBe('com_admin_config_values_count_specs');
  });

  it('counts customized settings elsewhere, without custom endpoints on AI providers', () => {
    const result = badges();
    expect(result.providers).toMatchObject({ kind: 'customized', count: 2 });
    expect(result.system).toMatchObject({ kind: 'customized', count: 2 });
    expect(result.files.count).toBe(1);
    expect(result.features.count).toBe(0);
  });

  it('counts admin overrides apart from librechat.yaml values', () => {
    const result = badges(
      {},
      new Set([
        'balance.startBalance',
        'endpoints.custom.0.baseURL',
        'endpoints.custom.0.name',
        'endpoints.custom.1.name',
      ]),
    );
    expect(result.system).toMatchObject({ count: 2, overrides: 1 });
    expect(result.custom).toMatchObject({ count: 2, overrides: 2 });
    expect(result.features.overrides).toBe(0);
    expect(badges().system.overrides).toBe(0);
  });

  it('counts each stored value of a boolean|object switch, as Revert to librechat.yaml lists them', () => {
    const result = badges(
      {},
      new Set([
        'interface.schedules.maxPerUser',
        'interface.schedules.minIntervalMinutes',
        'interface.customWelcome',
      ]),
    );
    expect(result.features.overrides).toBe(3);
  });

  it('in a profile, adds the entries it overrides on collection tabs only (its settings are the count)', () => {
    const result = badges({}, new Set(['balance.startBalance', 'endpoints.custom']), {
      isEditingScope: true,
      listOverrideCounts: new Map([['endpoints.custom', 2]]),
    });
    expect(result.custom).toMatchObject({ count: 2, overrides: 2, scope: true });
    expect(result.system).toMatchObject({ count: 2, overrides: 0 });
  });

  it('counts pending edits per tab', () => {
    const result = badges({
      'endpoints.custom': [],
      'endpoints.openAI.titleModel': 'x',
      'balance.startBalance': undefined,
    });
    expect(result.custom.pending).toBe(1);
    expect(result.providers.pending).toBe(1);
    expect(result.system.pending).toBe(1);
    expect(result.specs.pending).toBe(0);
  });
});
