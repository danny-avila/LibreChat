import { configSchema } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import { summarizeChanges, applySaves, isSecretPath } from './diff';
import { buildReviewModel, describePath } from './group';
import translation from '~/locales/en/translation.json';
import { extractSchemaTree } from '~/admin/api/config';
import { parseIssueMessages } from './issues';
import { formatReviewValue } from './format';
import { planRevert } from './revert';

const tree = extractSchemaTree(configSchema as t.ZodSchemaLike);
const dict = translation as Record<string, string>;

const localize: t.LocalizeFn = (key, options) => {
  const count = options?.count;
  const plural = count == null ? undefined : dict[`${key}_${count === 1 ? 'one' : 'other'}`];
  let text = dict[key] ?? plural ?? key;
  for (const [name, value] of Object.entries(options ?? {})) {
    text = text.replaceAll(`{{${name}}}`, String(value));
  }
  return text;
};

const moonshot = { name: 'Moonshot', baseURL: 'https://api.moonshot.ai/v1', apiKey: 'k1' };
const zai = { name: 'Zai 2', baseURL: 'https://zai.example/v1', apiKey: 'k2' };
const vercel = { name: 'Vercel', baseURL: 'https://vercel.example/v1', apiKey: 'k3' };

function makeInput(overrides: Partial<t.ChangeSummaryInput>): t.ChangeSummaryInput {
  return {
    saves: [],
    resets: [],
    baseline: {},
    ownAt: () => undefined,
    isOwned: () => false,
    lowerAt: () => undefined,
    yamlEntries: () => undefined,
    isScope: false,
    fields: tree,
    schemaPaths: new Set(),
    ...overrides,
  };
}

const baseline = {
  endpoints: { custom: [moonshot, zai, vercel] },
  balance: { startBalance: 1000000, refillAmount: 1000000 },
  registration: { socialLogins: ['openid', 'google'] },
  interface: { customWelcome: 'Hi', termsOfService: { modalTitle: 'Terms' } },
  mcpServers: { github: { type: 'http', url: 'https://gh.example/mcp', timeout: 30000 } },
  modelSpecs: {
    list: [
      { name: 'spec-a', label: 'A' },
      { name: 'spec-b', label: 'B' },
    ],
  },
};

describe('summarizeChanges: keyed lists', () => {
  it('reviews deleting one endpoint as a single removed entry', () => {
    const items = summarizeChanges(
      makeInput({
        baseline,
        saves: [{ fieldPath: 'endpoints.custom', value: [moonshot, vercel] }],
      }),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'removed',
      path: 'endpoints.custom.1',
      entryIdentity: 'Zai 2',
      collectionPath: 'endpoints.custom',
      sourcePath: 'endpoints.custom',
    });
  });

  it('flags removing an entry librechat.yaml defines', () => {
    const [item] = summarizeChanges(
      makeInput({
        baseline,
        saves: [{ fieldPath: 'endpoints.custom', value: [moonshot, vercel] }],
        yamlEntries: () => new Set(['Zai 2']),
      }),
    );
    expect(item.warnings).toEqual(['yamlEntry']);
  });

  it('matches entries by name, so a deletion does not shift the others into changes', () => {
    const added = { name: 'OpenRouter Direct', baseURL: 'https://or.example' };
    const items = summarizeChanges(
      makeInput({
        baseline,
        saves: [
          {
            fieldPath: 'endpoints.custom',
            value: [{ ...moonshot, baseURL: 'https://api.moonshot.cn/v1' }, vercel, added],
          },
        ],
      }),
    );
    expect(items.map((i) => [i.kind, i.path, i.entryIdentity])).toEqual([
      ['changed', 'endpoints.custom.0.baseURL', 'Moonshot'],
      ['added', 'endpoints.custom.2', 'OpenRouter Direct'],
      ['removed', 'endpoints.custom.1', 'Zai 2'],
    ]);
    expect(items[0]).toMatchObject({
      before: 'https://api.moonshot.ai/v1',
      after: 'https://api.moonshot.cn/v1',
    });
  });

  it('reads a new name at the same position as a rename plus its field changes', () => {
    const items = summarizeChanges(
      makeInput({
        baseline,
        saves: [
          {
            fieldPath: 'endpoints.custom.1',
            value: { ...zai, name: 'Zai', baseURL: 'https://zai.example/v2' },
          },
        ],
      }),
    );
    expect(items.map((i) => [i.kind, i.path, i.entryIdentity])).toEqual([
      ['renamed', 'endpoints.custom.1', 'Zai'],
      ['changed', 'endpoints.custom.1.baseURL', 'Zai'],
    ]);
    expect(items[0]).toMatchObject({ before: 'Zai 2', after: 'Zai', previousIdentity: 'Zai 2' });
  });

  it('reports renames when a whole list is saved', () => {
    const items = summarizeChanges(
      makeInput({
        baseline,
        saves: [
          { fieldPath: 'endpoints.custom', value: [moonshot, { ...zai, name: 'Zai' }, vercel] },
        ],
      }),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'renamed',
      before: 'Zai 2',
      after: 'Zai',
      previousIdentity: 'Zai 2',
      entryIdentity: 'Zai',
    });
  });

  it('reports a reordered list once', () => {
    const items = summarizeChanges(
      makeInput({
        baseline,
        saves: [{ fieldPath: 'modelSpecs.list', value: [...baseline.modelSpecs.list].reverse() }],
        isOwned: () => true,
      }),
    );
    expect(items).toEqual([
      expect.objectContaining({
        path: 'modelSpecs.list',
        before: ['spec-a', 'spec-b'],
        after: ['spec-b', 'spec-a'],
      }),
    ]);
  });

  it('warns that saving a YAML-fed list of entries makes the panel own it', () => {
    const items = summarizeChanges(
      makeInput({
        baseline,
        saves: [
          {
            fieldPath: 'modelSpecs.list',
            value: [baseline.modelSpecs.list[0], { name: 'spec-b', label: 'B2' }],
          },
        ],
        lowerAt: (path) =>
          path === 'modelSpecs.list'
            ? { value: baseline.modelSpecs.list, source: 'yaml' }
            : undefined,
      }),
    );
    expect(items).toHaveLength(1);
    expect(items[0].warnings).toEqual(['ownershipChange']);
  });
});

describe('summarizeChanges: plain values', () => {
  it('lists a primitive list as one change with both lists', () => {
    const [item] = summarizeChanges(
      makeInput({
        baseline,
        saves: [{ fieldPath: 'registration.socialLogins', value: ['openid', 'github'] }],
        isOwned: () => true,
      }),
    );
    expect(item).toMatchObject({
      kind: 'changed',
      before: ['openid', 'google'],
      after: ['openid', 'github'],
    });
  });

  it('reports only the leaves that changed inside an object', () => {
    const items = summarizeChanges(
      makeInput({
        baseline,
        saves: [
          {
            fieldPath: 'interface',
            value: { customWelcome: 'Hi', termsOfService: { modalTitle: 'New terms' } },
          },
        ],
        isOwned: () => true,
      }),
    );
    expect(items.map((i) => i.path)).toEqual(['interface.termsOfService.modalTitle']);
  });

  it('shows the librechat.yaml value as BEFORE when Base has no override yet', () => {
    const [item] = summarizeChanges(
      makeInput({
        baseline,
        saves: [{ fieldPath: 'balance.startBalance', value: 2500000 }],
        lowerAt: () => ({ value: 1000000, source: 'yaml' }),
      }),
    );
    expect(item).toMatchObject({
      kind: 'changed',
      before: undefined,
      after: 2500000,
      revertTarget: { value: 1000000, source: 'yaml' },
    });
  });

  it('in a profile, BEFORE is the profile value and an unset one inherits from Base', () => {
    const [item] = summarizeChanges(
      makeInput({
        baseline: {},
        isScope: true,
        saves: [{ fieldPath: 'balance.startBalance', value: 42 }],
        lowerAt: () => ({ value: 1000000, source: 'inherited' }),
      }),
    );
    expect(item).toMatchObject({
      kind: 'added',
      before: undefined,
      after: 42,
      revertTarget: { value: 1000000, source: 'inherited' },
    });
  });

  it('describes a reset with the value it reverts to', () => {
    const [item] = summarizeChanges(
      makeInput({
        baseline,
        resets: ['balance.refillAmount'],
        ownAt: () => 5000,
        lowerAt: () => ({ value: 1000000, source: 'yaml' }),
      }),
    );
    expect(item).toMatchObject({
      kind: 'reverted',
      before: 5000,
      after: undefined,
      revertTarget: { value: 1000000, source: 'yaml' },
    });
  });
});

describe('summarizeChanges: MCP servers and secrets', () => {
  it('groups the fields of a new server into one added entry', () => {
    const items = summarizeChanges(
      makeInput({
        baseline,
        saves: [
          { fieldPath: 'mcpServers.acme.type', value: 'streamable-http' },
          { fieldPath: 'mcpServers.acme.url', value: 'https://acme.example/mcp' },
        ],
      }),
    );
    expect(items).toEqual([
      expect.objectContaining({
        kind: 'added',
        path: 'mcpServers.acme',
        entryIdentity: 'acme',
        after: { type: 'streamable-http', url: 'https://acme.example/mcp' },
      }),
    ]);
  });

  it('reads a server removed and re-added under a new key with the same fields as one rename', () => {
    const dbsrv = { type: 'streamable-http', url: 'https://db.example/mcp', title: 'DB' };
    const items = summarizeChanges(
      makeInput({
        baseline: { mcpServers: { dbsrv } },
        ownAt: (path) => (path === 'mcpServers.dbsrv' ? dbsrv : undefined),
        saves: Object.entries(dbsrv).map(([key, value]) => ({
          fieldPath: `mcpServers.dbsrv2.${key}`,
          value,
        })),
        resets: ['mcpServers.dbsrv'],
      }),
    );
    expect(items).toEqual([
      expect.objectContaining({
        kind: 'renamed',
        path: 'mcpServers.dbsrv2',
        entryIdentity: 'dbsrv2',
        previousIdentity: 'dbsrv',
      }),
    ]);
  });

  it('keeps field changes of an existing server under that server', () => {
    const [item] = summarizeChanges(
      makeInput({ baseline, saves: [{ fieldPath: 'mcpServers.github.timeout', value: 45000 }] }),
    );
    expect(item).toMatchObject({
      kind: 'changed',
      path: 'mcpServers.github.timeout',
      entryPath: 'mcpServers.github',
      entryIdentity: 'github',
      before: 30000,
      after: 45000,
    });
  });

  it('marks secret leaves, including an apiKey object key', () => {
    expect(isSecretPath('endpoints.custom.0.apiKey')).toBe(true);
    expect(isSecretPath('mcpServers.x.apiKey.key')).toBe(true);
    expect(isSecretPath('mcpServers.x.oauth.client_secret')).toBe(true);
    expect(isSecretPath('mcpServers.x.apiKey.source')).toBe(false);
    const [item] = summarizeChanges(
      makeInput({
        baseline,
        saves: [{ fieldPath: 'endpoints.custom.0', value: { ...moonshot, apiKey: 'sk-typed' } }],
      }),
    );
    expect(item).toMatchObject({ path: 'endpoints.custom.0.apiKey', secret: true });
  });
});

describe('buildReviewModel', () => {
  const ctx = (saves: t.SaveEntry[]): t.ReviewLabelContext => ({
    localize,
    fields: tree,
    tree: applySaves(baseline, saves),
  });

  it('groups tab › section › entry with field labels and an accurate count', () => {
    const saves: t.SaveEntry[] = [
      {
        fieldPath: 'endpoints.custom',
        value: [{ ...moonshot, baseURL: 'https://api.moonshot.cn/v1' }, vercel],
      },
      { fieldPath: 'balance.startBalance', value: 5 },
    ];
    const items = summarizeChanges(makeInput({ baseline, saves, isOwned: () => true }));
    const model = buildReviewModel(items, ctx(saves));
    expect(model.count).toBe(3);
    expect(model.tabTitles).toEqual(['Custom endpoints', 'System']);
    const custom = model.tabs[0].sections[0];
    expect(custom.entries[0]).toMatchObject({ title: 'Moonshot', noun: 'endpoint' });
    expect(custom.entries[0].rows[0].label).toBe('Base URL');
    expect(custom.rows[0]).toMatchObject({ label: 'Zai 2', noun: 'endpoint' });
    const system = model.tabs[1].sections[0];
    expect(system.title).toBe('Balance');
    expect(system.rows[0].label).toBe('Start balance');
  });

  it('lists changes of a nested list under the entry that holds it', () => {
    const foundry = {
      name: 'Foundry',
      baseURL: 'https://foundry.example/v1',
      apiKey: 'k4',
      customParams: { paramDefinitions: [{ key: 'useResponsesApi', default: true }] },
    };
    const nested = { ...baseline, endpoints: { custom: [moonshot, foundry] } };
    const saves: t.SaveEntry[] = [
      {
        fieldPath: 'endpoints.custom',
        value: [
          moonshot,
          {
            ...foundry,
            customParams: {
              paramDefinitions: [{ key: 'useResponsesApi', default: false }, { key: 'myParam' }],
            },
          },
        ],
      },
    ];
    const items = summarizeChanges(makeInput({ baseline: nested, saves, isOwned: () => true }));
    const model = buildReviewModel(items, {
      localize,
      fields: tree,
      tree: applySaves(nested, saves),
    });
    const [section] = model.tabs[0].sections;
    expect(section.rows).toEqual([]);
    expect(section.entries).toHaveLength(1);
    expect(section.entries[0]).toMatchObject({ title: 'Foundry', noun: 'endpoint' });
    expect(section.entries[0].rows.map((row) => [row.label, row.noun])).toEqual([
      ['useResponsesApi › Default value', undefined],
      ['myParam', 'parameter definition'],
    ]);
  });

  it('lists the fields of an added entry under it, without its name', () => {
    const saves: t.SaveEntry[] = [
      { fieldPath: 'mcpServers.acme.type', value: 'streamable-http' },
      { fieldPath: 'mcpServers.acme.url', value: 'https://acme.example/mcp' },
    ];
    const model = buildReviewModel(summarizeChanges(makeInput({ baseline, saves })), ctx(saves));
    const [row] = model.tabs[0].sections[0].rows;
    expect(row.label).toBe('acme');
    expect(row.details?.map((d) => d.label)).toEqual(['Type', 'URL']);
    expect(model.count).toBe(1);
  });

  it('labels a variant type by its branch, not its raw value', () => {
    const saves: t.SaveEntry[] = [
      { fieldPath: 'summarization.trigger.type', value: 'token_ratio' },
    ];
    const model = buildReviewModel(
      summarizeChanges(makeInput({ baseline, saves, isOwned: () => true })),
      ctx(saves),
    );
    const [row] = model.tabs[0].sections[0].rows;
    expect(row.valueLabels?.token_ratio).not.toBe('token_ratio');
    expect(row.valueLabels?.remaining_tokens).toBeDefined();
  });

  it('attaches issues to the row they belong to', () => {
    const saves: t.SaveEntry[] = [{ fieldPath: 'balance.startBalance', value: -1 }];
    const model = buildReviewModel(
      summarizeChanges(makeInput({ baseline, saves, isOwned: () => true })),
      ctx(saves),
      [{ path: 'balance.startBalance', message: 'too small', blocking: true }],
    );
    expect(model.tabs[0].sections[0].rows[0].issues?.[0].message).toBe('too small');
  });

  it('labels a path with entry titles instead of indices', () => {
    expect(describePath('endpoints.custom.1.baseURL', ctx([]))).toBe(
      'Custom endpoints › Zai 2 › Base URL',
    );
    expect(describePath('interface.termsOfService.modalTitle', ctx([]))).toBe(
      'Features › Interface › Terms of service › Modal title',
    );
  });

  it('keeps a dotted record key whole instead of splitting it into fields', () => {
    expect(
      describePath('endpoints.bedrock.inferenceProfiles.us.anthropic.claude-sonnet-4-6', ctx([])),
    ).toMatch(/› us\.anthropic\.claude-sonnet-4-6$/);
  });

  it("labels a merged-back entry key on the entry's own tab, not as raw segments", () => {
    expect(describePath('endpoints.custom.1.customParams.paramDefinitions', ctx([]))).toBe(
      'Custom endpoints › Zai 2 › Custom parameters › Parameter definitions',
    );
  });
});

describe('parseIssueMessages', () => {
  it('splits a validation failure into per-path messages', () => {
    expect(
      parseIssueMessages(
        'Validation failed — endpoints.agents.maxCitations: Number must be less than or equal to 50; endpoints.azureOpenAI.groups[0].models: Required',
      ),
    ).toEqual([
      { path: 'endpoints.agents.maxCitations', message: 'Number must be less than or equal to 50' },
      { path: 'endpoints.azureOpenAI.groups.0.models', message: 'Required' },
    ]);
  });

  it('keeps messages that contain semicolons and unsafe-key suffixes intact', () => {
    expect(
      parseIssueMessages(
        'Validation failed — endpoints.azureOpenAI.groups: managed in librechat.yaml; LibreChat ignores it; endpoints.bedrock.inferenceProfiles → "us.a": bad key',
      ),
    ).toEqual([
      {
        path: 'endpoints.azureOpenAI.groups',
        message: 'managed in librechat.yaml; LibreChat ignores it',
      },
      { path: 'endpoints.bedrock.inferenceProfiles', message: '"us.a": bad key' },
    ]);
  });

  it('returns a message without paths unchanged', () => {
    expect(parseIssueMessages('Network error')).toEqual([{ message: 'Network error' }]);
  });
});

describe('planRevert', () => {
  const saveList = (value: t.ConfigValue[]) => [{ fieldPath: 'endpoints.custom', value }];

  function revertFirst(value: t.ConfigValue[], pick = 0) {
    const saves = saveList(value);
    const items = summarizeChanges(makeInput({ baseline, saves }));
    return planRevert(items[pick], { 'endpoints.custom': value }, baseline);
  }

  it('restores a removed entry at its position', () => {
    const action = revertFirst([moonshot, vercel]);
    expect(action).toEqual({ op: 'discard', paths: ['endpoints.custom'] });
  });

  it('undoes one entry change and keeps the others', () => {
    const changed = { ...moonshot, baseURL: 'https://api.moonshot.cn/v1' };
    const action = revertFirst([changed, vercel]);
    expect(action).toEqual({ op: 'set', path: 'endpoints.custom', value: [moonshot, vercel] });
  });

  it('drops an added entry', () => {
    const added = { name: 'New', baseURL: 'https://new.example' };
    const action = revertFirst([moonshot, zai, vercel, added]);
    expect(action).toEqual({ op: 'discard', paths: ['endpoints.custom'] });
  });

  it('drops every field edit of a server created field by field', () => {
    const saves = [
      { fieldPath: 'mcpServers.acme.type', value: 'streamable-http' },
      { fieldPath: 'mcpServers.acme.url', value: 'https://acme.example/mcp' },
    ];
    const [item] = summarizeChanges(makeInput({ baseline, saves }));
    const edited = { 'mcpServers.acme.type': 'streamable-http', 'mcpServers.acme.url': 'x' };
    expect(planRevert(item, edited, baseline)).toEqual({
      op: 'discard',
      paths: ['mcpServers.acme.type', 'mcpServers.acme.url'],
    });
  });

  it('reverts one field of an entry edited at its position and keeps every other edit', () => {
    const edited = {
      'endpoints.custom.0': {
        ...moonshot,
        baseURL: 'https://api.moonshot.ai/v2',
        modelDisplayLabel: 'Kimi R',
      },
      'endpoints.custom.2': { ...vercel, modelDisplayLabel: 'V' },
    };
    const pending = [edited['endpoints.custom.0'], zai, edited['endpoints.custom.2']];
    const items = summarizeChanges(makeInput({ baseline, saves: saveList(pending) }));
    const baseUrl = items.find((i) => i.path === 'endpoints.custom.0.baseURL')!;
    expect(planRevert(baseUrl, edited, baseline)).toEqual({
      op: 'set',
      path: 'endpoints.custom.0',
      value: { ...moonshot, modelDisplayLabel: 'Kimi R' },
    });
    const label = items.find((i) => i.path === 'endpoints.custom.2.modelDisplayLabel')!;
    expect(planRevert(label, edited, baseline)).toEqual({
      op: 'discard',
      paths: ['endpoints.custom.2'],
    });
  });

  it('reverts only the rename of an entry edited at its position', () => {
    const edited = {
      'endpoints.custom.1': { ...zai, name: 'Zai 3', baseURL: 'https://zai.example/v2' },
    };
    const pending = [moonshot, edited['endpoints.custom.1'], vercel];
    const items = summarizeChanges(makeInput({ baseline, saves: saveList(pending) }));
    const renamed = items.find((i) => i.kind === 'renamed')!;
    expect(planRevert(renamed, edited, baseline)).toEqual({
      op: 'set',
      path: 'endpoints.custom.1',
      value: { ...zai, baseURL: 'https://zai.example/v2' },
    });
  });

  it('puts back one field of an entry edited as a whole', () => {
    const value = { ...zai, baseURL: 'https://zai.example/v2', apiKey: 'k9' };
    const items = summarizeChanges(
      makeInput({ baseline, saves: [{ fieldPath: 'endpoints.custom.1', value }] }),
    );
    const baseUrlItem = items.find((i) => i.path.endsWith('baseURL'))!;
    expect(planRevert(baseUrlItem, { 'endpoints.custom.1': value }, baseline)).toEqual({
      op: 'set',
      path: 'endpoints.custom.1',
      value: { ...zai, apiKey: 'k9' },
    });
  });
});

describe('formatReviewValue', () => {
  it('shows whitespace-only strings quoted and escaped, so a stop sequence is visible', () => {
    expect(formatReviewValue('\n', localize)).toBe('"\\n"');
    expect(formatReviewValue(['\n', '\n\n'], localize)).toBe('"\\n", "\\n\\n"');
    expect(formatReviewValue(' Hello ', localize)).toBe(' Hello ');
  });
});
