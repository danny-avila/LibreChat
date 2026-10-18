import { z as zod } from 'zod';
import { configSchema } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import { extractSchemaTree, extractSchemaDefaults, flattenTree, getZodTypeName } from './schema';
import { resolveSubSchema } from '~/admin/utils';

interface Zod extends t.ZodSchemaLike {
  optional: () => Zod;
  nullable: () => Zod;
  default: (value: t.ConfigValue) => Zod;
  min: (value: number) => Zod;
  max: (value: number) => Zod;
  int: () => Zod;
  positive: () => Zod;
  url: () => Zod;
  regex: (pattern: RegExp) => Zod;
  length: (value: number) => Zod;
  refine: (check: (value: t.ConfigValue) => boolean) => Zod;
  safeParse: (value: t.ConfigValue) => { success: boolean };
}

interface ZodModule {
  object: (shape: Record<string, Zod>) => Zod;
  string: () => Zod;
  number: () => Zod;
  boolean: () => Zod;
  undefined: () => Zod;
  literal: (value: string) => Zod;
  enum: (values: [string, ...string[]]) => Zod;
  array: (element: Zod) => Zod;
  record: (key: Zod, value: Zod) => Zod;
  union: (options: Zod[]) => Zod;
  discriminatedUnion: (key: string, options: Zod[]) => Zod;
}

/** The zod 3 build librechat-data-provider's schemas are made with (one copy, hoisted). */
const z = zod as unknown as ZodModule;

const realTree = extractSchemaTree(configSchema);
const realFields = new Map(flattenTree(realTree).map((field) => [field.path, field]));

function field(tree: t.SchemaField[], path: string): t.SchemaField {
  const found = flattenTree(tree).find((f) => f.path === path);
  if (!found) throw new Error(`no field ${path}`);
  return found;
}

function realField(path: string): t.SchemaField {
  const found = realFields.get(path);
  if (!found) throw new Error(`no schema field ${path}`);
  return found;
}

describe('extractSchemaTree — variants', () => {
  const trigger = z.discriminatedUnion('type', [
    z.object({ type: z.literal('token_ratio'), value: z.number().min(0).max(1) }),
    z.object({ type: z.literal('remaining_tokens'), value: z.number().int().positive() }),
  ]);
  const agent = z.union([
    z.object({ enabled: z.boolean().optional(), id: z.string() }),
    z.object({ enabled: z.boolean().optional(), provider: z.string(), model: z.string() }),
  ]);
  const tree = extractSchemaTree(
    z.object({ trigger: trigger.optional(), agent: agent.optional() }),
  );

  it('turns a discriminated union into variants keyed by the discriminator value', () => {
    const triggerField = field(tree, 'trigger');
    expect(triggerField).toMatchObject({ type: 'object', isObject: true, discriminator: 'type' });
    expect(triggerField.variants?.map((v) => v.key)).toEqual(['token_ratio', 'remaining_tokens']);
    expect(triggerField.variants?.[1].fields.map((f) => f.key)).toEqual(['type', 'value']);
    expect(triggerField.variants?.[0].fields[1].constraints).toEqual({
      min: 0,
      max: 1,
      step: 0.01,
    });
  });

  it('keeps a merged child list: one select of every literal and limits all variants accept', () => {
    const merged = field(tree, 'trigger').children ?? [];
    expect(merged.map((f) => f.key)).toEqual(['type', 'value']);
    expect(merged[0].type).toBe('union(literal("token_ratio") | literal("remaining_tokens"))');
    expect(merged[1].constraints).toEqual({ min: 0 });
    expect(merged.every((f) => f.isOptional)).toBe(true);
  });

  it('names the variants of a plain union of objects by their first unique key', () => {
    const agentField = field(tree, 'agent');
    expect(agentField.discriminator).toBeUndefined();
    expect(agentField.variants?.map((v) => v.key)).toEqual(['id', 'provider']);
    expect(agentField.children?.map((f) => f.key)).toEqual(['enabled', 'id', 'provider', 'model']);
  });

  it('takes a key undefined in some variants from the variant that defines it', () => {
    const transports = z.record(
      z.string(),
      z.union([
        z.object({ command: z.string(), obo: z.undefined().optional() }),
        z.object({ url: z.string(), obo: z.object({ scopes: z.string() }).optional() }),
      ]),
    );
    const servers = extractSchemaTree(z.object({ servers: transports }));
    const obo = field(servers, 'servers.{}.obo');
    expect(obo).toMatchObject({ type: 'object', isObject: true, isOptional: true });
    expect(obo.children?.map((f) => f.key)).toEqual(['scopes']);
  });

  it('describes the real summarization trigger, memory agent and MCP obo', () => {
    expect(realField('summarization.trigger').variants?.map((v) => v.key)).toEqual([
      'token_ratio',
      'remaining_tokens',
      'messages_to_refine',
    ]);
    expect(realField('summarization.trigger.value').type).toBe('number');
    expect(realField('memory.agent').variants?.map((v) => v.key)).toEqual(['id', 'provider']);
    expect(realField('mcpServers.{}.obo').children?.map((f) => f.key)).toEqual(['scopes']);
  });
});

describe('extractSchemaTree — arrays, records and unions', () => {
  it('extracts children of refined array elements (skillSync sources)', () => {
    const element = z.object({ id: z.string(), ref: z.string().optional() }).refine(() => true);
    const tree = extractSchemaTree(z.object({ sources: z.array(element).default([]) }));
    expect(field(tree, 'sources')).toMatchObject({ type: 'array<object>', isArray: true });
    expect(field(tree, 'sources').children?.map((f) => f.key)).toEqual(['id', 'ref']);
    expect(realField('skillSync.github.sources').children?.map((f) => f.key)).toContain('owner');
  });

  it('types enum-valued records as string records', () => {
    const tree = extractSchemaTree(
      z.object({ overrides: z.record(z.string(), z.enum(['provider', 'text', 'none'])) }),
    );
    expect(field(tree, 'overrides').recordValueKVTypes).toEqual(['string']);
    expect(field(tree, 'overrides').itemType).toBe('enum(provider | text | none)');
    expect(realField('fileConfig.defaultLLMDeliveryPath.overrides').recordValueKVTypes).toEqual([
      'string',
    ]);
  });

  it('keeps the compact type of scalar unions for the client to parse', () => {
    expect(realField('modelSpecs.list.[].runInBackground').type).toBe(
      'union(boolean | array<string>)',
    );
    expect(realField('modelSpecs.list.[].preset.maxContextTokens').type).toBe(
      'union(number | string)',
    );
    expect(realField('endpoints.azureOpenAI.groups').type).toBe('array<object>');
  });

  it('names discriminated unions and undefined in type strings', () => {
    const union = z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('a') }),
      z.object({ kind: z.literal('b') }),
    ]);
    expect(getZodTypeName(union)).toBe('union(object | object)');
    expect(getZodTypeName(z.undefined())).toBe('undefined');
  });
});

describe('extractSchemaTree — constraints', () => {
  const tree = extractSchemaTree(
    z.object({
      ratio: z.number().min(0).max(1).optional(),
      count: z.number().int().positive(),
      weight: z.number().min(0).max(5),
      size: z.number().min(0),
      plain: z.number(),
      url: z.string().url(),
      code: z
        .string()
        .length(4)
        .regex(/^[A-Z]+$/),
    }),
  );

  it('extracts numeric bounds with an input step', () => {
    expect(field(tree, 'ratio').constraints).toEqual({ min: 0, max: 1, step: 0.01 });
    expect(field(tree, 'count').constraints).toEqual({
      int: true,
      min: 0,
      minExclusive: true,
      step: 1,
    });
    expect(field(tree, 'weight').constraints).toEqual({ min: 0, max: 5, step: 0.1 });
    expect(field(tree, 'size').constraints).toEqual({ min: 0 });
    expect(field(tree, 'plain').constraints).toBeUndefined();
  });

  it('extracts string formats and lengths', () => {
    expect(field(tree, 'url').constraints).toEqual({ url: true });
    expect(field(tree, 'code').constraints).toEqual({
      minLength: 4,
      maxLength: 4,
      regex: '^[A-Z]+$',
    });
  });

  it('reads limits from the real schema (image quality steps by 0.01)', () => {
    expect(realField('fileConfig.clientImageResize.quality').constraints).toEqual({
      min: 0,
      max: 1,
      step: 0.01,
    });
    expect(realField('endpoints.agents.maxCitations').constraints).toEqual({ min: 1, max: 50 });
  });
});

describe('extractSchemaTree — compact payload', () => {
  it('omits unset properties and false flags', () => {
    const tree = extractSchemaTree(z.object({ name: z.string().optional() }));
    expect(tree[0]).toEqual({
      path: 'name',
      key: 'name',
      type: 'string',
      isOptional: true,
      depth: 0,
    });
  });

  it('never sends undefined or false values for the real schema', () => {
    const offending = flattenTree(realTree).flatMap((f) =>
      Object.entries(f)
        .filter(([key, value]) => value === undefined || (value === false && key !== 'isOptional'))
        .map(([key]) => `${f.path}.${key}`),
    );
    expect(offending).toEqual([]);
  });
});

describe('extractSchemaDefaults', () => {
  it('collects leaf defaults under an object-level default; the object default wins', () => {
    const schema = z.object({
      section: z
        .object({
          mode: z.enum(['all', 'temporary']).default('temporary'),
          limit: z.number().default(10),
          nested: z.object({ depth: z.number().default(3) }).optional(),
        })
        .default({ limit: 20 }),
    });
    expect(extractSchemaDefaults(schema)).toEqual({
      section: { mode: 'temporary', limit: 20, nested: { depth: 3 } },
    });
  });

  it('keeps non-object defaults as they are', () => {
    const schema = z.object({ tags: z.array(z.string()).default(['a']), plain: z.string() });
    expect(extractSchemaDefaults(schema)).toEqual({ tags: ['a'] });
  });

  it('finds nested defaults in the real schema', () => {
    const defaults = extractSchemaDefaults(configSchema);
    const get = (path: string) =>
      path.split('.').reduce<t.ConfigValue>((node, key) => {
        if (node && typeof node === 'object' && !Array.isArray(node)) return node[key];
        return undefined;
      }, defaults);
    expect(get('interface.retentionMode')).toBe('temporary');
    expect(get('endpoints.agents.maxProviderErrorChars')).toBe(2000);
    expect(get('endpoints.agents.maxCitations')).toBe(30);
    expect(get('registration.openidDiscovery.startupAttempts')).toBe(1);
    expect(typeof get('mcpSettings.catalogRecovery.discoveryTimeoutMs')).toBe('number');
  });
});

describe('resolveSubSchema — discriminated unions', () => {
  it('resolves and validates leaves of a discriminated union', () => {
    const value = resolveSubSchema(configSchema, ['summarization', 'trigger', 'value']) as Zod;
    expect(value).not.toBeNull();
    expect(value.safeParse(0.5).success).toBe(true);
    expect(value.safeParse('0.5').success).toBe(false);
  });
});
