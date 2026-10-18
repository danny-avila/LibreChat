import { PrincipalType } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import { createBaseLayers, withScopeLayer, mergeScopeLayer } from '~/admin/utils';

/** Schema paths the fixture's secret preview mapping knows about. */
export const FIXTURE_SCHEMA_PATHS: ReadonlySet<string> = new Set([
  'cache',
  'balance.enabled',
  'balance.startBalance',
  'balance.refillAmount',
  'balance.autoRefillEnabled',
  'interface.parameters',
  'interface.presets',
  'secureImageLinks',
  'webSearch.serperApiKey',
  'endpoints.custom',
  'endpoints.agents.recursionLimit',
  'endpoints.agents.maxCitations',
  'endpoints.azureAssistants.version',
  'endpoints.openAI.titleModel',
  'endpoints.anthropic.activityModel',
  'endpoints.all.activityModel',
  'modelSpecs.list',
  'mcpServers',
]);

/** librechat.yaml as LibreChat processes it (`?baseOnly=true`): YAML plus synthesized values. */
const YAML_EFFECTIVE: t.ConfigRecord = {
  cache: true,
  secureImageLinks: true,
  balance: { enabled: true, startBalance: 1000000, refillAmount: 1000000 },
  interface: { parameters: true },
  endpoints: {
    all: { activityModel: 'gpt-5.6-luna' },
    openAI: { titleModel: 'gpt-5-mini' },
    anthropic: { activityModel: 'claude-haiku-4-5' },
    agents: { recursionLimit: 50, maxCitations: 30 },
    azureAssistants: { version: 1 },
    custom: [
      { name: 'GPT', baseURL: 'https://gpt.example.com' },
      { name: 'Claude', baseURL: 'https://claude.example.com' },
    ],
  },
  modelSpecs: { list: [{ name: 'spec-a', label: 'Spec A' }] },
  mcpServers: { github: { url: 'https://gh.example.com' }, docs: { url: 'https://docs' } },
};

/** The leaf paths of the raw librechat.yaml (no synthesized values). */
const YAML_PATHS = [
  'cache',
  'balance.enabled',
  'balance.startBalance',
  'balance.refillAmount',
  'interface.parameters',
  'endpoints.all.activityModel',
  'endpoints.openAI.titleModel',
  'endpoints.anthropic.activityModel',
  'endpoints.agents.recursionLimit',
  'endpoints.custom',
  'modelSpecs.list',
  'mcpServers.github.url',
  'mcpServers.docs.url',
];

const SCHEMA_DEFAULTS: t.FlatConfigMap = {
  cache: true,
  'balance.enabled': false,
  'balance.startBalance': 20000,
  'balance.refillAmount': 10000,
  'balance.autoRefillEnabled': false,
  'interface.parameters': true,
  'interface.presets': true,
  'endpoints.agents.maxCitations': 30,
};

/** The base admin overrides: Start balance overridden, plus a `{}` left behind by an old reset. */
const DB_OVERRIDES: t.ConfigRecord = {
  balance: { startBalance: 2500000 },
  webSearch: {},
};

/** A base config payload: librechat.yaml with one base override. */
export function baseConfigFixture(overrides: Partial<t.BaseConfigData> = {}): t.BaseConfigData {
  const dbOverrides = overrides.dbOverrides ?? DB_OVERRIDES;
  return {
    config: mergeScopeLayer(YAML_EFFECTIVE, dbOverrides),
    yamlConfig: YAML_EFFECTIVE,
    yamlPaths: YAML_PATHS,
    dbOverrides,
    dbTombstones: [],
    schemaDefaults: SCHEMA_DEFAULTS,
    ...overrides,
  };
}

/** The USER role profile: Start balance 777, the `docs` MCP server hidden. */
export function scopeConfigFixture(
  overrides: Partial<t.ResolvedConfigData> = {},
): t.ResolvedConfigData {
  return {
    resolvedConfig: { 'balance.startBalance': 777 },
    changedPaths: ['balance.startBalance'],
    overrides: { balance: { startBalance: 777 } },
    tombstones: ['mcpServers.docs'],
    ...overrides,
  };
}

/** Base-mode value layers built by the same code the page uses. */
export function baseLayersFixture(data: t.BaseConfigData = baseConfigFixture()): t.ValueLayers {
  return createBaseLayers(data, FIXTURE_SCHEMA_PATHS);
}

/** Profile-mode value layers (USER role) built by the same code the page uses. */
export function scopeLayersFixture(
  scope: t.ResolvedConfigData = scopeConfigFixture(),
  base: t.BaseConfigData = baseConfigFixture(),
): t.ValueLayers {
  return withScopeLayer(
    baseLayersFixture(base),
    { principalType: PrincipalType.ROLE, name: 'USER' },
    scope,
    FIXTURE_SCHEMA_PATHS,
  );
}

/** `ConfigValuesData` for the given layers, showing their effective tree. */
export function valuesDataFixture(
  layers: t.ValueLayers,
  editedValues: t.FlatConfigMap = {},
): t.ConfigValuesData {
  return {
    configValues: layers.effective,
    editedValues,
    schemaDefaults: layers.schemaDefaults,
    isEditingScope: layers.scope != null,
    layers,
  };
}
