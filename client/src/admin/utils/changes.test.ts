import type * as t from '~/admin/types';
import {
  verifyWrite,
  planConfigChanges,
  mergedBackChanges,
  parseIndexedArrayPath,
} from './changes';
import { validateEntry, validateSection, validateField } from './validation';

const yaml: t.ConfigRecord = {
  balance: { enabled: true, startBalance: 1000000, refillAmount: 1000000 },
  endpoints: {
    custom: [
      {
        name: 'GPT',
        apiKey: '${OPENAI_KEY}',
        baseURL: 'https://api.openai.com/v1',
        models: { default: ['gpt-4o'] },
      },
      { name: 'Zai 2', apiKey: 'user_provided', baseURL: 'https://zai' },
    ],
  },
  mcpServers: {
    github: {
      type: 'streamable-http',
      url: 'https://api.githubcopilot.com/mcp/',
      headers: { Authorization: 'Bearer {{PAT_TOKEN}}' },
    },
  },
};

function snapshot(stored: t.ConfigRecord = {}, lower: t.ConfigRecord = yaml): t.WriteSnapshot {
  return { stored, lower, lowerKind: 'yaml' };
}

describe('validateSection / validateEntry / validateField', () => {
  it('catches cloudfront and turnstile refinements and required siblings', () => {
    expect(
      validateSection('cloudfront', { invalidateOnDelete: true }).map((i) => i.path),
    ).toContain('cloudfront.domain');
    expect(validateSection('turnstile', { options: { theme: 'auto' } })).toMatchObject([
      { path: 'turnstile.siteKey', code: 'required', message: 'is required' },
    ]);
  });

  it('maps entry issues to readable codes with the entry identity', () => {
    const issues = validateEntry(
      'endpoints.custom',
      {
        name: 'GPT',
        apiKey: 'k',
        baseURL: 'b',
        models: { default: ['m'] },
        provider: 'openai',
        streamRate: -5,
      },
      2,
      'GPT',
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'endpoints.custom.2.provider',
          code: 'invalid_literal',
          message: 'must be "anthropic"',
          entryIdentity: 'GPT',
          entryPath: 'provider',
        }),
        expect.objectContaining({
          path: 'endpoints.custom.2.streamRate',
          code: 'too_small',
          params: { minimum: 0 },
        }),
      ]),
    );
  });

  it('validates a single field', () => {
    expect(validateField('balance.startBalance', 'x')).toMatchObject([
      { code: 'invalid_type', params: { expected: 'a number' } },
    ]);
  });
});

describe('parseIndexedArrayPath', () => {
  it('recognizes items of array settings only', () => {
    expect(parseIndexedArrayPath('modelSpecs.list.2')).toEqual({
      arrayPath: 'modelSpecs.list',
      index: 2,
    });
    expect(parseIndexedArrayPath('mcpServers.2024')).toBeNull();
  });
});

describe('planConfigChanges', () => {
  it('turns entry ops into one write of the stored array (one partial entry)', () => {
    const baseline = (yaml.endpoints as t.ConfigRecord).custom as t.ConfigRecord[];
    const plan = planConfigChanges(
      [
        {
          op: 'upsertEntry',
          path: 'endpoints.custom',
          key: 'GPT',
          identity: 'GPT',
          baseline: baseline[0],
          value: { ...baseline[0], baseURL: 'https://proxy.example.com/v1' },
        },
      ],
      snapshot(),
    );
    expect(plan.issues).toEqual([]);
    expect(plan.sets).toEqual([
      {
        fieldPath: 'endpoints.custom',
        value: [{ name: 'GPT', baseURL: 'https://proxy.example.com/v1' }],
      },
    ]);
    expect(plan.effective).toBe(1);
  });

  it('blocks the whole batch on an invalid entry, naming the entry and field', () => {
    const baseline = ((yaml.endpoints as t.ConfigRecord).custom as t.ConfigRecord[])[0];
    const plan = planConfigChanges(
      [
        { op: 'set', path: 'balance.startBalance', value: 5 },
        {
          op: 'upsertEntry',
          path: 'endpoints.custom',
          key: 'GPT',
          identity: 'GPT',
          baseline,
          value: { ...baseline, provider: 'openai' },
        },
      ],
      snapshot(),
    );
    expect(plan.issues).toMatchObject([
      { code: 'invalid_literal', entryIdentity: 'GPT', entryPath: 'provider' },
    ]);
  });

  it('names the entry of an unsafe key inside a stored endpoint list, not its stored position', () => {
    const baseline = ((yaml.endpoints as t.ConfigRecord).custom as t.ConfigRecord[])[1];
    const stored = {
      endpoints: { custom: [{ name: 'Tmp1', apiKey: 'k', baseURL: 'https://tmp' }] },
    };
    const plan = planConfigChanges(
      [
        {
          op: 'upsertEntry',
          path: 'endpoints.custom',
          key: 'Zai 2',
          identity: 'Zai 2',
          baseline,
          value: { ...baseline, headers: { 'x.dotted.key': 'val' } },
        },
      ],
      snapshot(stored),
    );
    expect(plan.issues).toMatchObject([
      {
        code: 'UNSAFE_KEY',
        path: 'endpoints.custom.1.headers',
        entryIdentity: 'Zai 2',
        entryPath: 'headers',
      },
    ]);
  });

  describe('blank text pre-flight', () => {
    const codes = (plan: t.WritePlan) => plan.issues.map((i) => [i.code, i.path]);

    it('blocks whitespace-only values and keys (no blank writes)', () => {
      const plan = planConfigChanges(
        [
          { op: 'set', path: 'endpoints.openAI.titleModel', value: '   ' },
          { op: 'set', path: 'interface.customWelcome', value: '\n' },
          { op: 'set', path: 'endpoints.all.headers', value: { '  ': 'value-only' } },
        ],
        snapshot(),
      );
      expect(codes(plan)).toEqual([
        ['BLANK_VALUE', 'endpoints.openAI.titleModel'],
        ['BLANK_VALUE', 'interface.customWelcome'],
        ['BLANK_KEY', 'endpoints.all.headers'],
      ]);
      expect(plan.issues[2].params).toEqual({ key: '  ' });
    });

    it('blocks a blank key the write path names (an imported header leaf)', () => {
      const plan = planConfigChanges(
        [{ op: 'set', path: 'endpoints.all.headers.  ', value: 'value-only' }],
        snapshot(),
      );
      expect(codes(plan)).toEqual([['BLANK_KEY', 'endpoints.all.headers']]);
    });

    it('names the endpoint whose Base URL is only spaces', () => {
      const plan = planConfigChanges(
        [
          {
            op: 'upsertEntry',
            path: 'endpoints.custom',
            key: 'Zai 2',
            identity: 'Zai 2',
            value: { name: 'Zai 2', baseURL: '   ' },
          },
        ],
        snapshot(),
      );
      expect(plan.issues).toMatchObject([
        { code: 'BLANK_VALUE', entryIdentity: 'Zai 2', entryPath: 'baseURL' },
      ]);
    });

    it('keeps non-blank strings verbatim, surrounding whitespace included', () => {
      const plan = planConfigChanges(
        [{ op: 'set', path: 'interface.customWelcome', value: '  Hello {{user.name}}\n' }],
        snapshot(),
      );
      expect(plan.issues).toEqual([]);
      expect(plan.sets).toEqual([
        { fieldPath: 'interface.customWelcome', value: '  Hello {{user.name}}\n' },
      ]);
    });

    it('stores whitespace-only stop sequences in any stop list', () => {
      const plan = planConfigChanges(
        [
          {
            op: 'upsertEntry',
            path: 'endpoints.custom',
            key: 'Zai 2',
            identity: 'Zai 2',
            value: { name: 'Zai 2', addParams: { stop: ['\n', '\n\n', ' '] } },
          },
          {
            op: 'set',
            path: 'modelSpecs.list',
            value: [
              {
                name: 'spec',
                label: 'Spec',
                preset: { endpoint: 'openAI', model: 'gpt-4o', stop: ['\n\n', '\n'] },
              },
            ],
          },
        ],
        snapshot(),
      );
      expect(plan.issues).toEqual([]);
      const custom = plan.sets.find((set) => set.fieldPath === 'endpoints.custom');
      expect(custom?.value).toEqual([{ name: 'Zai 2', addParams: { stop: ['\n', '\n\n', ' '] } }]);
      const specs = plan.sets.find((set) => set.fieldPath === 'modelSpecs.list');
      expect(specs?.value).toMatchObject([{ preset: { stop: ['\n\n', '\n'] } }]);
    });

    it('does not block a save over a blank value stored earlier in an untouched entry', () => {
      const stored = {
        endpoints: { custom: [{ name: 'Old', apiKey: 'k', baseURL: 'https://old', iconURL: ' ' }] },
      };
      const plan = planConfigChanges(
        [
          {
            op: 'upsertEntry',
            path: 'endpoints.custom',
            key: 'GPT',
            identity: 'GPT',
            value: { name: 'GPT', modelDisplayLabel: 'GPT 4' },
          },
        ],
        snapshot(stored),
      );
      expect(plan.issues.filter((i) => i.code === 'BLANK_VALUE')).toEqual([]);
    });
  });

  it('blocks a YAML endpoint delete before anything is written', () => {
    const plan = planConfigChanges(
      [{ op: 'removeEntry', path: 'endpoints.custom', key: 'Zai 2', identity: 'Zai 2' }],
      snapshot(),
    );
    expect(plan.issues.map((i) => i.code)).toEqual(['YAML_ENTRY_IMMUTABLE']);
  });

  it('sends no reset for a value the target does not override (D3)', () => {
    const plan = planConfigChanges(
      [
        { op: 'reset', path: 'balance.refillAmount' },
        { op: 'reset', path: 'balance.nothingHere' },
      ],
      snapshot({ balance: { startBalance: 5 } }),
    );
    expect(plan.resets).toEqual([]);
    expect(plan.skipped).toEqual([{ fieldPath: 'balance.refillAmount', reason: 'yamlValue' }]);
    expect(plan.effective).toBe(0);
  });

  it('writes a setting of a stored boolean switch through the switch, as an object', () => {
    const plan = planConfigChanges(
      [{ op: 'set', path: 'interface.schedules.maxPerUser', value: 5 }],
      snapshot({ interface: { schedules: false } }),
    );
    expect(plan.issues).toEqual([]);
    expect(plan.sets).toEqual([{ fieldPath: 'interface.schedules', value: { maxPerUser: 5 } }]);
    expect(plan.storedAfter).toEqual({ interface: { schedules: { maxPerUser: 5 } } });
  });

  it('folds a switch turned on and its settings into one object write', () => {
    const plan = planConfigChanges(
      [
        { op: 'set', path: 'interface.schedules.fireConcurrency', value: 2 },
        { op: 'set', path: 'interface.schedules', value: true },
        { op: 'set', path: 'interface.schedules.maxPerUser', value: 5 },
      ],
      snapshot({ interface: { schedules: true } }),
    );
    expect(plan.sets).toEqual([
      { fieldPath: 'interface.schedules', value: { fireConcurrency: 2, maxPerUser: 5 } },
    ]);
  });

  it('writes into a stored object switch key by key', () => {
    const plan = planConfigChanges(
      [{ op: 'set', path: 'interface.schedules.maxPerUser', value: 5 }],
      snapshot({ interface: { schedules: { fireConcurrency: 2 } } }),
    );
    expect(plan.sets).toEqual([{ fieldPath: 'interface.schedules.maxPerUser', value: 5 }]);
  });

  it('removes an ignored override from a librechat.yaml-only section without validating it', () => {
    const plan = planConfigChanges(
      [{ op: 'reset', path: 'turnstile.siteKey' }],
      snapshot({ turnstile: { siteKey: 'abc' } }, { turnstile: { options: { theme: 'auto' } } }),
    );
    expect(plan.issues).toEqual([]);
    expect(plan.resets).toEqual(['turnstile']);
  });

  it('removes a stored secret the API returns only as its preview', () => {
    const plan = planConfigChanges(
      [{ op: 'reset', path: 'webSearch.tavilyApiKey' }],
      snapshot({ webSearch: { tavilyApiKeyPreview: 'tvly-S...c123' }, balance: { enabled: true } }),
    );
    expect(plan.skipped).toEqual([]);
    expect(plan.resets).toEqual(['webSearch']);
    expect(plan.storedAfter).toEqual({ balance: { enabled: true } });
  });

  it('removes the emptied parent instead of leaving {} behind (SV-7)', () => {
    const plan = planConfigChanges(
      [{ op: 'reset', path: 'balance.startBalance' }],
      snapshot({ balance: { startBalance: 5 }, interface: { customWelcome: 'hi' } }),
    );
    expect(plan.resets).toEqual(['balance']);
    expect(plan.storedAfter).toEqual({ interface: { customWelcome: 'hi' } });
  });

  it('blocks a new custom endpoint LibreChat could not load, but not edits of librechat.yaml entries', () => {
    const added = planConfigChanges(
      [
        {
          op: 'upsertEntry',
          path: 'endpoints.custom',
          key: 'OnlyName',
          identity: null,
          value: { name: 'OnlyName' },
        },
      ],
      snapshot(),
    );
    expect(added.issues.map((issue) => [issue.entryPath, issue.code])).toEqual([
      ['apiKey', 'required'],
      ['baseURL', 'required'],
      ['models.default', 'models_required'],
    ]);
    const edited = planConfigChanges(
      [
        {
          op: 'upsertEntry',
          path: 'endpoints.custom',
          key: 'Zai 2',
          identity: 'Zai 2',
          value: { name: 'Zai 2', baseURL: 'https://zai2' },
          baseline: { name: 'Zai 2', baseURL: 'https://zai' },
        },
      ],
      snapshot(),
    );
    expect(edited.issues).toEqual([]);
  });

  it('counts a stored encrypted key (shown only as a preview) as the endpoint API key', () => {
    const stored = {
      endpoints: {
        custom: [
          {
            name: 'Vault',
            apiKeyPreview: 'sk-...',
            baseURL: 'https://v',
            models: { default: ['m'] },
          },
        ],
      },
    };
    const plan = planConfigChanges(
      [
        {
          op: 'upsertEntry',
          path: 'endpoints.custom',
          key: 'Vault',
          identity: 'Vault',
          value: { name: 'Vault', baseURL: 'https://v2', models: { default: ['m'] } },
          baseline: { name: 'Vault', baseURL: 'https://v', models: { default: ['m'] } },
        },
      ],
      snapshot(stored),
    );
    expect(plan.issues).toEqual([]);
  });

  it('widens a reset through every parent it leaves empty, up to the section', () => {
    const plan = planConfigChanges(
      [{ op: 'reset', path: 'endpoints.anthropic.models.default' }],
      snapshot({ endpoints: { anthropic: { models: { default: ['claude-opus-5-5'] } } } }),
    );
    expect(plan.resets).toEqual(['endpoints']);
    expect(plan.storedAfter).toEqual({});
  });

  it('folds a reset with new descendant values into one set (rename onto the same key)', () => {
    const stored = { mcpServers: { srv: { type: 'sse', url: 'https://old', title: 'Old' } } };
    const plan = planConfigChanges(
      [
        { op: 'reset', path: 'mcpServers.srv' },
        { op: 'set', path: 'mcpServers.srv.type', value: 'streamable-http' },
        { op: 'set', path: 'mcpServers.srv.url', value: 'https://new' },
      ],
      snapshot(stored),
    );
    expect(plan.resets).toEqual([]);
    expect(plan.sets).toEqual([
      { fieldPath: 'mcpServers.srv', value: { type: 'streamable-http', url: 'https://new' } },
    ]);
  });

  it('runs whole-section validation (an invalid MCP title blocks a rename)', () => {
    const stored = { mcpServers: { renamer: { type: 'sse', url: 'https://sse.example.com/sse' } } };
    const plan = planConfigChanges(
      [
        { op: 'set', path: 'mcpServers.final-server.type', value: 'sse' },
        { op: 'set', path: 'mcpServers.final-server.url', value: 'https://sse.example.com/sse' },
        { op: 'set', path: 'mcpServers.final-server.title', value: 'Bad_Title!' },
        { op: 'reset', path: 'mcpServers.renamer' },
      ],
      snapshot(stored),
    );
    expect(plan.issues.map((i) => i.path)).toContain('mcpServers.final-server.title');
  });

  it('rejects process-backed MCP fields with the field named', () => {
    const plan = planConfigChanges(
      [{ op: 'set', path: 'mcpServers.local.command', value: 'npx' }],
      snapshot(),
    );
    expect(plan.issues).toMatchObject([
      { code: 'PROCESS_MCP_FIELD', path: 'mcpServers.local.command' },
    ]);
  });

  it('warns about YAML record keys a whole-object write cannot remove', () => {
    const plan = planConfigChanges(
      [{ op: 'set', path: 'mcpServers.github.headers', value: { 'X-Other': 'abc' } }],
      snapshot(),
    );
    expect(plan.warnings).toEqual([
      { path: 'mcpServers.github.headers', warning: 'yamlOnly', keys: ['Authorization'] },
    ]);
  });

  it('expands an item write of a plain array into the whole array', () => {
    const lower = {
      modelSpecs: { list: [{ name: 'a', label: 'A', preset: { endpoint: 'openAI' } }] },
    };
    const plan = planConfigChanges(
      [
        {
          op: 'set',
          path: 'endpoints.agents.toolApproval.hooks.0',
          value: { module: 'm' },
        },
      ],
      snapshot({}, lower),
    );
    expect(plan.sets).toEqual([
      { fieldPath: 'endpoints.agents.toolApproval.hooks', value: [{ module: 'm' }] },
    ]);
  });

  it('reports skipped read-only paths without sending them', () => {
    const plan = planConfigChanges(
      [
        { op: 'set', path: 'filters.messages.pii.action', value: 'block' },
        { op: 'set', path: 'interface.prompts', value: false },
      ],
      snapshot(),
    );
    expect(plan.sets).toEqual([]);
    expect(plan.skipped).toEqual([
      { fieldPath: 'filters.messages.pii.action', reason: 'baseOnly' },
      { fieldPath: 'interface.prompts', reason: 'permission' },
    ]);
  });
});

describe('verifyWrite', () => {
  it('flags values LibreChat did not store, did not apply, or merges back', () => {
    const plan = planConfigChanges(
      [
        { op: 'set', path: 'balance.startBalance', value: 5 },
        { op: 'set', path: 'endpoints.bedrock.inferenceProfiles', value: { plain: 'arn:y' } },
        { op: 'set', path: 'mcpServers.github.headers', value: { 'X-Other': 'abc' } },
      ],
      snapshot(),
    );
    const storedActual = {
      balance: { startBalance: 5 },
      endpoints: { bedrock: { inferenceProfiles: {} } },
      mcpServers: { github: { headers: { 'X-Other': 'abc' } } },
    };
    const effective = { balance: { startBalance: 1000000 } };
    expect(verifyWrite(plan, snapshot(), storedActual, effective)).toEqual([
      { fieldPath: 'balance.startBalance', reason: 'notApplied' },
      { fieldPath: 'endpoints.bedrock.inferenceProfiles', reason: 'notStored' },
      { fieldPath: 'mcpServers.github.headers.Authorization', reason: 'yamlMerged' },
    ]);
  });

  it('accepts redacted secrets and an effective value that differs from YAML', () => {
    const plan = planConfigChanges(
      [{ op: 'set', path: 'webSearch.tavilyApiKey', value: 'tvly-secret' }],
      snapshot(),
    );
    const storedActual = { webSearch: { tavilyApiKeyPreview: 'tvly-s...cret' } };
    expect(verifyWrite(plan, snapshot(), storedActual, { webSearch: {} })).toEqual([]);
  });
});

describe('mergedBackChanges', () => {
  const warnings: t.ConfigWarning[] = [
    { path: 'mcpServers.github.headers', warning: 'yamlOnly', keys: ['Authorization'] },
  ];

  it('blames librechat.yaml in Base and Base in a profile', () => {
    expect(mergedBackChanges(warnings)).toEqual([
      expect.objectContaining({
        fieldPath: 'mcpServers.github.headers.Authorization',
        reason: 'yamlMerged',
      }),
    ]);
    expect(mergedBackChanges(warnings, { ...snapshot(), lowerKind: 'inherited' })).toEqual([
      expect.objectContaining({
        fieldPath: 'mcpServers.github.headers.Authorization',
        reason: 'inheritedMerged',
      }),
    ]);
  });

  it("names an entry's key by the entry's position in the merged list, as a dot path", () => {
    const entryWarning: t.ConfigWarning[] = [
      {
        path: 'endpoints.custom',
        warning: 'yamlOnly',
        entryIdentity: 'Zai 2',
        keys: ['customParams.paramDefinitions'],
      },
    ];
    expect(mergedBackChanges(entryWarning, snapshot())).toEqual([
      {
        fieldPath: 'endpoints.custom.1.customParams.paramDefinitions',
        reason: 'yamlMerged',
        entryIdentity: 'Zai 2',
        entryPath: 'customParams.paramDefinitions',
      },
    ]);
  });
});
