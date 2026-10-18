import { configSchema } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import {
  unwrapSchema,
  innerSchemaOf,
  isUnionSchema,
  isConfigRecord,
  ZOD_WRAPPER_TYPES,
  resolveIntersection,
  filterSecretPreviewFields,
  filterInterfacePermissionChildren,
} from '~/admin/utils';
import { createServerFn } from '~/admin/api/utils/fn';
import { queryOptions } from '~/admin/query';
import { apiFetch } from '../utils/api';

/** Hide the Langfuse section when LibreChat reports fanout is disabled. When the
 *  fanout state is unknown (older backends), the schema-provided section is kept. */
export function applyLangfuseSchemaVisibility(
  tree: t.SchemaField[],
  fanoutEnabled: boolean | undefined,
): t.SchemaField[] {
  if (fanoutEnabled !== false) return tree;
  const langfuseIndex = tree.findIndex((section) => section.key === 'langfuse');
  if (langfuseIndex >= 0) tree.splice(langfuseIndex, 1);
  return tree;
}

/** A Zod node with its wrappers removed, and what the wrappers said about it. */
interface UnwrappedNode {
  schema: t.ZodSchemaLike;
  isOptional: boolean;
  isNullable: boolean;
  description?: string;
}

/** The parts of a field before unset properties and `false` flags are dropped. */
interface FieldParts {
  path: string;
  key: string;
  type: string;
  isOptional: boolean;
  isNullable?: boolean;
  isArray?: boolean;
  isObject?: boolean;
  description?: string;
  children?: t.SchemaField[];
  depth: number;
  recordValueType?: 'primitive' | 'complex';
  recordValueAllowsPrimitive?: boolean;
  recordValueKVTypes?: t.KVValueType[];
  itemType?: string;
  variants?: t.SchemaVariant[];
  discriminator?: string;
  constraints?: t.FieldConstraints;
}

const ABSENT_TYPES: ReadonlySet<string> = new Set(['ZodUndefined', 'ZodNull', 'ZodVoid']);

/** Record value types worth sending to the client: choices a value select can offer. */
const CHOICE_TYPE = /^(enum|literal)\(|^union\((enum|literal)\(/;

const ZOD_TO_KV: Record<string, t.KVValueType> = {
  ZodString: 'string',
  ZodNumber: 'number',
  ZodBoolean: 'boolean',
  ZodEnum: 'string',
  ZodLiteral: 'string',
};

function unwrapNode(value: t.ZodSchemaLike): UnwrappedNode {
  const seen = new Set<t.ZodSchemaLike>();
  let schema = value;
  let isOptional = false;
  let isNullable = false;
  let description: string | undefined;
  while (schema?._def?.typeName && ZOD_WRAPPER_TYPES.has(schema._def.typeName)) {
    if (seen.has(schema)) break;
    seen.add(schema);
    const def = schema._def;
    description ??= def.description;
    if (def.typeName === 'ZodOptional' || def.typeName === 'ZodDefault') isOptional = true;
    if (def.typeName === 'ZodNullable') isNullable = true;
    const next = innerSchemaOf(def);
    if (!next) break;
    schema = next;
  }
  description ??= schema?._def?.description;
  return { schema: resolveIntersection(schema) ?? schema, isOptional, isNullable, description };
}

function isObjectNode(schema: t.ZodSchemaLike | undefined): boolean {
  return !!schema && typeof schema === 'object' && 'shape' in schema && !!schema.shape;
}

function isAbsentNode(schema: t.ZodSchemaLike): boolean {
  return ABSENT_TYPES.has(schema?._def?.typeName ?? '');
}

/** Union members with their wrappers removed, leaving out `undefined`/`null` members. */
function presentMembers(schema: t.ZodSchemaLike): t.ZodSchemaLike[] {
  if (!isUnionSchema(schema)) return [];
  return (schema._def?.options ?? [])
    .map((option) => unwrapNode(option).schema)
    .filter((option) => !isAbsentNode(option));
}

/** The object members of a union whose members are all objects (`memory.agent`, `summarization.trigger`). */
function objectVariants(schema: t.ZodSchemaLike): t.ZodSchemaLike[] | undefined {
  const members = presentMembers(schema);
  return members.length > 0 && members.every(isObjectNode) ? members : undefined;
}

/** `boolean | object`: a feature switch whose object form gives fine-grained control. */
function isBooleanObjectUnion(schema: t.ZodSchemaLike): boolean {
  const members = presentMembers(schema);
  return (
    members.some((member) => member._def?.typeName === 'ZodBoolean') && members.some(isObjectNode)
  );
}

function inferRecordKVTypes(schema: t.ZodSchemaLike): t.KVValueType[] | undefined {
  const typeName = schema?._def?.typeName;
  if (typeName === 'ZodNativeEnum') {
    return [getZodTypeName(schema).includes('=') ? 'number' : 'string'];
  }
  if (typeName && typeName in ZOD_TO_KV) return [ZOD_TO_KV[typeName]];
  if (!isUnionSchema(schema)) return undefined;
  const types = new Set<t.KVValueType>();
  for (const member of presentMembers(schema)) {
    const memberType = member._def?.typeName;
    if (memberType && memberType in ZOD_TO_KV) {
      types.add(ZOD_TO_KV[memberType]);
    } else if (memberType === 'ZodRecord' || memberType === 'ZodArray' || isObjectNode(member)) {
      types.add('json');
    }
  }
  return types.size > 0 ? [...types] : undefined;
}

/** Input step implied by the bounds: whole numbers step by 1, ratios by 0.01. */
function stepFor(constraints: t.FieldConstraints): number | undefined {
  if (constraints.int) return 1;
  if (constraints.max === undefined) return undefined;
  if (constraints.max <= 1) return 0.01;
  if (constraints.max <= 10) return 0.1;
  return undefined;
}

function withStep(constraints: t.FieldConstraints): t.FieldConstraints | undefined {
  const step = stepFor(constraints);
  const result = step === undefined ? constraints : { ...constraints, step };
  return Object.keys(result).length > 0 ? result : undefined;
}

function numberConstraints(checks: t.ZodCheck[]): t.FieldConstraints {
  const constraints: t.FieldConstraints = {};
  for (const check of checks) {
    if (check.kind === 'int') constraints.int = true;
    if (check.kind === 'min' && typeof check.value === 'number') {
      constraints.min = check.value;
      if (check.inclusive === false) constraints.minExclusive = true;
    }
    if (check.kind === 'max' && typeof check.value === 'number') {
      constraints.max = check.value;
      if (check.inclusive === false) constraints.maxExclusive = true;
    }
  }
  return constraints;
}

function stringConstraints(checks: t.ZodCheck[]): t.FieldConstraints {
  const constraints: t.FieldConstraints = {};
  for (const check of checks) {
    if (check.kind === 'url') constraints.url = true;
    if (check.kind === 'email') constraints.email = true;
    if (check.kind === 'regex' && check.regex) constraints.regex = check.regex.source;
    if ((check.kind === 'min' || check.kind === 'length') && typeof check.value === 'number') {
      constraints.minLength = check.value;
    }
    if ((check.kind === 'max' || check.kind === 'length') && typeof check.value === 'number') {
      constraints.maxLength = check.value;
    }
  }
  return constraints;
}

/** Validation limits from a scalar's Zod checks (`min`, `max`, `int`, `url`, `regex`, …). */
export function extractConstraints(schema: t.ZodSchemaLike): t.FieldConstraints | undefined {
  const def = schema?._def;
  const checks = def?.checks;
  if (!def || !checks?.length) return undefined;
  if (def.typeName === 'ZodNumber') return withStep(numberConstraints(checks));
  if (def.typeName === 'ZodString') return withStep(stringConstraints(checks));
  return undefined;
}

function lowerBound(a: t.FieldConstraints, b: t.FieldConstraints): t.FieldConstraints {
  if (a.min === undefined || b.min === undefined) return {};
  const min = Math.min(a.min, b.min);
  const exclusive =
    (a.min !== min || a.minExclusive === true) && (b.min !== min || b.minExclusive === true);
  return exclusive ? { min, minExclusive: true } : { min };
}

function upperBound(a: t.FieldConstraints, b: t.FieldConstraints): t.FieldConstraints {
  if (a.max === undefined || b.max === undefined) return {};
  const max = Math.max(a.max, b.max);
  const exclusive =
    (a.max !== max || a.maxExclusive === true) && (b.max !== max || b.maxExclusive === true);
  return exclusive ? { max, maxExclusive: true } : { max };
}

/** Limits that hold for a key shared by several union variants: the loosest of each bound. */
function hullConstraints(
  a: t.FieldConstraints | undefined,
  b: t.FieldConstraints | undefined,
): t.FieldConstraints | undefined {
  if (!a || !b) return undefined;
  const hull: t.FieldConstraints = {
    ...lowerBound(a, b),
    ...upperBound(a, b),
    ...(a.int && b.int ? { int: true } : {}),
  };
  return withStep(hull);
}

function isLiteralLike(type: string): boolean {
  if (type.startsWith('literal(')) return true;
  return type.startsWith('union(') && type.includes('literal(');
}

function extractLiterals(type: string): string[] {
  if (type.startsWith('literal(')) return [type];
  if (!type.startsWith('union(')) return [];
  return type
    .slice(6, -1)
    .split(' | ')
    .filter((s) => s.startsWith('literal('));
}

function mergeLiteralTypes(a: string, b: string): string {
  const literals = extractLiterals(a);
  for (const literal of extractLiterals(b)) {
    if (!literals.includes(literal)) literals.push(literal);
  }
  return literals.length === 1 ? literals[0] : `union(${literals.join(' | ')})`;
}

function mergeSharedField(existing: t.SchemaField, field: t.SchemaField): t.SchemaField {
  const type =
    existing.type !== field.type && isLiteralLike(existing.type) && isLiteralLike(field.type)
      ? mergeLiteralTypes(existing.type, field.type)
      : existing.type;
  const { constraints: _dropped, ...rest } = existing;
  const constraints = hullConstraints(existing.constraints, field.constraints);
  return constraints ? { ...rest, type, constraints } : { ...rest, type };
}

/**
 * Merges the fields of several union variants into one optional list. A key
 * that is `undefined` in some variants (MCP `obo` on stdio) takes its real
 * definition from another; discriminator literals combine into one select;
 * shared keys keep only the limits every variant accepts.
 */
function mergeFieldLists(lists: t.SchemaField[][]): t.SchemaField[] {
  const byKey = new Map<string, t.SchemaField>();
  for (const fields of lists) {
    for (const field of fields) {
      const existing = byKey.get(field.key);
      if (!existing || existing.type === 'undefined') {
        byKey.set(field.key, { ...field, isOptional: true });
      } else if (field.type !== 'undefined') {
        byKey.set(field.key, mergeSharedField(existing, field));
      }
    }
  }
  return [...byKey.values()];
}

function mergeVariantFields(
  members: t.ZodSchemaLike[],
  parentPath: string[],
  depth: number,
): t.SchemaField[] {
  return mergeFieldLists(members.map((member) => extractSchemaTree(member, parentPath, depth)));
}

function discriminatorValue(member: t.ZodSchemaLike, discriminator: string): string | undefined {
  const node = member.shape?.[discriminator];
  const value = node ? unwrapSchema(node)._def?.value : undefined;
  return value === undefined ? undefined : String(value);
}

/** Names a variant by its discriminator value, else by the first key no other variant has. */
function variantKey(
  member: t.ZodSchemaLike,
  fields: t.SchemaField[],
  lists: t.SchemaField[][],
  index: number,
  discriminator: string | undefined,
): string {
  const tagged = discriminator ? discriminatorValue(member, discriminator) : undefined;
  if (tagged !== undefined) return tagged;
  const unique = fields.find((field) =>
    lists.every((list, i) => i === index || !list.some((f) => f.key === field.key)),
  );
  return unique?.key ?? String(index);
}

function finalizeField(parts: FieldParts): t.SchemaField {
  const field: t.SchemaField = {
    path: parts.path,
    key: parts.key,
    type: parts.type,
    isOptional: parts.isOptional,
    depth: parts.depth,
  };
  if (parts.isNullable) field.isNullable = true;
  if (parts.isArray) field.isArray = true;
  if (parts.isObject) field.isObject = true;
  if (parts.description) field.description = parts.description;
  if (parts.children) field.children = parts.children;
  if (parts.recordValueType) field.recordValueType = parts.recordValueType;
  if (parts.recordValueAllowsPrimitive) field.recordValueAllowsPrimitive = true;
  if (parts.recordValueKVTypes) field.recordValueKVTypes = parts.recordValueKVTypes;
  if (parts.itemType) field.itemType = parts.itemType;
  if (parts.variants) field.variants = parts.variants;
  if (parts.discriminator) field.discriminator = parts.discriminator;
  if (parts.constraints) field.constraints = parts.constraints;
  return field;
}

function variantField(
  base: FieldParts,
  schema: t.ZodSchemaLike,
  members: t.ZodSchemaLike[],
  path: string[],
): t.SchemaField {
  const lists = members.map((member) => extractSchemaTree(member, path, base.depth + 1));
  const discriminator = schema._def?.discriminator;
  const variants = lists.map((fields, index) => ({
    key: variantKey(members[index], fields, lists, index, discriminator),
    fields,
  }));
  return finalizeField({
    ...base,
    type: 'object',
    isObject: true,
    children: mergeFieldLists(lists),
    variants,
    discriminator,
  });
}

function arrayField(base: FieldParts, schema: t.ZodSchemaLike, path: string[]): t.SchemaField {
  const element = schema._def?.type ? unwrapNode(schema._def.type).schema : undefined;
  const elementPath = [...path, '[]'];
  const depth = base.depth + 1;
  const type = getZodTypeName(schema);
  if (element && isObjectNode(element)) {
    const children = extractSchemaTree(element, elementPath, depth);
    return finalizeField({ ...base, type, isArray: true, children });
  }
  const members = element ? objectVariants(element) : undefined;
  const children = members ? mergeVariantFields(members, elementPath, depth) : undefined;
  return finalizeField({ ...base, type, isArray: true, children });
}

function recordField(base: FieldParts, schema: t.ZodSchemaLike, path: string[]): t.SchemaField {
  const type = getZodTypeName(schema);
  const valueSchema = schema._def?.valueType;
  if (!valueSchema) return finalizeField({ ...base, type });
  const value = unwrapNode(valueSchema).schema;
  const valuePath = [...path, '{}'];
  const depth = base.depth + 1;
  if (isObjectNode(value)) {
    const children = extractSchemaTree(value, valuePath, depth);
    return finalizeField({ ...base, type, children, recordValueType: 'complex' });
  }
  const members = objectVariants(value);
  if (members) {
    const children = mergeVariantFields(members, valuePath, depth);
    return finalizeField({ ...base, type, children, recordValueType: 'complex' });
  }
  const objects = presentMembers(value).filter(isObjectNode);
  if (objects.length > 0) {
    return finalizeField({
      ...base,
      type,
      children: mergeVariantFields(objects, valuePath, depth),
      recordValueType: 'complex',
      recordValueAllowsPrimitive: true,
    });
  }
  const valueType = getZodTypeName(value);
  return finalizeField({
    ...base,
    type,
    recordValueType: 'primitive',
    recordValueKVTypes: inferRecordKVTypes(value),
    itemType: CHOICE_TYPE.test(valueType) ? valueType : undefined,
  });
}

function buildField(
  key: string,
  value: t.ZodSchemaLike,
  parentPath: string[],
  depth: number,
): t.SchemaField {
  const path = [...parentPath, key];
  const node = unwrapNode(value);
  const { schema } = node;
  const base: FieldParts = {
    path: path.join('.'),
    key,
    type: '',
    isOptional: node.isOptional,
    isNullable: node.isNullable,
    description: node.description,
    depth,
  };
  if (isObjectNode(schema)) {
    const children = extractSchemaTree(schema, path, depth + 1);
    return finalizeField({ ...base, type: 'object', isObject: true, children });
  }
  const members = objectVariants(schema);
  if (members) return variantField(base, schema, members, path);
  if (isBooleanObjectUnion(schema)) {
    const objects = presentMembers(schema).filter(isObjectNode);
    const children = mergeVariantFields(objects, path, depth + 1);
    return finalizeField({ ...base, type: getZodTypeName(schema), children });
  }
  const typeName = schema?._def?.typeName;
  if (typeName === 'ZodArray') return arrayField(base, schema, path);
  if (typeName === 'ZodRecord') return recordField(base, schema, path);
  return finalizeField({
    ...base,
    type: getZodTypeName(schema),
    constraints: extractConstraints(schema),
  });
}

/**
 * Walks an object schema into `SchemaField`s (WS2). Unions of objects and
 * discriminated unions become variant fields, refined array elements are
 * unwrapped, and fields keep a compact `type` string plus `variants`,
 * `discriminator` and `constraints` where the schema has them.
 */
export function extractSchemaTree(
  schema: t.ZodSchemaLike,
  path: string[] = [],
  depth: number = 0,
): t.SchemaField[] {
  if (!isObjectNode(schema)) return [];
  const fields = Object.entries(schema.shape ?? {}).map(([key, value]) =>
    buildField(key, value, path, depth),
  );
  return filterSecretPreviewFields(fields);
}

export function flattenTree(fields: t.SchemaField[]): t.SchemaField[] {
  const result: t.SchemaField[] = [];
  for (const field of fields) {
    result.push(field);
    if (field.children) {
      result.push(...flattenTree(field.children));
    }
  }
  return result;
}

const MAX_ZOD_TYPE_DEPTH = 10;

function nativeEnumTypeName(raw: string[] | Record<string, string | number>): string {
  const entries = Array.isArray(raw)
    ? raw.map((v): [string, string] => [v, v])
    : Object.entries(raw);
  const numeric = entries.filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number',
  );
  if (numeric.length > 0) {
    return `enum(${numeric.map(([label, val]) => `${label}=${val}`).join(' | ')})`;
  }
  const strings = entries.map(([, v]) => v).filter((v): v is string => typeof v === 'string');
  return strings.length > 0 ? `enum(${strings.join(' | ')})` : 'enum';
}

export function getZodTypeName(
  schema: t.ZodSchemaLike,
  _seen?: Set<t.ZodSchemaLike>,
  _depth?: number,
): string {
  if (!schema || typeof schema !== 'object') return 'unknown';

  const depth = _depth ?? 0;
  if (depth >= MAX_ZOD_TYPE_DEPTH) return 'unknown';

  const seen = _seen ?? new Set<t.ZodSchemaLike>();
  if (seen.has(schema)) return 'unknown';
  seen.add(schema);

  const innerSchema = unwrapSchema(schema);

  if (!innerSchema || typeof innerSchema !== 'object' || !innerSchema._def) {
    return 'unknown';
  }

  if (innerSchema !== schema) {
    if (seen.has(innerSchema)) return 'unknown';
    seen.add(innerSchema);
  }

  const typeName = innerSchema._def.typeName;

  if (typeName === 'ZodString') return 'string';
  if (typeName === 'ZodNumber') return 'number';
  if (typeName === 'ZodBoolean') return 'boolean';
  if (typeName === 'ZodNull') return 'null';
  if (typeName === 'ZodUndefined') return 'undefined';
  if (typeName === 'ZodArray') {
    const elementType = innerSchema._def.type;
    if (!elementType) return 'array<unknown>';
    const elementTypeName = getZodTypeName(elementType, seen, depth + 1);
    return `array<${elementTypeName}>`;
  }
  if (typeName === 'ZodObject') return 'object';
  if (typeName === 'ZodIntersection') {
    return resolveIntersection(innerSchema) ? 'object' : 'unknown';
  }
  if (typeName === 'ZodEnum') {
    const values = innerSchema._def?.values ?? [];
    return `enum(${Array.isArray(values) ? values.join(' | ') : Object.values(values).join(' | ')})`;
  }
  if (typeName === 'ZodNativeEnum') return nativeEnumTypeName(innerSchema._def?.values ?? {});
  if (isUnionSchema(innerSchema)) {
    const options = innerSchema._def.options || [];
    const types = options.map((opt: t.ZodSchemaLike) => getZodTypeName(opt, seen, depth + 1));
    return `union(${types.join(' | ')})`;
  }
  if (typeName === 'ZodLiteral') {
    const literalValue = innerSchema._def.value;
    return `literal(${JSON.stringify(literalValue)})`;
  }
  if (typeName === 'ZodRecord') return 'record';
  if (typeName === 'ZodAny') return 'any';
  if (typeName === 'ZodUnknown') return 'unknown';
  return typeName || 'unknown';
}

/** Shared queryOptions for the schema tree used by command palette search. */
export const configSchemaTreeOptions = queryOptions({
  queryKey: ['configSchemaTree'],
  queryFn: async () => {
    const result = await getConfigSchemaFields();
    if (!result?.tree) throw new Error('The configuration schema could not be loaded');
    return result.tree;
  },
  staleTime: Infinity,
});

export const getConfigSchemaFields = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const tree = extractSchemaTree(configSchema);
    const startupConfigResponse = await apiFetch('/api/config');
    const startupConfig = startupConfigResponse.ok
      ? ((await startupConfigResponse.json()) as { langfuseFanoutEnabled?: boolean })
      : undefined;
    applyLangfuseSchemaVisibility(tree, startupConfig?.langfuseFanoutEnabled);
    for (const section of tree) {
      if (section.key === 'interface' && section.children) {
        section.children = filterInterfacePermissionChildren(section.children);
      }
    }
    const flatFields = flattenTree(tree);
    tree.sort((a, b) => a.key.localeCompare(b.key));

    return { tree, totalFields: flatFields.length, topLevelSections: tree.length };
  } catch (error) {
    console.error('Failed to extract schema fields:', error);
    throw new Error(
      `Failed to extract schema fields: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
});

function getFieldDefault(schema: t.ZodSchemaLike): { hasDefault: boolean; value?: t.ConfigValue } {
  const seen = new Set<t.ZodSchemaLike>();
  let current = schema;
  while (current?._def && !seen.has(current)) {
    seen.add(current);
    if (current._def.typeName === 'ZodDefault') {
      return { hasDefault: true, value: current._def.defaultValue?.() as t.ConfigValue };
    }
    if (!ZOD_WRAPPER_TYPES.has(current._def.typeName ?? '')) break;
    const next = innerSchemaOf(current._def);
    if (!next) break;
    current = next;
  }
  return { hasDefault: false };
}

/** Deep-merges nested field defaults under an explicit object default; the explicit values win. */
function mergeDefaults(nested: t.ConfigRecord, explicit: t.ConfigRecord): t.ConfigRecord {
  const merged: t.ConfigRecord = { ...nested };
  for (const [key, value] of Object.entries(explicit)) {
    const inner = merged[key];
    merged[key] =
      isConfigRecord(value) && isConfigRecord(inner) ? mergeDefaults(inner, value) : value;
  }
  return merged;
}

/**
 * Nested object of every `.default()` value in `schema`. A field whose object
 * default leaves out some keys still contributes those keys' own defaults
 * (`interface.retentionMode`, `endpoints.agents.maxProviderErrorChars`); the
 * object default wins where both set a key.
 */
export function extractSchemaDefaults(schema: t.ZodSchemaLike): t.ConfigRecord {
  const result: t.ConfigRecord = {};
  if (!isObjectNode(schema)) return result;

  for (const [key, fieldSchema] of Object.entries(schema.shape ?? {})) {
    const { hasDefault, value } = getFieldDefault(fieldSchema);
    const inner = unwrapNode(fieldSchema).schema;
    const nested = isObjectNode(inner) ? extractSchemaDefaults(inner) : {};
    const hasNested = Object.keys(nested).length > 0;
    if (hasDefault && hasNested && isConfigRecord(value)) {
      result[key] = mergeDefaults(nested, value);
    } else if (hasDefault) {
      result[key] = value;
    } else if (hasNested) {
      result[key] = nested;
    }
  }
  return result;
}

let cachedSchemaPathSet: Set<string> | undefined;

/**
 * Index-free schema field paths (e.g. `endpoints.custom.apiKey`), memoized
 * since the schema is static. `extractSchemaTree` bakes `[]`/`{}` markers
 * into array/record element paths for its own tree-walking bookkeeping;
 * strip them so paths match the plain dotted convention `secretPathForPreviewPath`
 * and `stripSecretPreviewValues` expect.
 */
export function getSchemaPathSet(): Set<string> {
  if (!cachedSchemaPathSet) {
    const paths = flattenTree(extractSchemaTree(configSchema)).map((f) =>
      f.path.replace(/\.(\[\]|\{\})/g, ''),
    );
    cachedSchemaPathSet = new Set(paths);
  }
  return cachedSchemaPathSet;
}
