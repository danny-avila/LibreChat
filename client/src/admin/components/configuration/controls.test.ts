import { configSchema } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import {
  canRoundTrip,
  orderFields,
  getFieldShape,
  getControlType,
  fitsStringList,
  parseTypeShape,
  fallbackControl,
  getDefaultHint,
  getFieldOptions,
  formatFieldValue,
  coerceEnumValue,
  getNumberInputProps,
  isStringLikeItemType,
  getFieldConstraints,
} from './controls';
import { extractSchemaTree, flattenTree } from '~/admin/api/config/schema';
import { resolveSubSchema, serializeKVPairs } from '~/admin/utils';
import translation from '~/locales/en/translation.json';
import { createField } from '~/admin/test/fixtures';
import { toKVPair } from './fields/kv';

const messages: Record<string, string> = translation;
const localize: t.LocalizeFn = (key, options) =>
  (messages[key] ?? key).replace(/{{(\w+)}}/g, (_, name: string) => String(options?.[name] ?? ''));

const tree = extractSchemaTree(configSchema);
const fields = new Map(flattenTree(tree).map((field) => [field.path, field]));

function schemaField(path: string): t.SchemaField {
  const field = fields.get(path);
  if (!field) throw new Error(`no schema field ${path}`);
  return field;
}

function labels(path: string, value?: t.ConfigValue): string[] {
  return getFieldOptions(schemaField(path), localize, value).map((option) => option.label);
}

describe('parseTypeShape', () => {
  it('parses scalars, arrays, enums and literals', () => {
    expect(parseTypeShape('number')).toEqual({ kind: 'number' });
    expect(parseTypeShape('array<string>')).toEqual({ kind: 'array', item: { kind: 'string' } });
    expect(parseTypeShape('enum( | low | high)')).toEqual({
      kind: 'enum',
      values: ['', 'low', 'high'],
    });
    expect(parseTypeShape('enum(OFF=0 | STRICT=2)')).toEqual({
      kind: 'enum',
      values: [0, 2],
      names: ['OFF', 'STRICT'],
    });
    expect(parseTypeShape('literal("anthropic")')).toEqual({
      kind: 'literal',
      values: ['anthropic'],
    });
  });

  it('parses unions, dropping null members and collapsing single members', () => {
    expect(parseTypeShape('union(boolean | array<string>)')).toEqual({
      kind: 'union',
      options: [{ kind: 'boolean' }, { kind: 'array', item: { kind: 'string' } }],
    });
    expect(parseTypeShape('union(boolean | literal(null))')).toEqual({ kind: 'boolean' });
  });

  it('marks variant fields and objects structurally', () => {
    expect(getFieldShape(schemaField('summarization.trigger')).kind).toBe('variant');
    expect(getFieldShape(schemaField('balance')).kind).toBe('object');
  });
});

describe('getControlType — schema shapes (SCH-1)', () => {
  const cases: Array<[string, t.ControlKind]> = [
    ['modelSpecs.list.[].runInBackground', 'bool-or-list'],
    ['modelSpecs.list.[].describeIntent', 'bool-or-list'],
    ['modelSpecs.list.[].skills', 'bool-or-list'],
    ['modelSpecs.list.[].preset.maxContextTokens', 'number'],
    ['modelSpecs.list.[].preset.thinkingBudget', 'number'],
    ['endpoints.assistants.version', 'number'],
    ['modelSpecs.list.[].artifacts', 'scalar-union'],
    ['mcpServers.{}.serverInstructions', 'scalar-union'],
    ['webSearch.tavilySearchOptions.includeAnswer', 'select'],
    ['endpoints.custom.[].provider', 'literal'],
    ['endpoints.agents.managementApi.auth.oidc.tokenUse', 'literal'],
    ['summarization.trigger', 'variant'],
    ['memory.agent', 'variant'],
    ['interface.schedules', 'switch-object'],
    ['endpoints.custom.[].models.default', 'model-list'],
    ['endpoints.assistants.models.default', 'model-list'],
    ['endpoints.custom.[].customParams.paramDefinitions.[].default', 'scalar-union'],
    ['skillSync.github.sources', 'array-object'],
    ['fileConfig.defaultLLMDeliveryPath.overrides', 'record'],
    ['interface.mcpServers.trustCheckbox.label', 'text-record'],
    ['modelSpecs.list.[].preset.reasoning_effort', 'select'],
    ['modelSpecs.list.[].preset.additionalModelRequestFields', 'code'],
    ['modelSpecs.list.[].preset.endpoint', 'ref-select'],
    ['modelSpecs.list.[].group', 'ref-select'],
    ['endpoints.custom.[].titleEndpoint', 'ref-select'],
    ['endpoints.custom.[].titlePrompt', 'textarea'],
    ['summarization.prompt', 'textarea'],
    ['endpoints.custom.[].apiKey', 'secret'],
    ['webSearch.serperApiKey', 'secret'],
    ['mcpServers.{}.apiKey.key', 'secret'],
    ['endpoints.custom.[].name', 'text'],
    ['endpoints.agents.capabilities', 'multi-enum'],
    ['modelSpecs.addedEndpoints', 'array'],
  ];

  it.each(cases)('%s → %s', (path, control) => {
    expect(getControlType(schemaField(path))).toBe(control);
  });

  it('honours a FieldMeta control override', () => {
    const field = createField({ key: 'x', path: 'zz.notInRegistry', type: 'string' });
    expect(getControlType(field)).toBe('text');
  });
});

describe('getControlType — values the control cannot show', () => {
  it('keeps the chosen control when it round-trips the value', () => {
    const tokens = schemaField('modelSpecs.list.[].preset.maxContextTokens');
    expect(getControlType(tokens, 200000)).toBe('number');
    const background = schemaField('modelSpecs.list.[].runInBackground');
    expect(getControlType(background, true)).toBe('bool-or-list');
    expect(getControlType(background, ['execute_code'])).toBe('bool-or-list');
  });

  it('shows a coerced string in a text input instead of hiding it', () => {
    const tokens = schemaField('modelSpecs.list.[].preset.maxContextTokens');
    expect(getControlType(tokens, '100000')).toBe('text');
  });

  it('falls back to the YAML editor rather than an editor that would rewrite the value', () => {
    const models = schemaField('endpoints.custom.[].models.default');
    expect(getControlType(models, [{ id: 'kimi' }])).toBe('code');
    const headers = schemaField('endpoints.custom.[].headers');
    expect(getControlType(headers, true)).toBe('code');
    expect(getControlType(headers, { 'X-A': 'b' })).toBe('record');
  });

  it('accepts the key/value editor’s own pending rows', () => {
    const headers = schemaField('endpoints.custom.[].headers');
    expect(canRoundTrip('record', headers, [{ key: 'a', value: 'b' }])).toBe(true);
  });
});

describe('fallbackControl', () => {
  it('maps new kinds to the nearest generic control for the value', () => {
    const background = schemaField('modelSpecs.list.[].runInBackground');
    expect(fallbackControl('bool-or-list', background, true)).toBe('toggle');
    expect(fallbackControl('bool-or-list', background, ['a'])).toBe('array');
    const artifacts = schemaField('modelSpecs.list.[].artifacts');
    expect(fallbackControl('scalar-union', artifacts, undefined)).toBe('toggle');
    expect(fallbackControl('scalar-union', artifacts, 'default')).toBe('text');
    const provider = schemaField('endpoints.custom.[].provider');
    expect(fallbackControl('literal', provider)).toBe('select');
    expect(fallbackControl('variant', schemaField('memory.agent'))).toBe('object');
    const models = schemaField('endpoints.custom.[].models.default');
    expect(fallbackControl('model-list', models, ['a'])).toBe('array');
    expect(fallbackControl('model-list', models, [{ name: 'a' }])).toBe('code');
  });
});

describe('getFieldOptions / coerceEnumValue', () => {
  it('offers Off and On for a boolean member (Tavily)', () => {
    expect(labels('webSearch.tavilySearchOptions.includeAnswer')).toEqual([
      'Off',
      'On',
      'Basic',
      'Advanced',
    ]);
    const field = schemaField('webSearch.tavilySearchOptions.includeAnswer');
    expect(coerceEnumValue('true', field)).toBe(true);
    expect(coerceEnumValue('advanced', field)).toBe('advanced');
  });

  it('keeps the empty enum member as "Auto"', () => {
    const field = schemaField('modelSpecs.list.[].preset.reasoning_effort');
    const options = getFieldOptions(field, localize);
    expect(options[0]).toEqual({ label: 'Auto', value: '' });
    expect(coerceEnumValue('', field)).toBe('');
  });

  it('uses brand and format labels', () => {
    expect(labels('fileStrategy')).toEqual([
      'Local',
      'Firebase',
      'Amazon S3',
      'Azure Blob Storage',
      'Amazon CloudFront',
    ]);
    expect(labels('imageOutputType')).toEqual(['PNG', 'WebP', 'JPEG']);
    expect(labels('ocr.strategy')).toContain('Vertex AI Mistral OCR');
  });

  it('hides alias members unless they are the current value', () => {
    const path = 'webSearch.tavilySearchOptions.timeRange';
    expect(labels(path)).toEqual(['Day', 'Week', 'Month', 'Year']);
    expect(labels(path, 'd')).toEqual(['Day', 'Week', 'Month', 'Year', 'D']);
  });

  it('shows a current value that is not a member, typed back on change', () => {
    const stderr = schemaField('mcpServers.{}.stderr');
    expect(getFieldOptions(stderr, localize, 2).map((o) => o.value)).toContain('2');
    expect(coerceEnumValue('2', stderr)).toBe(2);
  });

  it('labels and types numeric native enums', () => {
    const field = schemaField('webSearch.safeSearch');
    expect(getFieldOptions(field, localize).map((o) => o.label)).toEqual([
      'Off',
      'Moderate',
      'Strict',
    ]);
    expect(coerceEnumValue('2', field)).toBe(2);
  });

  it('offers the value choices of an enum-valued record', () => {
    const field = schemaField('fileConfig.defaultLLMDeliveryPath.overrides');
    expect(getControlType(field)).toBe('record');
    expect(getFieldOptions(field, localize).map((o) => o.label)).toEqual([
      'Provider',
      'Text',
      'None',
    ]);
  });

  it('lists enum list members for multi-select lists', () => {
    const values = getFieldOptions(schemaField('endpoints.agents.capabilities')).map(
      (o) => o.value,
    );
    expect(values).toContain('execute_code');
  });
});

describe('constraints helpers', () => {
  it('passes min/max/step to number inputs', () => {
    expect(getNumberInputProps(schemaField('fileConfig.clientImageResize.quality'))).toEqual({
      min: 0,
      max: 1,
      step: 0.01,
    });
    expect(getNumberInputProps(schemaField('balance.startBalance'))).toEqual({});
  });

  it('marks keys required inside their parent object', () => {
    expect(getFieldConstraints(schemaField('skillSync.github.sources.[].owner')).required).toBe(
      true,
    );
    expect(getFieldConstraints(schemaField('balance.startBalance')).required).toBeUndefined();
  });

  it('uses the string list editor for model lists without object entries', () => {
    const models = schemaField('endpoints.custom.[].models.default');
    expect(fitsStringList(models, ['a', 'b'])).toBe(true);
    expect(fitsStringList(models, undefined)).toBe(true);
    expect(fitsStringList(models, ['a', { name: 'b' }])).toBe(false);
    expect(fitsStringList(schemaField('skillSync.github.sources'), [])).toBe(false);
  });

  it('does not treat object items as string-like list items', () => {
    expect(isStringLikeItemType('union(string | object)')).toBe(false);
    expect(isStringLikeItemType('union(string | enum(a | b))')).toBe(true);
  });
});

describe('formatFieldValue / getDefaultHint', () => {
  it('shows option labels, units and grouped numbers', () => {
    const retention = schemaField('interface.retentionMode');
    expect(getDefaultHint(retention, 'temporary', localize)).toBe('Temporary');
    expect(getDefaultHint(schemaField('balance.startBalance'), 20000, localize)).toBe(
      '20,000 credits',
    );
    expect(getDefaultHint(schemaField('balance.enabled'), false, localize)).toBe('Off');
    expect(formatFieldValue(schemaField('webSearch.safeSearch'), 1, localize)).toBe('Moderate');
    expect(formatFieldValue(schemaField('balance'), { enabled: true }, localize)).toBeNull();
  });

  it('falls back to LibreChat runtime defaults', () => {
    const ipMax = schemaField('rateLimits.fileUploads.ipMax');
    expect(getDefaultHint(ipMax, undefined, localize)).toBe('100');
    const window = schemaField('rateLimits.fileUploads.ipWindowInMinutes');
    expect(getDefaultHint(window, undefined, localize)).toBe('15 min');
  });
});

describe('orderFields (SCH-5)', () => {
  it('keeps schema order with rows before containers', () => {
    const ordered = orderFields(schemaField('fileConfig.clientImageResize').children ?? []);
    expect(ordered.map((f) => f.key)).toEqual(['enabled', 'maxWidth', 'maxHeight', 'quality']);
    const iface = orderFields(schemaField('interface').children ?? []).map((f) => f.key);
    expect(iface.indexOf('retentionMode')).toBeLessThan(iface.indexOf('privacyPolicy'));
  });

  it('applies meta order: Balance shows Start balance, then the auto-refill group', () => {
    const ordered = orderFields(schemaField('balance').children ?? [], 'balance');
    expect(ordered.map((f) => f.key)).toEqual([
      'enabled',
      'startBalance',
      'display',
      'autoRefillEnabled',
      'refillMode',
      'refillAmount',
      'refillIntervalValue',
      'refillIntervalUnit',
      'reservationTtlMs',
    ]);
  });
});

/**
 * Round-trip suite (SCH-1): every leaf of the real schema, with fixture values
 * from the audit seeds plus one sample per shape member, is shown by the
 * control `getControlType` picks (through `fallbackControl` for the generic
 * renderer) and emitted back unchanged.
 */
const SEEDS: Record<string, t.ConfigValue[]> = {
  'modelSpecs.list.[].runInBackground': [true, false, ['execute_code', 'web_search']],
  'modelSpecs.list.[].describeIntent': [true, ['tool_a']],
  'modelSpecs.list.[].skills': [true, ['skill-a', 'skill-b']],
  'modelSpecs.list.[].preset.maxContextTokens': [200000, '100000'],
  'modelSpecs.list.[].preset.max_tokens': [4096],
  'modelSpecs.list.[].preset.thinkingBudget': [4000],
  'modelSpecs.list.[].preset.fileTokenLimit': [100000],
  'modelSpecs.list.[].artifacts': [true, 'default'],
  'modelSpecs.list.[].preset.reasoning_effort': ['', 'high'],
  'modelSpecs.list.[].preset.thinkingLevel': ['', 'minimal'],
  'modelSpecs.list.[].preset.tools': [['web_search', 'execute_code']],
  'modelSpecs.list.[].preset.additionalModelRequestFields': [
    { thinking: { type: 'enabled', budget_tokens: 2000 } },
  ],
  'endpoints.assistants.version': [2, 'v2'],
  'endpoints.azureAssistants.version': [1],
  'mcpServers.{}.serverInstructions': [true, 'Use the tools.\nAsk first.'],
  'mcpServers.{}.stderr': ['pipe', 2],
  'webSearch.tavilySearchOptions.includeAnswer': [true, false, 'advanced'],
  'webSearch.tavilySearchOptions.includeRawContent': [false, 'markdown'],
  'webSearch.tavilySearchOptions.timeRange': ['week', 'd'],
  'webSearch.safeSearch': [0, 2],
  'endpoints.custom.[].provider': ['anthropic'],
  'endpoints.custom.[].models.default': [
    ['kimi-latest', { name: 'kimi-k2.5', description: 'Kimi K2.5 flagship' }],
    ['gpt-4o-mini'],
  ],
  'endpoints.assistants.models.default': [['gpt-4o', { name: 'o3' }]],
  'endpoints.custom.[].customParams.paramDefinitions.[].default': [true, 0.7, 'auto', ['a', 'b']],
  'summarization.trigger.type': ['remaining_tokens'],
  'summarization.trigger.value': [4000, 0.8],
  'interface.schedules': [true, false, { maxPerUser: 5 }],
  'speech.speechTab.speechToText': [true, { engineSTT: 'external' }],
  'interface.mcpServers.trustCheckbox.label': [
    'I trust this server',
    { en: 'I trust this server', de: 'Ich vertraue diesem Server' },
  ],
  'interface.termsOfService.modalContent': ['# Terms', ['Paragraph one', 'Paragraph two']],
  'fileConfig.defaultLLMDeliveryPath.overrides': [{ 'text/csv': 'text' }],
  'fileConfig.clientImageResize.quality': [0.85],
  'endpoints.anthropic.vertex.models': [['claude-sonnet'], { 'claude-sonnet': true }],
  'endpoints.custom.[].headers': [{ 'X-Org': 'acme' }],
  'endpoints.custom.[].addParams': [{ temperature: 0.2, stream: true, model: 'x' }],
  'memory.agent.id': ['agent_123'],
  'memory.agent.model_parameters': [{ temperature: 0.2 }],
};

type Codec = (field: t.SchemaField, value: t.ConfigValue) => t.ConfigValue | typeof LOST;

const LOST = Symbol('lost');

function isRecord(value: t.ConfigValue): value is t.ConfigRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** What the generic renderer shows for a value and emits back without edits. */
const CODECS: Record<t.ControlType, Codec> = {
  toggle: (_, v) => (typeof v === 'boolean' ? v : LOST),
  number: (_, v) => (typeof v === 'number' ? v : LOST),
  text: (_, v) => (typeof v === 'string' ? v : LOST),
  select: (field, v) => {
    const shown = String(v);
    const options = getFieldOptions(field, localize, v);
    return options.some((o) => o.value === shown) ? coerceEnumValue(shown, field) : LOST;
  },
  array: (_, v) => (Array.isArray(v) && v.every((i) => typeof i === 'string') ? [...v] : LOST),
  record: (_, v) =>
    isRecord(v) ? serializeKVPairs(Object.entries(v).map(([k, val]) => toKVPair(k, val))) : LOST,
  'switch-object': (_, v) => (typeof v === 'boolean' || isRecord(v) ? v : LOST),
  'text-record': (_, v) => (typeof v === 'string' || Array.isArray(v) || isRecord(v) ? v : LOST),
  'list-record': (_, v) => (Array.isArray(v) || isRecord(v) ? v : LOST),
  'array-object': (_, v) => (Array.isArray(v) ? v : LOST),
  'record-object': (_, v) => (isRecord(v) ? v : LOST),
  object: (_, v) => (isRecord(v) ? v : LOST),
  code: (_, v) => JSON.parse(JSON.stringify(v)) as t.ConfigValue,
};

function sampleFor(shape: t.FieldShape, field: t.SchemaField): t.ConfigValue[] {
  switch (shape.kind) {
    case 'boolean':
      return [true, false];
    case 'number': {
      const { min, minExclusive, max } = field.constraints ?? {};
      const base = min === undefined ? 1 : min + (minExclusive ? 1 : 0);
      return [max === undefined ? base : Math.min(base, max)];
    }
    case 'string':
      return ['sample value'];
    case 'enum':
    case 'literal':
      return (shape.values ?? []).slice(0, 2);
    case 'array':
      if (shape.item?.kind === 'enum') return [(shape.item.values ?? []).slice(0, 1)];
      return shape.item?.kind === 'string' ? [['first', 'second']] : [];
    case 'record':
      return field.recordValueType === 'complex' ? [] : [{ key: 'value' }];
    case 'union':
      return (shape.options ?? []).flatMap((option) => sampleFor(option, field).slice(0, 1));
    default:
      return [];
  }
}

function isRow(field: t.SchemaField): boolean {
  const control = getControlType(field);
  return !['object', 'variant', 'array-object', 'record-object'].includes(control);
}

describe('round-trip: every schema leaf shows and re-emits its value', () => {
  const leaves = [...fields.values()].filter(isRow);

  it('covers the whole schema', () => {
    expect(leaves.length).toBeGreaterThan(900);
  });

  it('every seed is valid for its field', () => {
    const invalid = Object.entries(SEEDS).flatMap(([path, values]) => {
      const sub = resolveSubSchema(configSchema, path.split('.'));
      const parse = (sub as { safeParse?: (v: t.ConfigValue) => { success: boolean } })?.safeParse;
      if (!sub || !parse) return [`${path}: unresolved`];
      return values
        .filter((value) => !parse.call(sub, value).success)
        .map((value) => `${path}: ${JSON.stringify(value)}`);
    });
    expect(invalid).toEqual([]);
  });

  it('no value is hidden or rewritten', () => {
    const failures: string[] = [];
    for (const field of leaves) {
      const values = [...(SEEDS[field.path] ?? []), ...sampleFor(getFieldShape(field), field)];
      for (const value of values) {
        const control = getControlType(field, value);
        const generic = fallbackControl(control, field, value);
        const emitted = CODECS[generic](field, value);
        const ok =
          canRoundTrip(control, field, value) &&
          emitted !== LOST &&
          JSON.stringify(emitted) === JSON.stringify(value);
        if (!ok) failures.push(`${field.path} ${JSON.stringify(value)} → ${control}/${generic}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('every seeded path exists in the schema', () => {
    expect(Object.keys(SEEDS).filter((path) => !fields.has(path))).toEqual([]);
  });
});
