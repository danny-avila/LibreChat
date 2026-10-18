import type * as t from '~/admin/types';
import {
  flattenObject,
  getValueAtPath,
  unflattenObject,
  resolveFieldValue,
  getUnknownConfigEntries,
} from '~/admin/utils';
import {
  applyConfigEdit,
  buildSavePayload,
  normalizeForSave,
  isConfigValueEqual,
  mergeIndexedArrayEdits,
} from './edits';
import {
  getControlType,
  getEnumOptions,
  findSchemaField,
  splitUnionTypes,
  getArrayItemType,
} from './controls';
import { hasPathOverlap, withLangfuseConfiguredPath } from './counts';
import { createField } from '~/admin/test/fixtures';
import { collectImportEntries } from './import';

describe('getControlType', () => {
  it('maps boolean to toggle', () => {
    expect(getControlType(createField({ key: 'enabled', type: 'boolean' }))).toBe('toggle');
  });

  it('maps enum(...) to select', () => {
    expect(getControlType(createField({ key: 'mode', type: 'enum(dark | light)' }))).toBe('select');
  });

  it('maps number to number', () => {
    expect(getControlType(createField({ key: 'port', type: 'number' }))).toBe('number');
  });

  it('maps string to text', () => {
    expect(getControlType(createField({ key: 'title', type: 'string' }))).toBe('text');
  });

  it('maps array<string> to array', () => {
    expect(getControlType(createField({ key: 'tags', type: 'array<string>' }))).toBe('array');
  });

  it('maps object to object', () => {
    expect(getControlType(createField({ key: 'settings', type: 'object', isObject: true }))).toBe(
      'object',
    );
  });

  it('prioritizes isObject flag over type string', () => {
    expect(getControlType(createField({ key: 'nested', type: 'ZodObject', isObject: true }))).toBe(
      'object',
    );
  });

  it('maps record to record', () => {
    expect(getControlType(createField({ key: 'headers', type: 'record' }))).toBe('record');
  });

  it('maps union(number | string) (coerced numbers) to number', () => {
    expect(getControlType(createField({ key: 'limit', type: 'union(number | string)' }))).toBe(
      'number',
    );
  });

  it('maps a union of different scalars to scalar-union', () => {
    expect(getControlType(createField({ key: 'limit', type: 'union(number | boolean)' }))).toBe(
      'scalar-union',
    );
    expect(getControlType(createField({ key: 'val', type: 'union(string | boolean)' }))).toBe(
      'scalar-union',
    );
  });

  it('maps union containing only boolean to toggle', () => {
    expect(
      getControlType(createField({ key: 'flag', type: 'union(boolean | literal(null))' })),
    ).toBe('toggle');
  });

  it('falls back to the YAML editor for unknown types', () => {
    expect(getControlType(createField({ key: 'data', type: 'ZodAny' }))).toBe('code');
  });

  it('maps wide union with primitives and complex types to the YAML editor', () => {
    expect(
      getControlType(
        createField({
          key: 'doc',
          type: 'union(null | boolean | number | string | array<unknown> | record)',
        }),
      ),
    ).toBe('code');
  });

  it('maps union(boolean | object) with children to switch-object', () => {
    expect(
      getControlType(
        createField({
          key: 'prompts',
          type: 'union(boolean | object)',
          children: [createField({ key: 'use', type: 'boolean' })],
        }),
      ),
    ).toBe('switch-object');
  });

  it('maps union(boolean | object) without children to toggle', () => {
    expect(getControlType(createField({ key: 'x', type: 'union(boolean | object)' }))).toBe(
      'toggle',
    );
  });

  it('maps union(string | record) to text-record', () => {
    expect(getControlType(createField({ key: 'label', type: 'union(string | record)' }))).toBe(
      'text-record',
    );
  });

  it('maps union(string | array<string>) to text-record', () => {
    expect(
      getControlType(createField({ key: 'content', type: 'union(string | array<string>)' })),
    ).toBe('text-record');
  });

  it('maps union(array<string> | record) to list-record', () => {
    expect(
      getControlType(createField({ key: 'models', type: 'union(array<string> | record)' })),
    ).toBe('list-record');
  });

  it('maps union(enum(...) | number) to select', () => {
    expect(
      getControlType(
        createField({
          key: 'stderr',
          type: 'union(enum(pipe | ignore | inherit) | number)',
        }),
      ),
    ).toBe('select');
  });
});

describe('getEnumOptions', () => {
  it('parses standard enum options', () => {
    const options = getEnumOptions('enum(dark | light | system)');
    expect(options).toEqual([
      { label: 'Dark', value: 'dark' },
      { label: 'Light', value: 'light' },
      { label: 'System', value: 'system' },
    ]);
  });

  it('filters empty segments from leading/trailing delimiters', () => {
    const options = getEnumOptions('enum(| dark | light |)');
    expect(options).toEqual([
      { label: 'Dark', value: 'dark' },
      { label: 'Light', value: 'light' },
    ]);
  });

  it('handles single-value enum', () => {
    const options = getEnumOptions('enum(only)');
    expect(options).toEqual([{ label: 'Only', value: 'only' }]);
  });

  it('replaces underscores with spaces in labels', () => {
    const options = getEnumOptions('enum(my_custom_value)');
    expect(options).toEqual([{ label: 'My custom value', value: 'my_custom_value' }]);
  });

  it('returns empty array for non-enum type strings', () => {
    expect(getEnumOptions('string')).toEqual([]);
    expect(getEnumOptions('number')).toEqual([]);
  });

  it('extracts enum options from union(enum(...) | number) without leaking other branches', () => {
    const options = getEnumOptions('union(enum(pipe | ignore | inherit) | number)');
    expect(options).toEqual([
      { label: 'Pipe', value: 'pipe' },
      { label: 'Ignore', value: 'ignore' },
      { label: 'Inherit', value: 'inherit' },
    ]);
  });

  it('does not produce options with trailing parens from greedy regex', () => {
    const options = getEnumOptions('union(enum(a | b) | number)');
    for (const opt of options) {
      expect(opt.value).not.toContain(')');
      expect(opt.label).not.toContain(')');
    }
  });
});

describe('getArrayItemType', () => {
  it('extracts inner type from array<T>', () => {
    expect(getArrayItemType('array<string>')).toBe('string');
  });

  it('defaults to string when no angle brackets', () => {
    expect(getArrayItemType('array')).toBe('string');
  });
});

describe('splitUnionTypes', () => {
  it('splits simple union into parts', () => {
    expect(splitUnionTypes('union(string | number)')).toEqual(['string', 'number']);
  });

  it('respects depth tracking and does not split inside nested parens', () => {
    const result = splitUnionTypes('union(enum(a | b) | number)');
    expect(result).toEqual(['enum(a | b)', 'number']);
  });

  it('returns single type for union with one member', () => {
    expect(splitUnionTypes('union(string)')).toEqual(['string']);
  });

  it('returns empty array for non-union input', () => {
    expect(splitUnionTypes('string')).toEqual([]);
    expect(splitUnionTypes('')).toEqual([]);
  });

  it('handles nested parens without splitting inner content', () => {
    const result = splitUnionTypes('union(enum(a | b) | string)');
    expect(result).toEqual(['enum(a | b)', 'string']);
  });
});

describe('withLangfuseConfiguredPath', () => {
  it('includes a configured dedicated connection without mutating base paths', () => {
    const basePaths = new Set(['interface.theme']);

    const paths = withLangfuseConfiguredPath(basePaths, true);

    expect(paths).toEqual(new Set(['interface.theme', 'langfuse.enabled']));
    expect(basePaths).toEqual(new Set(['interface.theme']));
  });

  it('does not mark an unconfigured connection', () => {
    expect(withLangfuseConfiguredPath(new Set(['interface.theme']), false)).toEqual(
      new Set(['interface.theme']),
    );
  });
});

describe('getControlType — union(literal(...)) as select', () => {
  it('returns select for union of literals', () => {
    const field = createField({
      key: 'method',
      type: 'union(literal("completion") | literal("structured"))',
    });
    expect(getControlType(field)).toBe('select');
  });
});

describe('getEnumOptions — union(literal(...)) parsing', () => {
  it('extracts options from union of literal types', () => {
    const options = getEnumOptions('union(literal("completion") | literal("structured"))');
    expect(options).toEqual([
      { label: 'Completion', value: 'completion' },
      { label: 'Structured', value: 'structured' },
    ]);
  });

  it('returns empty array for non-enum/non-literal-union input', () => {
    expect(getEnumOptions('string')).toEqual([]);
    expect(getEnumOptions('union(string | number)')).toEqual([]);
  });
});

describe('mergeIndexedArrayEdits', () => {
  it('creates the array under a parent path absent from the baseline', () => {
    /**
     * Regression: the merge previously bailed out and wrote the array at the
     * wrong nesting level when its parent (e.g. modelSpecs) wasn't in
     * librechat.yaml, causing typed list entries to disappear from view.
     */
    const merged = mergeIndexedArrayEdits({}, [
      ['modelSpecs.list.0', { name: 'test', label: 'Test' }],
    ]);
    expect(merged).toEqual({
      modelSpecs: { list: [{ name: 'test', label: 'Test' }] },
    });
  });

  it('preserves baseline siblings when introducing a new section', () => {
    const merged = mergeIndexedArrayEdits({ interface: { parameters: true } }, [
      ['modelSpecs.list.0', { name: 'a' }],
    ]);
    expect(merged).toEqual({
      interface: { parameters: true },
      modelSpecs: { list: [{ name: 'a' }] },
    });
  });

  it('merges into an existing parent without clobbering its keys', () => {
    const merged = mergeIndexedArrayEdits({ modelSpecs: { enforce: true, prioritize: false } }, [
      ['modelSpecs.list.0', { name: 'a' }],
    ]);
    expect(merged.modelSpecs).toEqual({
      enforce: true,
      prioritize: false,
      list: [{ name: 'a' }],
    });
  });

  it('places multiple indexed edits at their correct positions', () => {
    const merged = mergeIndexedArrayEdits({}, [
      ['modelSpecs.list.0', { name: 'a' }],
      ['modelSpecs.list.2', { name: 'c' }],
    ]);
    const list = (merged.modelSpecs as { list: Array<{ name: string } | undefined> }).list;
    expect(list[0]).toEqual({ name: 'a' });
    expect(list[1]).toBeUndefined();
    expect(list[2]).toEqual({ name: 'c' });
  });

  it('returns the baseline unchanged when there are no indexed edits', () => {
    const baseline = { interface: { parameters: true } };
    expect(mergeIndexedArrayEdits(baseline, [])).toEqual(baseline);
  });

  it('does not mutate the baseline object', () => {
    const baseline: Record<string, unknown> = { modelSpecs: { enforce: true } };
    const before = JSON.parse(JSON.stringify(baseline));
    mergeIndexedArrayEdits(baseline as Record<string, never>, [
      ['modelSpecs.list.0', { name: 'a' }],
    ]);
    expect(baseline).toEqual(before);
  });

  it('skips an edit when an intermediate path is a primitive', () => {
    /**
     * Defensive: refuse to overwrite a primitive at an intermediate path
     * because doing so would silently destroy unrelated baseline data.
     */
    const merged = mergeIndexedArrayEdits({ modelSpecs: 'not-an-object' }, [
      ['modelSpecs.list.0', { name: 'a' }],
    ]);
    expect(merged).toEqual({ modelSpecs: 'not-an-object' });
  });

  it('skips an edit when an intermediate path is an array', () => {
    const merged = mergeIndexedArrayEdits({ modelSpecs: [1, 2, 3] }, [
      ['modelSpecs.list.0', { name: 'a' }],
    ]);
    expect(merged).toEqual({ modelSpecs: [1, 2, 3] });
  });

  it('walks deep parent chains, creating each missing level', () => {
    const merged = mergeIndexedArrayEdits({}, [['endpoints.custom.deep.list.0', { name: 'x' }]]);
    expect(merged).toEqual({
      endpoints: { custom: { deep: { list: [{ name: 'x' }] } } },
    });
  });
});

describe('applyConfigEdit', () => {
  it('updates a pending whole-array edit when a newly-added entry is typed into', () => {
    const prev = {
      'modelSpecs.list': [{}, { name: 'smart-assistant' }],
    };
    const result = applyConfigEdit(
      prev,
      'modelSpecs.list.0',
      { name: 'TEST1' },
      {},
      new Set(),
      new Set(),
    );
    expect(result).toEqual({
      'modelSpecs.list': [{ name: 'TEST1' }, { name: 'smart-assistant' }],
    });
    expect(result).not.toHaveProperty('modelSpecs.list.0');
  });

  it('keeps per-index edits when no parent array edit is pending', () => {
    const result = applyConfigEdit(
      {},
      'modelSpecs.list.0',
      { name: 'TEST1' },
      {},
      new Set(),
      new Set(),
    );
    expect(result).toEqual({
      'modelSpecs.list.0': { name: 'TEST1' },
    });
  });

  it('keeps a switch turned on when one of its settings is edited', () => {
    const on = applyConfigEdit({}, 'interface.schedules', true, {}, new Set(), new Set());
    const result = applyConfigEdit(
      on,
      'interface.schedules.maxPerUser',
      5,
      {},
      new Set(),
      new Set(),
    );
    expect(result).toEqual({ 'interface.schedules': true, 'interface.schedules.maxPerUser': 5 });
    const off = applyConfigEdit(result, 'interface.schedules', false, {}, new Set(), new Set());
    expect(off).toEqual({ 'interface.schedules': false });
  });

  it('drops stale indexed edits when a whole-array edit is queued', () => {
    const result = applyConfigEdit(
      { 'modelSpecs.list.0': { name: 'old' } },
      'modelSpecs.list',
      [{ name: 'new' }],
      {},
      new Set(),
      new Set(),
    );
    expect(result).toEqual({
      'modelSpecs.list': [{ name: 'new' }],
    });
  });
});

describe('buildSavePayload — masked secrets never reach the backend', () => {
  const schemaPaths = new Set([
    'ocr.apiKey',
    'ocr.baseURL',
    'speech.tts.openai.apiKey',
    'speech.tts.openai.model',
  ]);
  const config = {
    ocr: { apiKeyPreview: 'sk-mist...4321', baseURL: 'https://ocr.example' },
  };
  const baseline = flattenObject(config);
  const noIntermediates = new Set<string>();
  const noContainers = new Set<string>();

  it('submitting without touching the masked secret excludes it from the payload', () => {
    const edited = applyConfigEdit(
      {},
      'ocr.baseURL',
      'https://new.example',
      baseline,
      noIntermediates,
      noContainers,
    );
    const { saves, resets } = buildSavePayload(new Set(['ocr.baseURL']), edited, schemaPaths);
    expect(saves).toEqual([{ fieldPath: 'ocr.baseURL', value: 'https://new.example' }]);
    expect(resets).toEqual([]);
    expect(saves.some((s) => s.fieldPath === 'ocr.apiKey')).toBe(false);
    expect(JSON.stringify(saves)).not.toContain('sk-mist...4321');
  });

  it('submitting with no touched paths produces an empty payload', () => {
    const { touched, saves, resets } = buildSavePayload(new Set(), {}, schemaPaths);
    expect(touched).toEqual([]);
    expect(saves).toEqual([]);
    expect(resets).toEqual([]);
  });

  it('a display companion leaf path never survives as a save entry', () => {
    const { saves } = buildSavePayload(
      new Set(['ocr.apiKeyPreview']),
      { 'ocr.apiKeyPreview': 'sk-mist...4321' },
      schemaPaths,
    );
    expect(saves).toEqual([]);
  });

  it('display companions nested in object values are stripped', () => {
    const edited = {
      'speech.tts.openai': { apiKeyPreview: 'sk-abc...1111', model: 'tts-1' },
    };
    const { saves } = buildSavePayload(new Set(['speech.tts.openai']), edited, schemaPaths);
    expect(saves).toEqual([{ fieldPath: 'speech.tts.openai', value: { model: 'tts-1' } }]);
  });

  it('a typed replacement is submitted as the new value', () => {
    const edited = applyConfigEdit(
      {},
      'ocr.apiKey',
      'brand-new-secret',
      baseline,
      noIntermediates,
      noContainers,
    );
    const { saves } = buildSavePayload(new Set(['ocr.apiKey']), edited, schemaPaths);
    expect(saves).toEqual([{ fieldPath: 'ocr.apiKey', value: 'brand-new-secret' }]);
  });

  it('cancelling a replacement drops the edit so nothing is submitted', () => {
    let edited = applyConfigEdit(
      {},
      'ocr.apiKey',
      'half-typed',
      baseline,
      noIntermediates,
      noContainers,
    );
    edited = applyConfigEdit(
      edited,
      'ocr.apiKey',
      undefined,
      baseline,
      noIntermediates,
      noContainers,
    );
    const { touched, saves, resets } = buildSavePayload(
      new Set(['ocr.apiKey']),
      edited,
      schemaPaths,
    );
    expect(touched).toEqual([]);
    expect(saves).toEqual([]);
    expect(resets).toEqual([]);
  });

  it('documents why abandoning a replacement must not go through onChange(path, undefined)', () => {
    // If a scope-resolved baseline ever reads back as '' for a redacted secret's
    // real path (not undefined/absent, as the base config baseline always is),
    // routing Cancel through the generic onChange/applyConfigEdit pipeline would
    // register a real pending reset instead of a no-op. This is exactly why
    // SecretField's Cancel calls a dedicated onDiscardField instead of
    // onChange(path, undefined) — see FieldRenderer.test.tsx's
    // "cancelling the replace flow discards the field directly" case.
    const emptyBaseline: t.FlatConfigMap = { 'ocr.apiKey': '' };
    const edited = applyConfigEdit(
      {},
      'ocr.apiKey',
      undefined,
      emptyBaseline,
      noIntermediates,
      noContainers,
    );
    const { resets } = buildSavePayload(new Set(['ocr.apiKey']), edited, schemaPaths);
    expect(resets).toEqual(['ocr.apiKey']);
  });

  it('resetting a masked secret produces a reset for the real path, not a save', () => {
    const edited: t.FlatConfigMap = { 'ocr.apiKey': undefined };
    const { saves, resets } = buildSavePayload(new Set(['ocr.apiKey']), edited, schemaPaths);
    expect(saves).toEqual([]);
    expect(resets).toEqual(['ocr.apiKey']);
  });
});

const headersField = createField({
  key: 'headers',
  path: 'endpoints.custom.[].headers',
  type: 'record',
});
const modelsField = createField({
  key: 'models',
  path: 'endpoints.custom.[].models',
  type: 'object',
  isObject: true,
  children: [
    createField({
      key: 'default',
      path: 'endpoints.custom.[].models.default',
      type: 'array<string>',
      isArray: true,
    }),
    createField({ key: 'fetch', path: 'endpoints.custom.[].models.fetch', type: 'boolean' }),
  ],
});
const schemaTree: t.SchemaField[] = [
  createField({
    key: 'actions',
    type: 'object',
    isObject: true,
    children: [
      createField({
        key: 'allowedDomains',
        path: 'actions.allowedDomains',
        type: 'array<string>',
        isArray: true,
      }),
    ],
  }),
  createField({
    key: 'endpoints',
    type: 'object',
    isObject: true,
    children: [
      createField({
        key: 'custom',
        path: 'endpoints.custom',
        type: 'array<object>',
        isArray: true,
        children: [
          createField({ key: 'name', path: 'endpoints.custom.[].name' }),
          createField({ key: 'baseURL', path: 'endpoints.custom.[].baseURL' }),
          headersField,
          modelsField,
        ],
      }),
      createField({
        key: 'azureOpenAI',
        path: 'endpoints.azureOpenAI',
        type: 'object',
        isObject: true,
        children: [
          createField({
            key: 'groups',
            path: 'endpoints.azureOpenAI.groups',
            type: 'array<object>',
            isArray: true,
          }),
        ],
      }),
    ],
  }),
  createField({
    key: 'mcpServers',
    type: 'record',
    recordValueType: 'complex',
    children: [
      createField({ key: 'title', path: 'mcpServers.{}.title' }),
      createField({ key: 'headers', path: 'mcpServers.{}.headers', type: 'record' }),
    ],
  }),
  createField({
    key: 'webSearch',
    type: 'union(boolean | object)',
    children: [createField({ key: 'provider', path: 'webSearch.provider' })],
  }),
];

describe('findSchemaField', () => {
  it('steps into array elements and record values', () => {
    expect(findSchemaField(schemaTree, 'endpoints.custom.3.headers')?.type).toBe('record');
    expect(findSchemaField(schemaTree, 'endpoints.custom.3.models.default')?.isArray).toBe(true);
    expect(findSchemaField(schemaTree, 'mcpServers.final-server.headers')?.type).toBe('record');
    expect(findSchemaField(schemaTree, 'endpoints.custom.3')?.children?.length).toBe(4);
  });

  it('returns null once the path leaves the schema', () => {
    expect(findSchemaField(schemaTree, 'endpoints.unknownProvider.models')).toBeNull();
  });
});

describe('normalizeForSave', () => {
  const allowedDomains = findSchemaField(schemaTree, 'actions.allowedDomains');
  const entry = findSchemaField(schemaTree, 'endpoints.custom.0');

  it('drops empty list items and keeps the rest verbatim', () => {
    expect(normalizeForSave(['example.com', '', ''], allowedDomains)).toEqual(['example.com']);
  });

  it('preserves whitespace-significant strings such as stop sequences', () => {
    const stop = findSchemaField(schemaTree, 'modelSpecs.list.0.preset.stop');
    expect(normalizeForSave(['\n\nHuman:', ' ###', '\n'], stop)).toEqual([
      '\n\nHuman:',
      ' ###',
      '\n',
    ]);
    expect(
      normalizeForSave(
        { stop: ['\n\n'] },
        findSchemaField(schemaTree, 'endpoints.custom.0.addParams'),
      ),
    ).toEqual({
      stop: ['\n\n'],
    });
  });

  it('turns a list with only blank items into no value', () => {
    expect(normalizeForSave([''], allowedDomains)).toBeUndefined();
    expect(normalizeForSave([], allowedDomains)).toBeUndefined();
  });

  it('turns an emptied key/value record into no value', () => {
    expect(normalizeForSave([], headersField)).toBeUndefined();
    expect(normalizeForSave({}, headersField)).toBeUndefined();
    expect(
      normalizeForSave([{ key: '', value: 'orphan', valueType: 'string' }], headersField),
    ).toBeUndefined();
  });

  it('serializes key/value pairs and keeps their values as entered', () => {
    expect(
      normalizeForSave(
        [
          { key: 'X-Empty', value: '', valueType: 'string' },
          { key: 'X-Id', value: '1', valueType: 'number' },
        ],
        headersField,
      ),
    ).toEqual({ 'X-Empty': '', 'X-Id': 1 });
  });

  it('removes emptied lists and records from inside an entry', () => {
    const value = {
      name: 'NVIDIA',
      baseURL: '',
      headers: [],
      models: { default: ['model-a', ''], fetch: true },
    };
    expect(normalizeForSave(value, entry)).toEqual({
      name: 'NVIDIA',
      models: { default: ['model-a'], fetch: true },
    });
  });

  it('keeps plain objects even when empty, and keeps scalars', () => {
    expect(normalizeForSave({}, findSchemaField(schemaTree, 'webSearch'))).toEqual({});
    expect(normalizeForSave(false, null)).toBe(false);
    expect(normalizeForSave(0, null)).toBe(0);
    expect(normalizeForSave(null, null)).toBeNull();
  });

  it('treats an empty string as no value but keeps whitespace-only strings', () => {
    expect(normalizeForSave('', null)).toBeUndefined();
    expect(normalizeForSave('\n', null)).toBe('\n');
    expect(normalizeForSave('value', null)).toBe('value');
  });
});

describe('buildSavePayload with a save context', () => {
  const schemaPaths = new Set<string>();
  function contextFor(
    config: Record<string, t.ConfigValue>,
    overrides: string[] = [],
  ): t.SaveContext {
    const overridePaths = new Set(overrides);
    return {
      fields: schemaTree,
      baselineAt: (path) => getValueAtPath(config, path),
      hasOverride: (path) => hasPathOverlap(path, overridePaths),
    };
  }

  it('writes nothing for a blank item added to an unset list', () => {
    const payload = buildSavePayload(
      new Set(['actions.allowedDomains']),
      { 'actions.allowedDomains': [''] },
      schemaPaths,
      contextFor({}),
    );
    expect(payload.saves).toEqual([]);
    expect(payload.resets).toEqual([]);
  });

  it('resets the override when its last item is removed', () => {
    const payload = buildSavePayload(
      new Set(['actions.allowedDomains']),
      { 'actions.allowedDomains': [] },
      schemaPaths,
      contextFor({ actions: { allowedDomains: ['a.com'] } }, ['actions.allowedDomains']),
    );
    expect(payload.saves).toEqual([]);
    expect(payload.resets).toEqual(['actions.allowedDomains']);
  });

  it('never writes an empty value over a librechat.yaml value it does not own, and says why', () => {
    const payload = buildSavePayload(
      new Set(['actions.allowedDomains']),
      { 'actions.allowedDomains': [] },
      schemaPaths,
      contextFor({ actions: { allowedDomains: ['yaml.com'] } }),
    );
    expect(payload.saves).toEqual([]);
    expect(payload.resets).toEqual([]);
    expect(payload.skipped).toEqual([{ fieldPath: 'actions.allowedDomains', reason: 'yamlValue' }]);
  });

  it('skips the dedicated Langfuse section on the generic config API', () => {
    const payload = buildSavePayload(
      new Set(['langfuse.baseUrl']),
      { 'langfuse.baseUrl': 'https://lf.example.com' },
      schemaPaths,
      contextFor({}),
    );
    expect(payload.saves).toEqual([]);
    expect(payload.skipped).toEqual([{ fieldPath: 'langfuse.baseUrl', reason: 'dedicated' }]);
  });

  it('resets a record whose last key/value pair was deleted', () => {
    const payload = buildSavePayload(
      new Set(['mcpServers.srv.headers']),
      { 'mcpServers.srv.headers': [] },
      schemaPaths,
      contextFor({ mcpServers: { srv: { headers: { 'X-Key': 'v' } } } }, [
        'mcpServers.srv.headers.X-Key',
      ]),
    );
    expect(payload.resets).toEqual(['mcpServers.srv.headers']);
  });

  it('drops an edit that only reorders keys of the saved value', () => {
    const payload = buildSavePayload(
      new Set(['endpoints.custom.0']),
      { 'endpoints.custom.0': { baseURL: 'https://x', name: 'A' } },
      schemaPaths,
      contextFor({ endpoints: { custom: [{ name: 'A', baseURL: 'https://x' }] } }),
    );
    expect(payload.saves).toEqual([]);
  });

  it('skips read-only sections and permission fields instead of sending them', () => {
    const payload = buildSavePayload(
      new Set(['filters.messages.pii.action', 'interface.prompts', 'cloudfront.urlExpiry']),
      {
        'filters.messages.pii.action': 'block',
        'interface.prompts': false,
        'cloudfront.urlExpiry': 3601,
      },
      schemaPaths,
      contextFor({}),
    );
    expect(payload.saves).toEqual([]);
    expect(payload.skipped).toEqual([
      { fieldPath: 'filters.messages.pii.action', reason: 'baseOnly' },
      { fieldPath: 'interface.prompts', reason: 'permission' },
      { fieldPath: 'cloudfront.urlExpiry', reason: 'yamlOnly' },
    ]);
  });

  it('never sends edits to YAML-managed fields but lets their stale override be removed', () => {
    const edit = buildSavePayload(
      new Set(['endpoints.azureOpenAI.groups.0']),
      { 'endpoints.azureOpenAI.groups.0': { group: 'eastus', version: 'x' } },
      schemaPaths,
      contextFor({}),
    );
    expect(edit.saves).toEqual([]);
    expect(edit.skipped).toEqual([
      { fieldPath: 'endpoints.azureOpenAI.groups.0', reason: 'yamlOnly' },
    ]);
    const reset = buildSavePayload(
      new Set(['endpoints.azureOpenAI.groups']),
      { 'endpoints.azureOpenAI.groups': undefined },
      schemaPaths,
      contextFor({}),
    );
    expect(reset.resets).toEqual(['endpoints.azureOpenAI.groups']);
  });
});

describe('resolveFieldValue — scope mode collection edits (HF-11)', () => {
  const noIntermediates = new Set<string>();
  const noContainers = new Set<string>();
  const resolved: t.FlatConfigMap = {
    'endpoints.custom': [
      {
        name: 'Eng Proxy',
        baseURL: 'https://proxy.example.com/v1',
        models: { default: ['gpt-4o'] },
      },
    ],
  };
  const tree = unflattenObject(resolved);

  function shownEntries(edited: t.FlatConfigMap): Array<Record<string, t.ConfigValue>> {
    const indexed = Object.entries(edited).filter(([k]) => /\.\d+$/.test(k));
    const merged = mergeIndexedArrayEdits(tree, indexed);
    const fallback = getValueAtPath(merged, 'endpoints.custom');
    return resolveFieldValue('endpoints.custom', fallback, edited, resolved, {}) as Array<
      Record<string, t.ConfigValue>
    >;
  }

  it('keeps both of two sequential edits to the same entry', () => {
    let edited: t.FlatConfigMap = {};
    const first = shownEntries(edited)[0];
    edited = applyConfigEdit(
      edited,
      'endpoints.custom.0',
      { ...first, modelDisplayLabel: 'VLabel' },
      resolved,
      noIntermediates,
      noContainers,
    );
    const second = shownEntries(edited)[0];
    expect(second.modelDisplayLabel).toBe('VLabel');
    edited = applyConfigEdit(
      edited,
      'endpoints.custom.0',
      { ...second, baseURL: 'https://proxy.example.com/v1/v' },
      resolved,
      noIntermediates,
      noContainers,
    );
    expect(edited['endpoints.custom.0']).toMatchObject({
      modelDisplayLabel: 'VLabel',
      baseURL: 'https://proxy.example.com/v1/v',
    });
  });

  it('shows a row added to a nested list of an entry', () => {
    const entry = shownEntries({})[0];
    const edited = applyConfigEdit(
      {},
      'endpoints.custom.0',
      { ...entry, models: { default: ['gpt-4o', ''] } },
      resolved,
      noIntermediates,
      noContainers,
    );
    expect(shownEntries(edited)[0].models).toEqual({ default: ['gpt-4o', ''] });
  });

  it('still reads the saved leaf when nothing under the path is pending', () => {
    expect(
      resolveFieldValue('balance.startBalance', 5, {}, { 'balance.startBalance': 7 }, {}),
    ).toBe(7);
  });
});

describe('isConfigValueEqual', () => {
  it('ignores object key order but not array order', () => {
    expect(isConfigValueEqual({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true);
    expect(isConfigValueEqual([1, 2], [2, 1])).toBe(false);
    expect(isConfigValueEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
  });
});

describe('collectImportEntries', () => {
  it('writes one entry per leaf of the pasted YAML, without the version key', () => {
    const { entries, skipped } = collectImportEntries(
      {
        version: '1.3.3',
        balance: { startBalance: 777 },
        interface: { webSearch: false },
        registration: { allowedDomains: ['a.com'] },
      },
      schemaTree,
      new Set(),
    );
    expect(entries).toEqual([
      { fieldPath: 'balance.startBalance', value: 777 },
      { fieldPath: 'interface.webSearch', value: false },
      { fieldPath: 'registration.allowedDomains', value: ['a.com'] },
    ]);
    expect(skipped).toEqual([]);
  });

  it('maps AppService aliases and drops empty objects', () => {
    expect(
      collectImportEntries(
        { interfaceConfig: { customWelcome: 'hi' }, speech: {} },
        schemaTree,
        new Set(),
      ).entries,
    ).toEqual([{ fieldPath: 'interface.customWelcome', value: 'hi' }]);
  });

  it('merges an alias section with its canonical one leaf by leaf, the canonical key winning', () => {
    const { entries } = collectImportEntries(
      {
        interfaceConfig: { customWelcome: 'alias', webSearch: false },
        interface: { customWelcome: 'canonical', fileSearch: true },
      },
      schemaTree,
      new Set(),
    );
    expect(entries).toEqual([
      { fieldPath: 'interface.customWelcome', value: 'canonical' },
      { fieldPath: 'interface.webSearch', value: false },
      { fieldPath: 'interface.fileSearch', value: true },
    ]);
  });

  it('normalizes values like an edit: blank items are dropped and emptied leaves are skipped', () => {
    const { entries, skipped } = collectImportEntries(
      {
        actions: { allowedDomains: [''] },
        registration: { allowedDomains: ['a.com', ''] },
        endpoints: { openAI: { titleModel: '' } },
        balance: { startBalance: null },
      },
      schemaTree,
      new Set(),
    );
    expect(entries).toEqual([{ fieldPath: 'registration.allowedDomains', value: ['a.com'] }]);
    expect(skipped).toEqual([
      { fieldPath: 'actions.allowedDomains', reason: 'empty' },
      { fieldPath: 'endpoints.openAI.titleModel', reason: 'empty' },
      { fieldPath: 'balance.startBalance', reason: 'empty' },
    ]);
  });
});

describe('getUnknownConfigEntries', () => {
  it('lists keys the schema does not describe, except secret preview companions', () => {
    const fields = [createField({ key: 'apiKey' }), createField({ key: 'title' })];
    expect(
      getUnknownConfigEntries(fields, {
        apiKey: 'x',
        apiKeyPreview: 'sk-...1',
        title: 't',
        replyNotifications: { sound: true },
      }),
    ).toEqual([['replyNotifications', { sound: true }]]);
  });
});
