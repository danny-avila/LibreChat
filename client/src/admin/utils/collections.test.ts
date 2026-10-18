import type * as t from '~/admin/types';
import {
  diffOverride,
  applyEntryChanges,
  mergeConfigLayers,
  getKeyedCollection,
  resolveCollectionOps,
  findKeyedCollectionEntry,
  moveEntryPath,
} from './collections';

const custom = getKeyedCollection('endpoints.custom')!;
const specs = getKeyedCollection('modelSpecs.list')!;

/** AppService-expanded paramDefinitions, identical on both sides of a diff. */
const EXPANDED_PARAMS = {
  defaultParamsEndpoint: 'azureOpenAI',
  paramDefinitions: [
    {
      key: 'useResponsesApi',
      label: 'com_admin_endpoint_use_responses_api',
      labelCode: true,
      type: 'boolean',
      default: true,
      component: 'switch',
      optionType: 'custom',
      columnSpan: 2,
    },
  ],
};

const yamlEndpoints: t.ConfigValue[] = [
  {
    name: 'Moonshot',
    apiKey: '${MOONSHOT_API_KEY}',
    baseURL: 'https://api.moonshot.ai/v1',
    models: { default: ['kimi-k2'], fetch: false },
  },
  {
    name: 'Azure AI Foundry',
    apiKey: '${SWEDEN_API_KEY}',
    baseURL: 'https://foundry.example.com/v1',
    customParams: EXPANDED_PARAMS,
    models: { default: ['gpt-5.1'], fetch: false },
  },
  { name: 'Zai 2', apiKey: 'user_provided', baseURL: 'https://zai.example.com' },
];

function upsert(
  key: string,
  identity: string | null,
  value: t.ConfigValue,
  baseline?: t.ConfigValue,
): t.EntryChange {
  return { op: 'upsertEntry', path: 'endpoints.custom', key, identity, value, baseline };
}

function resolve(
  ops: t.EntryChange[],
  stored: t.ConfigValue = undefined,
  lower: t.ConfigValue = yamlEndpoints,
  collection = custom,
) {
  return resolveCollectionOps({ collection, stored, lower, lowerKind: 'yaml', ops });
}

describe('findKeyedCollectionEntry', () => {
  it('locates entries and fields inside entries by index', () => {
    expect(findKeyedCollectionEntry('endpoints.custom.3')).toMatchObject({ index: 3, rest: '' });
    expect(findKeyedCollectionEntry('endpoints.custom.3.models.default')).toMatchObject({
      index: 3,
      rest: 'models.default',
    });
    expect(findKeyedCollectionEntry('endpoints.custom')).toBeUndefined();
    expect(findKeyedCollectionEntry('endpoints.customX.1')).toBeUndefined();
  });
});

describe('moveEntryPath', () => {
  const saved = {
    endpoints: { custom: [{ name: 'A' }, { name: 'BrandNew' }, { name: 'SecretOne' }] },
  };

  it('follows an entry to its pending position by name', () => {
    const pending = { endpoints: { custom: [{ name: 'BrandNew' }, { name: 'SecretOne' }] } };
    expect(moveEntryPath('endpoints.custom.2.baseURL', saved, pending)).toBe(
      'endpoints.custom.1.baseURL',
    );
    expect(moveEntryPath('endpoints.custom.1', saved, pending)).toBe('endpoints.custom.0');
  });

  it('names an entry the pending list no longer has by identity, so no other entry takes its place', () => {
    const pending = { endpoints: { custom: [{ name: 'A' }, { name: 'SecretOne' }] } };
    expect(moveEntryPath('endpoints.custom.1.name', saved, pending)).toBe(
      'endpoints.custom.BrandNew.name',
    );
  });

  it('leaves paths outside keyed lists as they are', () => {
    expect(moveEntryPath('balance.startBalance', saved, {})).toBe('balance.startBalance');
    expect(moveEntryPath('mcpServers.github.url', saved, {})).toBe('mcpServers.github.url');
  });
});

describe('mergeConfigLayers', () => {
  it('merges objects key by key and custom endpoints by name, replacing other arrays', () => {
    const merged = mergeConfigLayers(
      { endpoints: { custom: yamlEndpoints }, list: [1, 2] },
      {
        endpoints: { custom: [{ name: 'Moonshot', baseURL: 'https://x' }, { name: 'New' }] },
        list: [3],
      },
    ) as t.ConfigRecord;
    const endpoints = (merged.endpoints as t.ConfigRecord).custom as t.ConfigRecord[];
    expect(endpoints.map((e) => e.name)).toEqual(['Moonshot', 'Azure AI Foundry', 'Zai 2', 'New']);
    expect(endpoints[0]).toMatchObject({ baseURL: 'https://x', apiKey: '${MOONSHOT_API_KEY}' });
    expect(merged.list).toEqual([3]);
  });
});

describe('diffOverride', () => {
  it('keeps only what differs, diffing nested objects key by key', () => {
    const lower = yamlEndpoints[0] as t.ConfigRecord;
    const desired = { ...lower, baseURL: 'https://api.moonshot.cn/v1' };
    expect(diffOverride(lower, desired)).toEqual({
      value: { baseURL: 'https://api.moonshot.cn/v1' },
      unremovable: [],
    });
    const nested = { ...lower, models: { default: ['kimi-k2'], fetch: true } };
    expect(diffOverride(lower, nested).value).toEqual({ models: { fetch: true } });
  });

  it('cancels identical AppService expansion noise on both sides', () => {
    const lower = yamlEndpoints[1] as t.ConfigRecord;
    const desired = {
      ...(JSON.parse(JSON.stringify(lower)) as t.ConfigRecord),
      titleModel: 'gpt-4.1',
    };
    expect(diffOverride(lower, desired).value).toEqual({ titleModel: 'gpt-4.1' });
  });

  it('reports keys the merge cannot remove', () => {
    const lower = { headers: { a: '1', b: '2' }, x: 1 };
    expect(diffOverride(lower, { headers: { a: '1' } }).unremovable).toEqual(['headers.b', 'x']);
  });
});

describe('applyEntryChanges (three-way)', () => {
  it('applies only the edited keys over the freshly stored entry', () => {
    const baseline = { name: 'A', baseURL: 'https://old', titleModel: 'm1' };
    const value = { ...baseline, baseURL: 'https://new' };
    const fresh = { name: 'A', baseURL: 'https://old', titleModel: 'changed-by-someone-else' };
    expect(applyEntryChanges(fresh, baseline, value)).toEqual({
      name: 'A',
      baseURL: 'https://new',
      titleModel: 'changed-by-someone-else',
    });
  });

  it('deletes keys the edit removed and recurses into objects', () => {
    const baseline = { headers: { a: '1', b: '2' }, iconURL: 'x' };
    const value = { headers: { a: '1', b: '3' } };
    const fresh = { headers: { a: '1', b: '2', c: '9' }, iconURL: 'x' };
    expect(applyEntryChanges(fresh, baseline, value)).toEqual({
      headers: { a: '1', b: '3', c: '9' },
    });
  });
});

describe('resolveCollectionOps — merge-by-key (endpoints.custom)', () => {
  it('stores one partial entry when one YAML endpoint field changes', () => {
    const baseline = yamlEndpoints[0];
    const value = { ...(baseline as t.ConfigRecord), baseURL: 'https://api.moonshot.cn/v1' };
    const result = resolve([upsert('Moonshot', 'Moonshot', value, baseline)]);
    expect(result.issues).toEqual([]);
    expect(result.next).toEqual([{ name: 'Moonshot', baseURL: 'https://api.moonshot.cn/v1' }]);
  });

  it('builds on the stored override array, never on the merged list', () => {
    const stored = [{ name: 'AdminEP', baseURL: 'https://admin', apiKey: 'user_provided' }];
    const baseline = yamlEndpoints[1];
    const value = { ...(baseline as t.ConfigRecord), titleModel: 'gpt-4.1' };
    const result = resolve(
      [upsert('Azure AI Foundry', 'Azure AI Foundry', value, baseline)],
      stored,
    );
    expect(result.next).toEqual([...stored, { name: 'Azure AI Foundry', titleModel: 'gpt-4.1' }]);
  });

  it('drops the stored entry when an edit reverts it to the YAML values', () => {
    const stored = [{ name: 'Moonshot', baseURL: 'https://api.moonshot.cn/v1' }];
    const baseline = {
      ...(yamlEndpoints[0] as t.ConfigRecord),
      baseURL: 'https://api.moonshot.cn/v1',
    };
    const value = yamlEndpoints[0];
    const result = resolve([upsert('Moonshot', 'Moonshot', value, baseline)], stored);
    expect(result.changed).toBe(true);
    expect(result.next).toBeUndefined();
  });

  it('refuses to remove or rename a YAML entry', () => {
    const remove: t.EntryChange = {
      op: 'removeEntry',
      path: 'endpoints.custom',
      key: 'Zai 2',
      identity: 'Zai 2',
    };
    expect(resolve([remove]).issues.map((i) => i.code)).toEqual(['YAML_ENTRY_IMMUTABLE']);
    const rename = upsert('Zai', 'Zai 2', { ...(yamlEndpoints[2] as t.ConfigRecord), name: 'Zai' });
    const result = resolve([rename]);
    expect(result.issues).toMatchObject([
      { code: 'YAML_ENTRY_IMMUTABLE', entryIdentity: 'Zai 2', params: { action: 'renamed' } },
    ]);
    expect(result.changed).toBe(false);
  });

  it('uses INHERITED_ENTRY_IMMUTABLE for entries a profile inherits', () => {
    const remove: t.EntryChange = {
      op: 'removeEntry',
      path: 'endpoints.custom',
      key: 'Moonshot',
      identity: 'Moonshot',
    };
    const result = resolveCollectionOps({
      collection: custom,
      stored: undefined,
      lower: yamlEndpoints,
      lowerKind: 'inherited',
      ops: [remove],
    });
    expect(result.issues[0].code).toBe('INHERITED_ENTRY_IMMUTABLE');
  });

  it('removes and renames DB-only entries', () => {
    const stored = [
      { name: 'AdminA', baseURL: 'https://a', apiKey: 'user_provided' },
      { name: 'AdminB', baseURL: 'https://b', apiKey: 'user_provided' },
    ];
    const removed = resolve(
      [{ op: 'removeEntry', path: 'endpoints.custom', key: 'AdminA', identity: 'AdminA' }],
      stored,
    );
    expect(removed.next).toEqual([stored[1]]);
    const renamed = resolve(
      [upsert('AdminC', 'AdminA', { ...stored[0], name: 'AdminC' }, stored[0])],
      stored,
    );
    expect(renamed.issues).toEqual([]);
    expect(renamed.next).toEqual([{ ...stored[0], name: 'AdminC' }, stored[1]]);
  });

  it('never writes to another entry when the edited one disappeared (concurrent delete)', () => {
    const storedNow = [{ name: 'AdminB', baseURL: 'https://b', apiKey: 'user_provided' }];
    const baseline = { name: 'AdminA', baseURL: 'https://a', apiKey: 'user_provided' };
    const result = resolve(
      [upsert('AdminA', 'AdminA', { ...baseline, baseURL: 'https://a2' }, baseline)],
      storedNow,
    );
    expect(result.issues.map((i) => i.code)).toEqual(['ENTRY_NOT_FOUND']);
    expect(result.changed).toBe(false);
  });

  it('rejects duplicate names on create and rename', () => {
    const created = resolve([
      upsert('Moonshot', null, { name: 'Moonshot', baseURL: 'https://dup' }),
    ]);
    expect(created.issues.map((i) => i.code)).toEqual(['DUPLICATE_ENTRY']);
  });

  it('merges an upsert without a baseline (an import) into the current entry', () => {
    const stored = [
      { name: 'AdminA', apiKey: 'user_provided', baseURL: 'https://a', iconURL: 'i' },
    ];
    const result = resolve(
      [upsert('AdminA', 'AdminA', { name: 'AdminA', baseURL: 'https://a2' })],
      stored,
    );
    expect(result.next).toEqual([{ ...stored[0], baseURL: 'https://a2' }]);
  });

  it('appends new entries whole', () => {
    const entry = { name: 'OpenRouter Direct', apiKey: 'user_provided', baseURL: 'https://or' };
    expect(resolve([upsert('OpenRouter Direct', null, entry)]).next).toEqual([entry]);
  });

  it('requires a new API key to rename an entry whose stored key is encrypted (SV-10)', () => {
    const stored = [{ name: 'Secret EP', baseURL: 'https://s', apiKeyPreview: 'sk-abc...1234' }];
    const value = { name: 'Renamed EP', baseURL: 'https://s' };
    const blocked = resolve([upsert('Renamed EP', 'Secret EP', value, stored[0])], stored);
    expect(blocked.issues.map((i) => i.code)).toEqual(['SECRET_REQUIRED_FOR_RENAME']);
    const withKey = resolve(
      [upsert('Renamed EP', 'Secret EP', { ...value, apiKey: 'sk-new' }, stored[0])],
      stored,
    );
    expect(withKey.issues).toEqual([]);
    expect(withKey.next).toEqual([{ name: 'Renamed EP', baseURL: 'https://s', apiKey: 'sk-new' }]);
  });

  it('strips preview companions so stored secrets are kept by name', () => {
    const stored = [{ name: 'Secret EP', baseURL: 'https://s', apiKeyPreview: 'sk-abc...1234' }];
    const baseline = { name: 'Secret EP', baseURL: 'https://s', apiKeyPreview: 'sk-abc...1234' };
    const result = resolve(
      [upsert('Secret EP', 'Secret EP', { ...baseline, baseURL: 'https://s2' }, baseline)],
      stored,
    );
    expect(result.next).toEqual([{ name: 'Secret EP', baseURL: 'https://s2' }]);
  });

  it('keeps a librechat.yaml entry whose stored key is encrypted when the rest goes back', () => {
    const lower = yamlEndpoints[0] as t.ConfigRecord;
    const stored = [{ name: 'Moonshot', baseURL: 'https://cn', apiKeyPreview: 'sk-abc...1234' }];
    const baseline: t.ConfigRecord = {
      ...lower,
      baseURL: 'https://cn',
      apiKeyPreview: 'sk-abc...1234',
    };
    delete baseline.apiKey;
    const reverted = resolve(
      [upsert('Moonshot', 'Moonshot', { ...baseline, baseURL: lower.baseURL }, baseline)],
      stored,
    );
    expect(reverted.next).toEqual([{ name: 'Moonshot' }]);
  });

  it('removes a stored key by writing the librechat.yaml one, keeping other overrides', () => {
    const lower = yamlEndpoints[0] as t.ConfigRecord;
    const stored = [{ name: 'Moonshot', baseURL: 'https://cn', apiKeyPreview: 'sk-abc...1234' }];
    const baseline: t.ConfigRecord = {
      ...lower,
      baseURL: 'https://cn',
      apiKeyPreview: 'sk-abc...1234',
    };
    delete baseline.apiKey;
    const value = { ...baseline, apiKey: lower.apiKey };
    const result = resolve([upsert('Moonshot', 'Moonshot', value, baseline)], stored);
    expect(result.next).toEqual([
      { name: 'Moonshot', baseURL: 'https://cn', apiKey: '${MOONSHOT_API_KEY}' },
    ]);
    const only = resolve(
      [upsert('Moonshot', 'Moonshot', { ...value, baseURL: lower.baseURL }, baseline)],
      stored,
    );
    expect(only.next).toBeUndefined();
  });

  it('warns when an edit drops keys the YAML entry defines', () => {
    const lower = [{ name: 'CF', baseURL: 'https://cf', headers: { 'x-a': '1', 'x-b': '2' } }];
    const baseline = lower[0];
    const value = { ...baseline, headers: { 'x-a': '1' } };
    const result = resolve([upsert('CF', 'CF', value, baseline)], undefined, lower);
    expect(result.warnings).toEqual([
      { path: 'endpoints.custom', warning: 'yamlOnly', entryIdentity: 'CF', keys: ['headers.x-b'] },
    ]);
  });
});

describe('resolveCollectionOps — replace (modelSpecs.list)', () => {
  const yamlSpecs = [
    { name: 'gpt', label: 'GPT', preset: { endpoint: 'openAI' } },
    { name: 'claude', label: 'Claude', preset: { endpoint: 'anthropic' } },
  ];
  const specOp = (
    key: string,
    identity: string | null,
    value: t.ConfigValue,
    baseline?: t.ConfigValue,
  ): t.EntryChange => ({
    op: 'upsertEntry',
    path: 'modelSpecs.list',
    key,
    identity,
    value,
    baseline,
  });

  it('writes the whole list and flags the ownership change on the first edit', () => {
    const value = { ...yamlSpecs[0], label: 'GPT 5' };
    const result = resolve(
      [specOp('gpt', 'gpt', value, yamlSpecs[0])],
      undefined,
      yamlSpecs,
      specs,
    );
    expect(result.next).toEqual([value, yamlSpecs[1]]);
    expect(result.warnings).toEqual([{ path: 'modelSpecs.list', warning: 'ownershipChange' }]);
  });

  it('removes by identity, inserts new specs at their index, and resets when equal to YAML', () => {
    const removed = resolve(
      [{ op: 'removeEntry', path: 'modelSpecs.list', key: 'gpt', identity: 'gpt' }],
      undefined,
      yamlSpecs,
      specs,
    );
    expect(removed.next).toEqual([yamlSpecs[1]]);
    const added = resolve(
      [{ ...specOp('new', null, { name: 'new', label: 'New' }), index: 0 } as t.EntryChange],
      undefined,
      yamlSpecs,
      specs,
    );
    expect(added.next?.map((s) => (s as t.ConfigRecord).name)).toEqual(['new', 'gpt', 'claude']);
    const own = [{ ...yamlSpecs[0], label: 'GPT 5' }, yamlSpecs[1]];
    const reverted = resolve([specOp('gpt', 'gpt', yamlSpecs[0], own[0])], own, yamlSpecs, specs);
    expect(reverted).toMatchObject({ next: undefined, changed: true });
  });
});
