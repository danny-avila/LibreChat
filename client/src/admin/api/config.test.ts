import { z as zod } from 'zod';
import * as dataProvider from 'librechat-data-provider';
import type * as t from '~/admin/types';
import {
  extractSchemaTree,
  getZodTypeName,
  flattenTree,
  parseIndexedArrayPath,
  normalizeAppServiceKeys,
  applyLangfuseSchemaVisibility,
  parseConfigYaml,
  findDroppedEntries,
  findUnknownConfigPaths,
} from './config';
import {
  coerceEnumValue,
  getControlType,
  getEnumOptions,
  getArrayItemType,
  splitUnionTypes,
} from '~/admin/components/configuration/controls';
import { resolveSubSchema, planConfigChanges, validateFieldValue } from '~/admin/utils';

interface ZodV3Schema extends t.ZodSchemaLike {
  object: (shape: Record<string, ZodV3Schema>) => ZodV3Schema;
  string: () => ZodV3Schema;
  number: () => ZodV3Schema;
  boolean: () => ZodV3Schema;
  null: () => ZodV3Schema;
  enum: (values: string[]) => ZodV3Schema;
  array: (element: ZodV3Schema) => ZodV3Schema;
  record: (key: ZodV3Schema, value: ZodV3Schema) => ZodV3Schema;
  union: (options: ZodV3Schema[]) => ZodV3Schema;
  intersection: (left: ZodV3Schema, right: ZodV3Schema) => ZodV3Schema;
  lazy: (getter: () => ZodV3Schema) => ZodV3Schema;
  pipe: (target: ZodV3Schema) => ZodV3Schema;
  transform: (fn: (val: unknown) => unknown) => ZodV3Schema;
  url: () => ZodV3Schema;
  refine: (fn: (val: unknown) => boolean, opts?: unknown) => ZodV3Schema;
  optional: () => ZodV3Schema;
  nullable: () => ZodV3Schema;
  default: (val: unknown) => ZodV3Schema;
  and: (other: ZodV3Schema) => ZodV3Schema;
}

interface ZodV3Module {
  object: (shape: Record<string, ZodV3Schema>) => ZodV3Schema;
  string: () => ZodV3Schema;
  number: () => ZodV3Schema;
  boolean: () => ZodV3Schema;
  null: () => ZodV3Schema;
  enum: (values: string[]) => ZodV3Schema;
  array: (element: ZodV3Schema) => ZodV3Schema;
  record: (key: ZodV3Schema, value: ZodV3Schema) => ZodV3Schema;
  union: (options: ZodV3Schema[]) => ZodV3Schema;
  intersection: (left: ZodV3Schema, right: ZodV3Schema) => ZodV3Schema;
  lazy: (getter: () => ZodV3Schema) => ZodV3Schema;
}

/**
 * extractSchemaTree was written against the Zod v3 internal API (_def.typeName).
 * librechat-data-provider bundles zod@3.x, so we resolve that same version here
 * to build test schemas that are structurally compatible.
 */
const z3 = zod as unknown as ZodV3Module;

function findField(fields: t.SchemaField[], key: string): t.SchemaField | undefined {
  for (const f of fields) {
    if (f.key === key) return f;
    if (f.children) {
      const found = findField(f.children, key);
      if (found) return found;
    }
  }
  return undefined;
}

describe('applyLangfuseSchemaVisibility', () => {
  it('removes a Langfuse section supplied by the schema when fanout is disabled', () => {
    const tree = extractSchemaTree(z3.object({ langfuse: z3.object({ enabled: z3.boolean() }) }));

    applyLangfuseSchemaVisibility(tree, false);

    expect(findField(tree, 'langfuse')).toBeUndefined();
  });

  it('preserves the schema-provided Langfuse section when fanout is enabled', () => {
    const tree = extractSchemaTree(
      z3.object({ langfuse: z3.object({ schemaOnlyField: z3.string() }) }),
    );

    applyLangfuseSchemaVisibility(tree, true);

    expect(findField(tree, 'schemaOnlyField')).toBeDefined();
    expect(tree.filter((field) => field.key === 'langfuse')).toHaveLength(1);
  });

  it('preserves a schema-provided Langfuse section when fanout state is unknown', () => {
    const tree = extractSchemaTree(
      z3.object({ langfuse: z3.object({ schemaOnlyField: z3.string() }) }),
    );

    applyLangfuseSchemaVisibility(tree, undefined);

    expect(findField(tree, 'schemaOnlyField')).toBeDefined();
  });

  it('keeps the Langfuse section shipped in the pinned configSchema', () => {
    const tree = extractSchemaTree(realConfigSchema);

    applyLangfuseSchemaVisibility(tree, true);

    expect(findField(tree, 'langfuse')?.isObject).toBe(true);
    expect(findField(tree, 'destination')?.path).toBe('langfuse.destination');
  });
});

describe('extractSchemaTree', () => {
  it('extracts basic scalar types', () => {
    const schema = z3.object({
      title: z3.string(),
      port: z3.number(),
      enabled: z3.boolean(),
    });

    const tree = extractSchemaTree(schema);

    expect(tree).toHaveLength(3);
    expect(findField(tree, 'title')).toMatchObject({ key: 'title', type: 'string', path: 'title' });
    expect(findField(tree, 'port')).toMatchObject({ key: 'port', type: 'number' });
    expect(findField(tree, 'enabled')).toMatchObject({ key: 'enabled', type: 'boolean' });
  });

  it('extracts enum types with values', () => {
    const schema = z3.object({
      theme: z3.enum(['dark', 'light', 'system']),
    });

    const tree = extractSchemaTree(schema);
    const field = findField(tree, 'theme')!;

    expect(field.type).toMatch(/^enum\(/);
    expect(field.type).toContain('dark');
    expect(field.type).toContain('light');
    expect(field.type).toContain('system');
  });

  it('unwraps optional and sets isOptional', () => {
    const schema = z3.object({
      nickname: z3.string().optional(),
    });

    const tree = extractSchemaTree(schema);
    const field = findField(tree, 'nickname')!;

    expect(field.type).toBe('string');
    expect(field.isOptional).toBe(true);
  });

  it('unwraps nullable and sets isNullable', () => {
    const schema = z3.object({
      bio: z3.string().nullable(),
    });

    const tree = extractSchemaTree(schema);
    const field = findField(tree, 'bio')!;

    expect(field.type).toBe('string');
    expect(field.isNullable).toBe(true);
  });

  it('unwraps default and sets isOptional', () => {
    const schema = z3.object({
      retries: z3.number().default(3),
    });

    const tree = extractSchemaTree(schema);
    const field = findField(tree, 'retries')!;

    expect(field.type).toBe('number');
    expect(field.isOptional).toBe(true);
  });

  it('extracts nested objects with children', () => {
    const schema = z3.object({
      interface: z3.object({
        title: z3.string(),
        privacyPolicy: z3.object({
          externalUrl: z3.string(),
        }),
      }),
    });

    const tree = extractSchemaTree(schema);
    const iface = findField(tree, 'interface')!;

    expect(iface.type).toBe('object');
    expect(iface.isObject).toBe(true);
    expect(iface.children).toBeDefined();
    expect(iface.children).toHaveLength(2);

    const title = findField(iface.children!, 'title')!;
    expect(title.path).toBe('interface.title');
    expect(title.type).toBe('string');

    const pp = findField(iface.children!, 'privacyPolicy')!;
    expect(pp.children).toHaveLength(1);
    expect(pp.children![0].path).toBe('interface.privacyPolicy.externalUrl');
  });

  it('extracts arrays with object element children', () => {
    const schema = z3.object({
      endpoints: z3.array(z3.object({ name: z3.string(), url: z3.string() })),
    });

    const tree = extractSchemaTree(schema);
    const field = findField(tree, 'endpoints')!;

    expect(field.type).toMatch(/^array/);
    expect(field.isArray).toBe(true);
    expect(field.children).toBeDefined();
    expect(field.children!.some((c) => c.key === 'name')).toBe(true);
    expect(field.children!.some((c) => c.key === 'url')).toBe(true);
  });

  it('extracts arrays of primitives without children', () => {
    const schema = z3.object({
      tags: z3.array(z3.string()),
    });

    const tree = extractSchemaTree(schema);
    const field = findField(tree, 'tags')!;

    expect(field.type).toBe('array<string>');
    expect(field.isArray).toBe(true);
    expect(field.children).toBeUndefined();
  });
});

describe('getZodTypeName', () => {
  it('returns string for ZodString', () => {
    expect(getZodTypeName(z3.string())).toBe('string');
  });

  it('returns number for ZodNumber', () => {
    expect(getZodTypeName(z3.number())).toBe('number');
  });

  it('returns boolean for ZodBoolean', () => {
    expect(getZodTypeName(z3.boolean())).toBe('boolean');
  });

  it('returns enum(...) for ZodEnum', () => {
    const result = getZodTypeName(z3.enum(['a', 'b']));
    expect(result).toMatch(/^enum\(a/);
    expect(result).toContain('b');
  });

  it('unwraps optional wrappers', () => {
    expect(getZodTypeName(z3.string().optional())).toBe('string');
  });

  it('returns unknown for null/undefined input', () => {
    expect(getZodTypeName(null as unknown as t.ZodSchemaLike)).toBe('unknown');
    expect(getZodTypeName(undefined as unknown as t.ZodSchemaLike)).toBe('unknown');
  });
});

describe('flattenTree', () => {
  it('flattens nested tree into a flat list', () => {
    const tree: t.SchemaField[] = [
      {
        path: 'a',
        key: 'a',
        type: 'object',
        isOptional: false,
        isNullable: false,
        isArray: false,
        isObject: true,
        depth: 0,
        children: [
          {
            path: 'a.b',
            key: 'b',
            type: 'string',
            isOptional: false,
            isNullable: false,
            isArray: false,
            isObject: false,
            depth: 1,
          },
          {
            path: 'a.c',
            key: 'c',
            type: 'number',
            isOptional: false,
            isNullable: false,
            isArray: false,
            isObject: false,
            depth: 1,
          },
        ],
      },
    ];

    const flat = flattenTree(tree);
    expect(flat).toHaveLength(3);
    expect(flat.map((f) => f.path)).toEqual(['a', 'a.b', 'a.c']);
  });
});

describe('schema evolution', () => {
  it('detects a newly added field', () => {
    const v1 = z3.object({ name: z3.string() });
    const v2 = z3.object({ name: z3.string(), email: z3.string() });

    const treeV1 = extractSchemaTree(v1);
    const treeV2 = extractSchemaTree(v2);

    expect(treeV1).toHaveLength(1);
    expect(treeV2).toHaveLength(2);
    expect(findField(treeV2, 'email')).toMatchObject({ key: 'email', type: 'string' });
  });

  it('detects a field type change (string to enum)', () => {
    const v1 = z3.object({ theme: z3.string() });
    const v2 = z3.object({ theme: z3.enum(['dark', 'light']) });

    const fieldV1 = findField(extractSchemaTree(v1), 'theme')!;
    const fieldV2 = findField(extractSchemaTree(v2), 'theme')!;

    expect(fieldV1.type).toBe('string');
    expect(fieldV2.type).toMatch(/^enum\(/);
  });

  it('detects a removed field', () => {
    const v1 = z3.object({ name: z3.string(), deprecated: z3.string() });
    const v2 = z3.object({ name: z3.string() });

    const treeV1 = extractSchemaTree(v1);
    const treeV2 = extractSchemaTree(v2);

    expect(findField(treeV1, 'deprecated')).toBeDefined();
    expect(findField(treeV2, 'deprecated')).toBeUndefined();
  });

  it('detects a new nested section', () => {
    const v2 = z3.object({
      existing: z3.object({ a: z3.string() }),
      newSection: z3.object({ b: z3.number(), c: z3.boolean() }),
    });

    const treeV2 = extractSchemaTree(v2);
    const newSec = findField(treeV2, 'newSection')!;

    expect(newSec.isObject).toBe(true);
    expect(newSec.children).toHaveLength(2);
    expect(findField(newSec.children!, 'b')!.type).toBe('number');
  });
});

describe('ZodIntersection decomposition', () => {
  it('merges left and right object shapes into flat children', () => {
    const left = z3.object({ group: z3.string(), apiKey: z3.string() });
    const right = z3.object({ streamRate: z3.number(), titleModel: z3.string() });
    const schema = z3.object({ azureOpenAI: z3.intersection(left, right) });
    const tree = extractSchemaTree(schema);
    const azure = findField(tree, 'azureOpenAI');
    expect(azure).toBeDefined();
    expect(azure!.type).toBe('object');
    expect(azure!.children).toBeDefined();
    const childKeys = azure!.children!.map((c) => c.key).sort();
    expect(childKeys).toEqual(['apiKey', 'group', 'streamRate', 'titleModel']);
  });

  it('resolves intersections inside array element schemas', () => {
    const groupBase = z3.object({ group: z3.string() });
    const groupConfig = z3.object({ apiKey: z3.string(), serverless: z3.boolean() });
    const schema = z3.object({ groups: z3.array(z3.intersection(groupBase, groupConfig)) });
    const tree = extractSchemaTree(schema);
    const groups = findField(tree, 'groups');
    expect(groups).toBeDefined();
    expect(groups!.isArray).toBe(true);
    expect(groups!.children).toBeDefined();
    const childKeys = groups!.children!.map((c) => c.key).sort();
    expect(childKeys).toEqual(['apiKey', 'group', 'serverless']);
  });
});

describe('ZodRecord with union value type', () => {
  it('extracts children and sets recordValueAllowsPrimitive for boolean|object union', () => {
    const modelConfig = z3.object({ deploymentName: z3.string(), version: z3.string().optional() });
    const schema = z3.object({
      models: z3.record(z3.string(), z3.union([z3.boolean(), modelConfig])),
    });
    const tree = extractSchemaTree(schema);
    const models = findField(tree, 'models');
    expect(models).toBeDefined();
    expect(models!.type).toBe('record');
    expect(models!.recordValueType).toBe('complex');
    expect(models!.recordValueAllowsPrimitive).toBe(true);
    expect(models!.children).toBeDefined();
    const childKeys = models!.children!.map((c) => c.key).sort();
    expect(childKeys).toEqual(['deploymentName', 'version']);
  });

  it('sets recordValueType primitive for simple string records', () => {
    const schema = z3.object({
      headers: z3.record(z3.string(), z3.string()),
    });
    const tree = extractSchemaTree(schema);
    const headers = findField(tree, 'headers');
    expect(headers).toBeDefined();
    expect(headers!.type).toBe('record');
    expect(headers!.recordValueType).toBe('primitive');
    expect(headers!.recordValueAllowsPrimitive).toBeUndefined();
  });
});

describe('ZodLazy handling', () => {
  it('resolves z.lazy() wrapping a simple string to string', () => {
    const lazyString = z3.lazy(() => z3.string());
    expect(getZodTypeName(lazyString)).toBe('string');
  });

  it('resolves a recursive DocumentType-style lazy schema without infinite recursion', () => {
    const DocumentType: ZodV3Schema = z3.lazy(() =>
      z3.union([
        z3.null(),
        z3.boolean(),
        z3.number(),
        z3.string(),
        z3.array(DocumentType),
        z3.record(z3.string(), DocumentType),
      ]),
    );
    const result = getZodTypeName(DocumentType);
    expect(result).toMatch(/^union\(/);
    expect(result).toContain('null');
    expect(result).toContain('boolean');
    expect(result).toContain('number');
    expect(result).toContain('string');
  });

  it('unwraps z.lazy() in extractSchemaTree fields', () => {
    const DocumentType: ZodV3Schema = z3.lazy(() =>
      z3.union([
        z3.null(),
        z3.boolean(),
        z3.number(),
        z3.string(),
        z3.array(DocumentType),
        z3.record(z3.string(), DocumentType),
      ]),
    );
    const schema = z3.object({
      additionalModelRequestFields: DocumentType.optional(),
    });
    const tree = extractSchemaTree(schema);
    const field = findField(tree, 'additionalModelRequestFields');
    expect(field).toBeDefined();
    expect(field!.type).toMatch(/^union\(/);
    expect(field!.type).not.toBe('ZodLazy');
    expect(field!.isOptional).toBe(true);
  });
});

describe('ZodPipeline handling', () => {
  it('unwraps z.string().transform().pipe(z.string().url()) to string', () => {
    const pipelined = z3
      .string()
      .transform((v: unknown) => v)
      .pipe(z3.string().url());
    expect(getZodTypeName(pipelined)).toBe('string');
  });

  it('unwraps pipeline inside extractSchemaTree fields', () => {
    const schema = z3.object({
      url: z3
        .string()
        .transform((v: unknown) => v)
        .pipe(z3.string().url())
        .optional(),
    });
    const tree = extractSchemaTree(schema);
    const field = findField(tree, 'url');
    expect(field).toBeDefined();
    expect(field!.type).toBe('string');
    expect(field!.isOptional).toBe(true);
  });

  it('unwraps effects-pipeline-effects chain to final type', () => {
    const chain = z3
      .string()
      .transform((v: unknown) => v)
      .pipe(z3.string().url())
      .refine((v: unknown) => !!v);
    expect(getZodTypeName(chain)).toBe('string');
  });
});

/* ---------------------------------------------------------------------------
 * Real configSchema integration tests
 * -----------------------------------------------------------------------*/

const ldpModule = dataProvider as unknown as { configSchema: ZodV3Schema };
const realConfigSchema = ldpModule.configSchema;
const realSchemaTree = extractSchemaTree(realConfigSchema);

describe('real configSchema integration', () => {
  const tree = realSchemaTree;

  it('extracts a non-empty schema tree', () => {
    expect(tree.length).toBeGreaterThan(0);
  });

  it('contains expected top-level keys', () => {
    const keys = tree.map((f) => f.key);
    for (const expected of [
      'endpoints',
      'mcpServers',
      'interface',
      'registration',
      'cache',
      'version',
    ]) {
      expect(keys).toContain(expected);
    }
  });

  it('resolves cache as boolean → toggle', () => {
    const field = findField(tree, 'cache');
    expect(field).toBeDefined();
    expect(field!.type).toBe('boolean');
    expect(getControlType(field!)).toBe('toggle');
  });

  it('resolves imageOutputType as enum → select', () => {
    const field = findField(tree, 'imageOutputType');
    expect(field).toBeDefined();
    expect(field!.type).toMatch(/^enum\(/);
    expect(getControlType(field!)).toBe('select');
  });

  it('resolves interface as nested object with children', () => {
    const field = findField(tree, 'interface');
    expect(field).toBeDefined();
    expect(field!.isObject).toBe(true);
    expect(field!.children).toBeDefined();
    expect(field!.children!.length).toBeGreaterThan(0);
  });

  it('resolves version as string → text', () => {
    const field = findField(tree, 'version');
    expect(field).toBeDefined();
    expect(field!.type).toBe('string');
    expect(getControlType(field!)).toBe('text');
  });

  it('flattenTree produces more items than top-level (nesting traversed)', () => {
    const flat = flattenTree(tree);
    expect(flat.length).toBeGreaterThan(tree.length);
  });

  it('resolves MCP server URL fields through ZodPipeline to string → text', () => {
    const mcpServers = findField(tree, 'mcpServers');
    expect(mcpServers).toBeDefined();
    if (!mcpServers?.children) return;
    const urlField = findField(mcpServers.children, 'url');
    if (urlField) {
      expect(urlField.type).toBe('string');
      expect(getControlType(urlField)).toBe('text');
    }
  });
});

/* ---------------------------------------------------------------------------
 * resolveSubSchema
 * -----------------------------------------------------------------------*/

describe('resolveSubSchema', () => {
  it('finds top-level fields', () => {
    const schema = z3.object({ name: z3.string(), port: z3.number() });
    const sub = resolveSubSchema(schema, ['name']);
    expect(sub).not.toBeNull();
    expect(sub!._def?.typeName).toBe('ZodString');
  });

  it('navigates nested objects', () => {
    const schema = z3.object({
      interface: z3.object({ title: z3.string() }),
    });
    const sub = resolveSubSchema(schema, ['interface', 'title']);
    expect(sub).not.toBeNull();
    expect(sub!._def?.typeName).toBe('ZodString');
  });

  it('navigates ZodRecord dynamic keys', () => {
    const schema = z3.object({
      headers: z3.record(z3.string(), z3.string()),
    });
    const sub = resolveSubSchema(schema, ['headers', 'anyKey']);
    expect(sub).not.toBeNull();
    expect(sub!._def?.typeName).toBe('ZodString');
  });

  it('navigates through optional wrappers', () => {
    const schema = z3.object({
      settings: z3.object({ debug: z3.boolean() }).optional(),
    });
    const sub = resolveSubSchema(schema, ['settings', 'debug']);
    expect(sub).not.toBeNull();
  });

  it('returns null for non-existent paths', () => {
    const schema = z3.object({ name: z3.string() });
    expect(resolveSubSchema(schema, ['nonexistent'])).toBeNull();
    expect(resolveSubSchema(schema, ['name', 'child'])).toBeNull();
  });

  it('resolves paths in real configSchema', () => {
    const version = resolveSubSchema(realConfigSchema, ['version']);
    expect(version).not.toBeNull();

    const cache = resolveSubSchema(realConfigSchema, ['cache']);
    expect(cache).not.toBeNull();

    const nonexistent = resolveSubSchema(realConfigSchema, ['doesNotExist']);
    expect(nonexistent).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * validateFieldValue
 * -----------------------------------------------------------------------*/

describe('validateFieldValue', () => {
  it('succeeds for valid string value', () => {
    expect(validateFieldValue('version', '1.2.0')).toEqual({ success: true });
  });

  it('fails for wrong type (number instead of string)', () => {
    const result = validateFieldValue('version', 123);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeTruthy();
    }
  });

  it('fails for wrong type (string instead of boolean)', () => {
    const result = validateFieldValue('cache', 'not-a-boolean');
    expect(result.success).toBe(false);
  });

  it('succeeds for valid boolean value', () => {
    expect(validateFieldValue('cache', true)).toEqual({ success: true });
  });

  it('gracefully succeeds for unknown paths', () => {
    expect(validateFieldValue('unknown.deep.path', 'anything')).toEqual({ success: true });
  });

  it('validates nested field paths', () => {
    const result = validateFieldValue('interface', { privacyPolicy: {} });
    expect(result).toBeDefined();
  });

  it('accepts streamable-http type for MCP server', () => {
    expect(validateFieldValue('mcpServers.foo.type', 'streamable-http')).toEqual({ success: true });
  });

  it('accepts http type for MCP server', () => {
    expect(validateFieldValue('mcpServers.foo.type', 'http')).toEqual({ success: true });
  });

  it('accepts stdio type for MCP server', () => {
    expect(validateFieldValue('mcpServers.foo.type', 'stdio')).toEqual({ success: true });
  });

  it('rejects unknown type for MCP server', () => {
    const result = validateFieldValue('mcpServers.foo.type', 'made-up-transport');
    expect(result.success).toBe(false);
  });

  it('returns the most-specific branch on union failure (anyOfSchema heuristic)', () => {
    const result = validateFieldValue('mcpServers.foo.type', 'made-up-transport');
    expect(result.success).toBe(false);
    if (!result.success) {
      const semicolonSplits = result.error.split(';');
      expect(semicolonSplits.length).toBeLessThanOrEqual(2);
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('accepts https URL for MCP server (matches sse/streamable-http branches)', () => {
    expect(validateFieldValue('mcpServers.foo.url', 'https://example.com/mcp')).toEqual({
      success: true,
    });
  });

  it('accepts ws URL for MCP server (matches websocket branch)', () => {
    expect(validateFieldValue('mcpServers.foo.url', 'wss://example.com/mcp')).toEqual({
      success: true,
    });
  });

  it('rejects non-URL value for MCP server', () => {
    const result = validateFieldValue('mcpServers.foo.url', 'not a url');
    expect(result.success).toBe(false);
  });

  it('returns a single-branch error on union URL failure, not a concatenated dump', () => {
    const result = validateFieldValue('mcpServers.foo.url', 'not a url');
    expect(result.success).toBe(false);
    if (!result.success) {
      const semicolonSplits = result.error.split(';');
      expect(semicolonSplits.length).toBeLessThanOrEqual(2);
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('validates a nested field reached through a union (header value must be string)', () => {
    expect(validateFieldValue('mcpServers.foo.headers.Authorization', 'Bearer xyz')).toEqual({
      success: true,
    });
    const bad = validateFieldValue('mcpServers.foo.headers.Authorization', 42);
    expect(bad.success).toBe(false);
  });
});

/* ---------------------------------------------------------------------------
 * Regression — resolveSubSchema must keep walking through synthetic unions.
 * The anyOfSchema wrapper used to drop _def.options, so the second segment
 * after a multi-candidate union could not be resolved and validateFieldValue
 * silently passed everything under unioned objects.
 * -----------------------------------------------------------------------*/

describe('resolveSubSchema — traversal through synthesized union', () => {
  it('walks into a nested field after a union with multiple candidates', () => {
    const schema = z3.object({
      payload: z3.union([
        z3.object({ headers: z3.record(z3.string(), z3.string()) }),
        z3.object({ headers: z3.record(z3.string(), z3.string()) }),
      ]),
    });
    const sub = resolveSubSchema(schema, ['payload', 'headers', 'Authorization']);
    expect(sub).not.toBeNull();
    const safeParse = (sub as { safeParse?: (v: unknown) => { success: boolean } }).safeParse;
    expect(typeof safeParse).toBe('function');
    expect(safeParse!('Bearer xyz').success).toBe(true);
    expect(safeParse!(42).success).toBe(false);
  });
});

/* ---------------------------------------------------------------------------
 * Control → value → safeParse round-trip tests
 *
 * For every leaf field in the real configSchema, we:
 * 1. Determine what UI control would render (getControlType)
 * 2. Produce a representative value that control would emit
 * 3. safeParse it against the real sub-schema
 * 4. Assert it passes — if it doesn't, the UI is generating values
 *    that LibreChat would reject at startup
 * -----------------------------------------------------------------------*/

/** Per-path sample overrides for fields whose schema applies stricter
 *  validation than the generic control sample (URLs, host:port, etc.). */
const SAMPLE_OVERRIDES: Record<string, unknown> = {
  'cloudfront.domain': 'https://example.com',
  'cloudfront.cookieDomain': '.example.com',
  'mcpSettings.allowedAddresses': ['localhost:11434'],
  'actions.allowedAddresses': ['localhost:11434'],
  'endpoints.allowedAddresses': ['localhost:11434'],
  'ocr.allowedAddresses': ['localhost:11434'],
  'webSearch.allowedAddresses': ['localhost:11434'],
  'speech.tts.allowedAddresses': ['localhost:11434'],
  'speech.stt.allowedAddresses': ['localhost:11434'],
  'endpoints.agents.remoteApi.auth.oidc.issuer': 'https://example.com',
  'endpoints.agents.remoteApi.auth.oidc.jwksUri': 'https://example.com/.well-known/jwks.json',
  'endpoints.agents.managementApi.auth.oidc.issuer': 'https://example.com',
  'endpoints.agents.managementApi.auth.oidc.jwksUri': 'https://example.com/.well-known/jwks.json',
  'endpoints.agents.managementApi.auth.oidc.tokenUse': 'access',
  'endpoints.agents.eventDriven.selfUrl': 'https://example.com',
  'endpoints.agents.repositoryInstructions.timeoutMs': 1000,
  'endpoints.agents.maxToolCallArgBytesByTool': { sample_tool: 1024 },
  'fileConfig.defaultLLMDeliveryPath.overrides': { 'application/pdf': 'text' },
  'interface.traceViewer.requestTimeoutMs': 1000,
  'registration.oauthStateTtlMs': 60000,
  'registration.openidDiscovery.retryDelayMs': 100,
  'balance.reservationTtlMs': 10000,
  'summarization.trigger': { type: 'token_ratio', value: 0.5 },
  'skillSync.github.intervalMinutes': 5,
  /* SassyChat's own fields with a shape the generic sample does not meet. */
  'mcpAppSandbox.url': 'https://sandbox.example.com',
  'endpoints.agents.streamKeepaliveIntervalMs': 1000,
  'endpoints.agents.pullRequests.token': '${GITHUB_PULL_REQUEST_TOKEN}',
  'endpoints.agents.pullRequests.oauth.clientId': '${GITHUB_CLIENT_ID}',
  'endpoints.agents.pullRequests.oauth.clientSecret': '${GITHUB_CLIENT_SECRET}',
  'endpoints.agents.pullRequests.allowedRepositories': ['owner/name'],
  'skillSync.github.sources': [
    { id: 'sample', owner: 'foo', repo: 'bar', paths: ['skills/'], credentialKey: 'sample-key' },
  ],
};

/** Generates a representative value that a given UI control would produce. */
function sampleValueForControl(field: t.SchemaField, path?: string): unknown {
  if (path && path in SAMPLE_OVERRIDES) return SAMPLE_OVERRIDES[path];
  const control = getControlType(field);
  switch (control) {
    case 'toggle':
      return true;
    case 'number': {
      /* The smallest value the field accepts, as its control's lower bound would give. */
      const { min, minExclusive } = field.constraints ?? {};
      if (min === undefined) return 1;
      return minExclusive ? min + 1 : Math.max(min, 1);
    }
    case 'text':
    case 'textarea':
    case 'secret':
    case 'ref-select':
      return 'sample';
    case 'select': {
      const opts = getEnumOptions(field.type);
      return opts.length > 0 ? coerceEnumValue(opts[0].value) : 'default';
    }
    case 'literal':
      return coerceEnumValue(getEnumOptions(field.type)[0]?.value ?? 'default');
    case 'bool-or-list':
    case 'scalar-union':
      return true;
    case 'model-list':
      return ['item', { name: 'item-2' }];
    case 'array':
    case 'multi-enum': {
      const itemType = getArrayItemType(field.type);
      if (itemType.startsWith('enum(')) {
        const enumOpts = getEnumOptions(itemType);
        return enumOpts.length > 0 ? [enumOpts[0].value] : ['item'];
      }
      if (itemType === 'number') return [1];
      return ['item'];
    }
    case 'code': {
      if (field.type.startsWith('union(')) {
        const types = splitUnionTypes(field.type);
        if (types.includes('string')) return 'sample';
        if (types.includes('boolean')) return true;
        if (types.includes('number')) return 1;
        if (types.some((u) => u === 'object' || u === 'record')) return {};
        if (types.some((u) => u.startsWith('array'))) return [];
      }
      return 'sample';
    }
    case 'switch-object':
      return false;
    case 'text-record':
      return 'sample';
    case 'list-record':
      return ['item'];
    case 'record':
      return { key1: 'value1' };
    default:
      throw new Error(
        `sampleValueForControl: no sample defined for control type "${control}". ` +
          `Add a case to keep round-trip coverage complete.`,
      );
  }
}

/** Collects all leaf fields (no children, or array/record leaves) with their
 *  full dot-paths from the schema tree. */
function collectLeaves(
  fields: t.SchemaField[],
  prefix: string,
): Array<{ path: string; field: t.SchemaField }> {
  const result: Array<{ path: string; field: t.SchemaField }> = [];
  for (const f of fields) {
    const fullPath = prefix ? `${prefix}.${f.key}` : f.key;
    const control = getControlType(f);
    if (
      f.children &&
      f.children.length > 0 &&
      control !== 'array-object' &&
      control !== 'record-object' &&
      control !== 'record' &&
      control !== 'array' &&
      control !== 'switch-object' &&
      control !== 'text-record' &&
      control !== 'list-record' &&
      control !== 'code'
    ) {
      result.push(...collectLeaves(f.children, fullPath));
    } else {
      result.push({ path: fullPath, field: f });
    }
  }
  return result;
}

describe('control → value → safeParse round-trip (real configSchema)', () => {
  const leaves = collectLeaves(realSchemaTree, '');

  const skippedControls = new Set(['object', 'array-object', 'record-object']);

  const skippedPaths = new Set(['endpoints']);

  const testedLeaves = leaves.filter(
    ({ path, field }) => !skippedControls.has(getControlType(field)) && !skippedPaths.has(path),
  );

  it(`covers at least 10 leaf fields`, () => {
    expect(testedLeaves.length).toBeGreaterThanOrEqual(10);
  });

  for (const { path, field } of testedLeaves) {
    const control = getControlType(field);

    it(`${path} (${field.type} → ${control}): sample value passes safeParse`, () => {
      const value = sampleValueForControl(field, path);

      const sub = resolveSubSchema(realConfigSchema, path.split('.'));
      if (!sub) return;
      if (!('safeParse' in sub) || typeof sub.safeParse !== 'function') return;

      const result = (
        sub as {
          safeParse: (v: unknown) => {
            success: boolean;
            error?: { issues: Array<{ message: string; path: (string | number)[] }> };
          };
        }
      ).safeParse(value);

      /* On failure the diff names the field, the value its control produced and why it failed. */
      const issue = result.success ? undefined : (result.error?.issues?.[0]?.message ?? 'unknown');
      expect({ path, control, value, issue }).toEqual({ path, control, value, issue: undefined });
    });
  }
});

describe('ZodNativeEnum numeric coercion', () => {
  it('getEnumOptions produces numeric values for numeric native enums', () => {
    const opts = getEnumOptions('enum(OFF=0 | MODERATE=1 | STRICT=2)');
    expect(opts).toEqual([
      { label: 'Off', value: '0' },
      { label: 'Moderate', value: '1' },
      { label: 'Strict', value: '2' },
    ]);
  });

  it('coerceEnumValue converts numeric strings to numbers', () => {
    expect(coerceEnumValue('0')).toBe(0);
    expect(coerceEnumValue('2')).toBe(2);
    expect(coerceEnumValue('hello')).toBe('hello');
  });

  it('select value for safeSearch passes safeParse after coercion', () => {
    const sub = resolveSubSchema(realConfigSchema, ['webSearch', 'safeSearch']);
    expect(sub).not.toBeNull();
    const opts = getEnumOptions('enum(OFF=0 | MODERATE=1 | STRICT=2)');
    const coerced = coerceEnumValue(opts[0].value);
    const result = (sub as { safeParse: (v: unknown) => { success: boolean } }).safeParse(coerced);
    expect(result.success).toBe(true);
  });
});

/* ---------------------------------------------------------------------------
 * YAML-editor fallback audit
 *
 * Every field that renders as "Edit as YAML" (the `code` control) is a gap —
 * users deserve a purpose-built control. This test catalogues every such field
 * in the real configSchema and fails if new ones appear, forcing an explicit
 * decision about how to handle them.
 *
 * Each entry is annotated with an action:
 *   admin-panel  — fixable by adding a new/composite control in this project
 *   data-provider — needs a schema change in librechat-data-provider
 * -----------------------------------------------------------------------*/

/** Recursively finds ALL fields at any depth that resolve to code control. */
function collectAllCodeFields(
  fields: t.SchemaField[],
  prefix: string,
): Array<{ path: string; field: t.SchemaField }> {
  const result: Array<{ path: string; field: t.SchemaField }> = [];
  for (const f of fields) {
    const fullPath = prefix ? `${prefix}.${f.key}` : f.key;
    const control = getControlType(f);
    if (control === 'code') {
      result.push({ path: fullPath, field: f });
    }
    if (f.children) {
      result.push(...collectAllCodeFields(f.children, fullPath));
    }
  }
  return result;
}

describe('YAML-editor fallback audit', () => {
  const codeFields = collectAllCodeFields(realSchemaTree, '');

  /** No field should fall back to the YAML editor. Every field must have a
   *  purpose-built control. This record must stay empty. */
  const expectedCodeFields: Record<string, string> = {
    'modelSpecs.list.preset.additionalModelRequestFields':
      'admin-panel — arbitrary JSON (record/array/scalars); YAML is the faithful editor',
    'interface.theme':
      'SassyChat — a theme name or a whole theme object; YAML is the faithful editor',
  };

  it('every code-fallback field is accounted for in the audit', () => {
    const unaccounted = codeFields
      .filter(({ path }) => !(path in expectedCodeFields))
      .map(({ path, field }) => `${path} (${field.type})`);

    /* A field listed here falls back to the YAML editor: add it to expectedCodeFields with a fix owner. */
    expect(unaccounted).toEqual([]);
  });

  it('no unexpected fields are listed in the audit', () => {
    const codePaths = new Set(codeFields.map(({ path }) => path));
    const stale = Object.keys(expectedCodeFields).filter((p) => !codePaths.has(p));

    /* A field listed here no longer falls back to code: remove it from expectedCodeFields. */
    expect(stale).toEqual([]);
  });

  it(`has exactly ${Object.keys(expectedCodeFields).length} code-fallback fields (update if schema changes)`, () => {
    expect(codeFields.length).toBe(Object.keys(expectedCodeFields).length);
  });
});

/* ---------------------------------------------------------------------------
 * Custom endpoint validation and schema extraction
 * -----------------------------------------------------------------------*/

const ldpEndpoint = (dataProvider as unknown as { endpointSchema: ZodV3Schema }).endpointSchema;

describe('custom endpoint schema', () => {
  const endpointTree = extractSchemaTree(ldpEndpoint);

  describe('addParams field detection', () => {
    const addParams = findField(endpointTree, 'addParams');

    it('detects addParams as a record type', () => {
      expect(addParams).toBeDefined();
      expect(addParams!.type).toBe('record');
    });

    it('marks addParams as primitive recordValueType', () => {
      expect(addParams!.recordValueType).toBe('primitive');
    });

    it('includes json in recordValueKVTypes for addParams', () => {
      expect(addParams!.recordValueKVTypes).toBeDefined();
      expect(addParams!.recordValueKVTypes).toContain('json');
      expect(addParams!.recordValueKVTypes).toContain('string');
      expect(addParams!.recordValueKVTypes).toContain('number');
      expect(addParams!.recordValueKVTypes).toContain('boolean');
    });
  });

  describe('headers field detection', () => {
    const headers = findField(endpointTree, 'headers');

    it('detects headers as a record type', () => {
      expect(headers).toBeDefined();
      expect(headers!.type).toBe('record');
    });

    it('marks headers as primitive recordValueType', () => {
      expect(headers!.recordValueType).toBe('primitive');
    });

    it('restricts headers to string-only KV types', () => {
      expect(headers!.recordValueKVTypes).toEqual(['string']);
    });
  });

  describe('dropParams field detection', () => {
    const dropParams = findField(endpointTree, 'dropParams');

    it('detects dropParams as an array type', () => {
      expect(dropParams).toBeDefined();
      expect(dropParams!.type).toMatch(/^array/);
    });
  });
});

describe('resolveSubSchema for endpoints', () => {
  it('resolves endpoints.custom to an array schema', () => {
    const sub = resolveSubSchema(realConfigSchema, ['endpoints', 'custom']);
    expect(sub).not.toBeNull();
  });

  it('resolves endpoints.custom array element via numeric index', () => {
    const sub = resolveSubSchema(realConfigSchema, ['endpoints', 'custom', '0']);
    expect(sub).not.toBeNull();
  });

  it('resolves named provider paths', () => {
    for (const provider of ['openAI', 'anthropic', 'google', 'azureOpenAI']) {
      const sub = resolveSubSchema(realConfigSchema, ['endpoints', provider]);
      expect(sub).not.toBeNull();
    }
  });
});

describe('parseIndexedArrayPath', () => {
  it('accepts numeric suffixes when the parent path is an array', () => {
    expect(parseIndexedArrayPath('endpoints.custom.0')).toEqual({
      arrayPath: 'endpoints.custom',
      index: 0,
    });
  });

  it('rejects numeric suffixes when the parent path is a record', () => {
    expect(parseIndexedArrayPath('mcpServers.foo.headers.2024')).toBeNull();
  });
});

describe('normalizeAppServiceKeys', () => {
  it('maps MCP AppService output to canonical mcpServers records', () => {
    const normalized = normalizeAppServiceKeys({
      mcpConfig: {
        filesystem: {
          type: 'stdio',
          args: ['server.js', '--root', '/tmp'],
        },
      },
    });
    expect(normalized).not.toHaveProperty('mcpConfig');
    expect(normalized.mcpServers).toEqual({
      filesystem: {
        type: 'stdio',
        args: ['server.js', '--root', '/tmp'],
      },
    });
  });

  it('maps Azure groupMap output to canonical groups arrays', () => {
    const normalized = normalizeAppServiceKeys({
      endpoints: {
        azureOpenAI: {
          isValid: true,
          groupMap: {
            default: { apiKey: 'key-a', instanceName: 'instance-a' },
            fallback: { apiKey: 'key-b', instanceName: 'instance-b' },
          },
          errors: ['ignored'],
          modelNames: ['ignored'],
        },
      },
    });
    expect(normalized.endpoints).toEqual({
      azureOpenAI: {
        groups: [
          { group: 'default', apiKey: 'key-a', instanceName: 'instance-a' },
          { group: 'fallback', apiKey: 'key-b', instanceName: 'instance-b' },
        ],
      },
    });
  });
});

describe('validateFieldValue for endpoints', () => {
  const validEndpoint = {
    name: 'TestEndpoint',
    apiKey: '${TEST_KEY}',
    baseURL: 'https://api.test.com/v1',
    models: { default: ['model-1'], fetch: true },
    titleConvo: true,
    titleModel: 'current_model',
  };

  it('validates a single custom endpoint entry (object)', () => {
    const result = validateFieldValue('endpoints.custom.0', validEndpoint);
    expect(result).toEqual({ success: true });
  });

  it('validates a custom endpoint with addParams as object', () => {
    const result = validateFieldValue('endpoints.custom.0', {
      ...validEndpoint,
      addParams: { stream: true, temperature: 0.7 },
    });
    expect(result).toEqual({ success: true });
  });

  it('validates a custom endpoint with nested addParams', () => {
    const result = validateFieldValue('endpoints.custom.0', {
      ...validEndpoint,
      addParams: { config: { nested: { deep: true } } },
    });
    expect(result).toEqual({ success: true });
  });

  it('validates a custom endpoint with headers', () => {
    const result = validateFieldValue('endpoints.custom.0', {
      ...validEndpoint,
      headers: { 'x-api-key': '${API_KEY}', 'x-custom': 'value' },
    });
    expect(result).toEqual({ success: true });
  });

  it('validates a custom endpoint with dropParams', () => {
    const result = validateFieldValue('endpoints.custom.0', {
      ...validEndpoint,
      dropParams: ['stop', 'frequency_penalty'],
    });
    expect(result).toEqual({ success: true });
  });

  it('includes the full path for nested array validation errors', () => {
    const result = validateFieldValue('endpoints.custom', [
      validEndpoint,
      { ...validEndpoint, models: { fetch: true } },
    ]);

    expect(result).toEqual({
      success: false,
      error: 'endpoints.custom[1].models.default: Required',
    });
  });

  it('gracefully handles unknown deep paths', () => {
    const result = validateFieldValue('endpoints.custom.0.nonexistent.deep', 'value');
    expect(result).toEqual({ success: true });
  });
});

describe('parseConfigYaml (import)', () => {
  it('returns the raw YAML without injected schema defaults (3 keys in, 3 leaves out)', () => {
    const result = parseConfigYaml(
      'balance:\n  startBalance: 777\ninterface:\n  customWelcome: hi\nregistration:\n  allowedDomains:\n    - a.com\n',
    );
    expect(result.success).toBe(true);
    expect(result.appConfig).toEqual({
      balance: { startBalance: 777 },
      interface: { customWelcome: 'hi' },
      registration: { allowedDomains: ['a.com'] },
    });
  });

  it('does not require a version key', () => {
    expect(parseConfigYaml('balance:\n  enabled: true\n').success).toBe(true);
  });

  it('accepts a numeric version, which import ignores', () => {
    const result = parseConfigYaml('version: 1.2\nbalance:\n  enabled: true\n');
    expect(result.success).toBe(true);
    expect(result.appConfig).toEqual({ version: 1.2, balance: { enabled: true } });
  });

  it('keeps keys the bundled schema does not know and reports them', () => {
    const result = parseConfigYaml(
      'version: 1.3.3\ninterface:\n  replyNotifications:\n    chime: false\n',
    );
    expect(result.success).toBe(true);
    expect(result.appConfig).toEqual({
      version: '1.3.3',
      interface: { replyNotifications: { chime: false } },
    });
    expect(result.unknownPaths).toEqual(['interface.replyNotifications.chime']);
  });

  it('keeps keys the admin API would drop; the import plan leaves out only the leaves carrying them', () => {
    const result = parseConfigYaml(
      'endpoints:\n  bedrock:\n    inferenceProfiles:\n      us.anthropic.claude: arn:aws:x\n',
    );
    expect(result.success).toBe(true);
    expect(result.appConfig).toEqual({
      endpoints: { bedrock: { inferenceProfiles: { 'us.anthropic.claude': 'arn:aws:x' } } },
    });
    expect(result.unknownPaths).toEqual([]);
  });

  it('reports the line and column of a YAML syntax error', () => {
    const result = parseConfigYaml('balance:\n  startBalance: [1\n');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/line \d+, column \d+/);
    expect(result.mark).toEqual({ line: expect.any(Number), column: expect.any(Number) });
  });

  it('reports schema validation errors', () => {
    const result = parseConfigYaml('balance:\n  startBalance: lots\n');
    expect(result.success).toBe(false);
    expect(result.validationErrors?.[0].path).toBe('balance.startBalance');
  });
});

describe('findUnknownConfigPaths', () => {
  it('lists leaf paths the schema cannot resolve', () => {
    expect(
      findUnknownConfigPaths({ balance: { startBalance: 1 }, brandNew: { flag: true } }),
    ).toEqual(['brandNew.flag']);
  });

  it('resolves AppService alias sections before looking keys up', () => {
    expect(
      findUnknownConfigPaths({
        interfaceConfig: { customWelcome: 'hi', privacyPolicy: { externalUrl: 'https://x' } },
      }),
    ).toEqual([]);
  });
});

/** The save pre-flight every write path runs: the plan's issues and skipped changes for sets and resets. */
function preflight(saves: t.SaveEntry[], resets: string[] = []) {
  const ops: t.ConfigChange[] = [
    ...saves.map(({ fieldPath, value }): t.ConfigChange => ({ op: 'set', path: fieldPath, value })),
    ...resets.map((path): t.ConfigChange => ({ op: 'reset', path })),
  ];
  const plan = planConfigChanges(ops, { stored: {}, lower: {}, lowerKind: 'yaml' });
  return { issues: plan.issues, skipped: plan.skipped };
}

describe('save pre-flight (planConfigChanges write rules)', () => {
  it('passes valid entries, including an indexed array entry', () => {
    const check = preflight([
      { fieldPath: 'balance.startBalance', value: 100 },
      {
        fieldPath: 'endpoints.custom.2',
        value: { name: 'Proxy', apiKey: 'k', baseURL: 'https://p', models: { default: ['m'] } },
      },
    ]);
    expect(check).toEqual({ issues: [], skipped: [] });
  });

  it('validates an indexed array entry against the element schema', () => {
    const check = preflight([
      {
        fieldPath: 'endpoints.custom.0',
        value: {
          name: 'Proxy',
          apiKey: 'k',
          baseURL: 'https://p',
          models: { fetch: true },
          iconURL: 42,
        },
      },
    ]);
    expect(check.issues.map((issue) => issue.entryPath)).toContain('iconURL');
  });

  it('rejects an invalid MCP title before anything is written', () => {
    const check = preflight([{ fieldPath: 'mcpServers.final-server.title', value: 'Bad_Title!' }]);
    expect(check.issues.map((issue) => issue.path)).toContain('mcpServers.final-server.title');
  });

  it('rejects process-backed MCP fields with the field named', () => {
    const check = preflight([{ fieldPath: 'mcpServers.local.command', value: 'npx' }]);
    expect(check.issues[0].path).toBe('mcpServers.local.command');
    expect(check.issues[0].code).toBe('PROCESS_MCP_FIELD');
  });

  it('rejects keys the admin API would silently drop', () => {
    const check = preflight([
      {
        fieldPath: 'endpoints.bedrock.inferenceProfiles',
        value: { 'us.anthropic.claude': 'arn:aws:x' },
      },
    ]);
    expect(check.issues[0].message).toMatch(/us\.anthropic\.claude/);
  });

  it('skips YAML-managed fields on every write path', () => {
    const check = preflight([
      {
        fieldPath: 'endpoints.azureOpenAI.groups',
        value: [{ group: 'evil', apiKey: 'sk-evil', instanceName: 'evil', models: {} }],
      },
      { fieldPath: 'endpoints.anthropic.vertex.region', value: 'us-east5' },
      { fieldPath: 'endpoints.azureOpenAI.groups.0', value: { group: 'evil' } },
    ]);
    expect(check.issues).toEqual([]);
    expect(check.skipped).toEqual([
      { fieldPath: 'endpoints.azureOpenAI.groups', reason: 'yamlOnly' },
      { fieldPath: 'endpoints.anthropic.vertex.region', reason: 'yamlOnly' },
      { fieldPath: 'endpoints.azureOpenAI.groups.0', reason: 'yamlOnly' },
    ]);
  });

  it('rejects a save at an ancestor path that carries a YAML-managed field', () => {
    const check = preflight([
      { fieldPath: 'endpoints.azureOpenAI', value: { titleModel: 'x', groups: [] } },
    ]);
    expect(check.issues).toHaveLength(1);
    expect(check.issues[0]).toMatchObject({
      path: 'endpoints.azureOpenAI.groups',
      code: 'YAML_MANAGED',
    });
  });

  it('skips dedicated (Langfuse) and newer base-only (mcpAppSandbox) sections', () => {
    const check = preflight(
      [
        { fieldPath: 'balance.startBalance', value: 999 },
        { fieldPath: 'mcpAppSandbox.enabled', value: true },
        { fieldPath: 'langfuse.baseUrl', value: 'https://lf.example.com' },
      ],
      ['langfuse.baseUrl'],
    );
    expect(check.issues).toEqual([]);
    expect(check.skipped).toEqual([
      { fieldPath: 'mcpAppSandbox.enabled', reason: 'baseOnly' },
      { fieldPath: 'langfuse.baseUrl', reason: 'dedicated' },
      { fieldPath: 'langfuse.baseUrl', reason: 'dedicated' },
    ]);
  });

  it('skips base-only, YAML-only and permission writes, but lets stale YAML-only overrides be removed', () => {
    const check = preflight(
      [
        { fieldPath: 'filters.messages.pii.action', value: 'block' },
        { fieldPath: 'cloudfront.urlExpiry', value: 3601 },
        { fieldPath: 'interface.prompts', value: false },
      ],
      ['filters.messages', 'cloudfront.urlExpiry'],
    );
    expect(check.issues).toEqual([]);
    expect(check.skipped).toEqual([
      { fieldPath: 'filters.messages.pii.action', reason: 'baseOnly' },
      { fieldPath: 'cloudfront.urlExpiry', reason: 'yamlOnly' },
      { fieldPath: 'interface.prompts', reason: 'permission' },
      { fieldPath: 'filters.messages', reason: 'baseOnly' },
    ]);
  });
});

describe('findDroppedEntries (PATCH reply)', () => {
  const batch: t.SaveEntry[] = [
    { fieldPath: 'balance.startBalance', value: 999 },
    { fieldPath: 'futureSection.enabled', value: true },
  ];

  it('treats a "No actionable" reply as the whole batch dropped', () => {
    expect(findDroppedEntries(batch, { message: 'No actionable field entries provided' })).toEqual([
      'balance.startBalance',
      'futureSection.enabled',
    ]);
  });

  it('reports entries whose section is missing from the stored overrides', () => {
    const body = { config: { overrides: { balance: { startBalance: 999 } } } };
    expect(findDroppedEntries(batch, body)).toEqual(['futureSection.enabled']);
  });

  it('reports nothing when every section was stored or the reply has no config', () => {
    const body = { config: { overrides: { balance: {}, futureSection: { enabled: true } } } };
    expect(findDroppedEntries(batch, body)).toEqual([]);
    expect(findDroppedEntries(batch, { config: null })).toEqual([]);
    expect(findDroppedEntries(batch, {})).toEqual([]);
  });
});
