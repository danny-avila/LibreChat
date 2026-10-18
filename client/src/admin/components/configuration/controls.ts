import type * as t from '~/admin/types';
import { getFieldMeta } from './meta';

/** The schema node for one element of an array field or one value of a record field. */
export function elementField(container: t.SchemaField, segment: string): t.SchemaField {
  const base = {
    ...container,
    path: `${container.path}.${segment}`,
    key: segment,
    isArray: false,
    recordValueType: undefined,
    recordValueKVTypes: undefined,
    recordValueAllowsPrimitive: undefined,
    variants: undefined,
    discriminator: undefined,
    constraints: undefined,
  };
  if (container.children?.length) {
    return { ...base, type: 'object', isObject: true, children: container.children };
  }
  if (container.isArray) {
    const itemType = getArrayItemType(container.type);
    return { ...base, type: itemType, isArray: itemType.startsWith('array'), isObject: false };
  }
  const kvTypes = container.recordValueKVTypes;
  const valueType = kvTypes?.length === 1 ? kvTypes[0] : 'unknown';
  return {
    ...base,
    itemType: undefined,
    type: container.itemType ?? valueType,
    isObject: false,
    children: undefined,
  };
}

function isCollectionField(field: t.SchemaField): boolean {
  return !!field.isArray || field.type === 'record';
}

/**
 * Finds the schema node for a dot-path, stepping into array elements and record
 * values by index or key (`endpoints.custom.3.headers` → the custom endpoint
 * `headers` record). Returns null when the path leaves the schema.
 */
export function findSchemaField(tree: t.SchemaField[], path: string): t.SchemaField | null {
  let fields: t.SchemaField[] | undefined = tree;
  let current: t.SchemaField | null = null;
  for (const segment of path.split('.')) {
    if (current && isCollectionField(current)) {
      current = elementField(current, segment);
    } else {
      current = fields?.find((f) => f.key === segment) ?? null;
    }
    if (!current) return null;
    fields = current.children;
  }
  return current;
}

const SCALAR_KINDS: ReadonlyMap<string, t.SchemaKind> = new Map<string, t.SchemaKind>([
  ['string', 'string'],
  ['number', 'number'],
  ['boolean', 'boolean'],
  ['null', 'null'],
  ['undefined', 'undefined'],
  ['object', 'object'],
  ['record', 'record'],
  ['any', 'any'],
  ['unknown', 'unknown'],
  ['enum', 'enum'],
]);

const ABSENT_KINDS: ReadonlySet<t.SchemaKind> = new Set(['null', 'undefined']);
const NAMED_NUMBER = /^(.+)=(-?\d+(?:\.\d+)?)$/;
const NUMERIC = /^-?\d+(\.\d+)?$/;
const shapeCache = new Map<string, t.FieldShape>();

function parseEnum(inner: string): t.FieldShape {
  const members = inner.split('|').map((member) => member.trim());
  const named = members.map((member) => member.match(NAMED_NUMBER));
  if (members.length > 0 && named.every((match) => match !== null)) {
    return {
      kind: 'enum',
      values: named.map((match) => Number(match?.[2])),
      names: named.map((match) => match?.[1] ?? ''),
    };
  }
  return { kind: 'enum', values: members };
}

function parseLiteral(inner: string): t.FieldShape {
  try {
    const value: t.ConfigValue = JSON.parse(inner);
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return { kind: 'literal', values: [value] };
    }
    return value === null ? { kind: 'null' } : { kind: 'unknown' };
  } catch {
    return { kind: 'literal', values: [inner.replace(/^["']|["']$/g, '')] };
  }
}

function parseUnion(type: string): t.FieldShape {
  const options = splitUnionTypes(type)
    .map(parseShape)
    .filter((option) => !ABSENT_KINDS.has(option.kind));
  if (options.length === 1) return options[0];
  return { kind: 'union', options };
}

function parseShape(type: string): t.FieldShape {
  const scalar = SCALAR_KINDS.get(type);
  if (scalar) return { kind: scalar };
  if (type.startsWith('array<') && type.endsWith('>')) {
    return { kind: 'array', item: parseShape(type.slice(6, -1)) };
  }
  if (type.startsWith('enum(') && type.endsWith(')')) return parseEnum(type.slice(5, -1));
  if (type.startsWith('literal(') && type.endsWith(')')) return parseLiteral(type.slice(8, -1));
  if (type.startsWith('union(')) return parseUnion(type);
  return { kind: 'unknown' };
}

/**
 * Structured shape of a wire type string (`union(boolean | array<string>)` →
 * a union of a boolean and a string array). `null`/`undefined` union members
 * are dropped, so `union(X | null)` is just `X`. Memoized per type string.
 */
export function parseTypeShape(type: string): t.FieldShape {
  const cached = shapeCache.get(type);
  if (cached) return cached;
  const shape = parseShape(type);
  shapeCache.set(type, shape);
  return shape;
}

/** Structured shape of a field (WS2): variant fields, objects, else its parsed `type`. */
export function getFieldShape(field: t.SchemaField): t.FieldShape {
  if (field.variants?.length) return { kind: 'variant' };
  if (field.isObject && field.type !== 'record') return { kind: 'object' };
  if (field.type === 'record' && field.itemType) {
    return { kind: 'record', item: parseTypeShape(field.itemType) };
  }
  return parseTypeShape(field.type);
}

function isStringLikeShape(shape: t.FieldShape | undefined): boolean {
  if (!shape) return true;
  if (shape.kind === 'string' || shape.kind === 'enum' || shape.kind === 'literal') return true;
  if (shape.kind === 'any' || shape.kind === 'unknown') return true;
  return (
    shape.kind === 'union' && (shape.options ?? []).every((option) => isStringLikeShape(option))
  );
}

function isChoiceShape(shape: t.FieldShape): boolean {
  return shape.kind === 'enum' || shape.kind === 'literal' || shape.kind === 'boolean';
}

function isScalarShape(shape: t.FieldShape): boolean {
  return shape.kind === 'string' || shape.kind === 'number' || shape.kind === 'boolean';
}

function isStringListShape(shape: t.FieldShape): boolean {
  return shape.kind === 'array' && isStringLikeShape(shape.item);
}

function arrayControl(item: t.FieldShape | undefined, field: t.SchemaField): t.ControlKind {
  if (field.children?.length) return 'array-object';
  if (item?.kind === 'enum') return 'multi-enum';
  if (item?.kind === 'union') {
    const options = item.options ?? [];
    const hasObject = options.some((o) => o.kind === 'object' || o.kind === 'record');
    if (hasObject && options.some((o) => o.kind === 'string')) return 'model-list';
    if (hasObject) return 'code';
  }
  if (item?.kind === 'array' || item?.kind === 'record' || item?.kind === 'object') return 'code';
  return 'array';
}

function unionControl(options: t.FieldShape[], field: t.SchemaField): t.ControlKind {
  const kinds = new Set(options.map((option) => option.kind));
  const only = (...allowed: t.SchemaKind[]) => [...kinds].every((kind) => allowed.includes(kind));
  const pair = kinds.size === 2;
  if (kinds.has('boolean') && kinds.has('object')) {
    return field.children?.length ? 'switch-object' : 'toggle';
  }
  if (options.every(isChoiceShape)) return 'select';
  if (only('enum', 'literal', 'number')) return 'select';
  if (pair && kinds.has('string') && kinds.has('record')) return 'text-record';
  if (pair && kinds.has('string') && options.some(isStringListShape)) return 'text-record';
  if (pair && kinds.has('array') && kinds.has('record')) return 'list-record';
  if (options.every((option) => option.kind === 'array')) return 'list-record';
  if (pair && kinds.has('boolean') && options.some(isStringListShape)) return 'bool-or-list';
  if (only('number', 'string')) return 'number';
  if (kinds.has('string') && only('string', 'enum', 'literal')) return 'text';
  if (options.every((option) => isScalarShape(option) || isStringListShape(option))) {
    return 'scalar-union';
  }
  return 'code';
}

function controlForShape(shape: t.FieldShape, field: t.SchemaField): t.ControlKind {
  switch (shape.kind) {
    case 'boolean':
      return 'toggle';
    case 'enum':
      return 'select';
    case 'literal':
      return 'literal';
    case 'number':
      return 'number';
    case 'string':
      return 'text';
    case 'object':
      return 'object';
    case 'variant':
      return 'variant';
    case 'array':
      return arrayControl(shape.item, field);
    case 'record':
      return field.recordValueType === 'complex' ? 'record-object' : 'record';
    case 'union':
      return unionControl(shape.options ?? [], field);
    default:
      return 'code';
  }
}

function isPlainObject(value: t.ConfigValue): value is t.ConfigRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPrimitive(value: t.ConfigValue): boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function isStringList(value: t.ConfigValue): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** A key/value editor's pending rows (`KeyValuePair[]`) or a record of primitives (or JSON when allowed). */
function isKeyValueValue(field: t.SchemaField, value: t.ConfigValue): boolean {
  if (Array.isArray(value)) return value.every((row) => isPlainObject(row) && 'key' in row);
  if (!isPlainObject(value)) return false;
  if (field.recordValueKVTypes?.includes('json')) return true;
  return Object.values(value).every((entry) => entry === null || isPrimitive(entry));
}

function isModelItem(value: t.ConfigValue): boolean {
  return typeof value === 'string' || (isPlainObject(value) && typeof value.name === 'string');
}

/**
 * Whether `control` can show `value` and emit it back unchanged — e.g. a
 * toggle can't show a string list, a key/value editor can't show `true`.
 * `undefined`/`null` (unset) fit every control.
 */
export function canRoundTrip(
  control: t.ControlKind,
  field: t.SchemaField,
  value: t.ConfigValue,
): boolean {
  if (value === undefined || value === null) return true;
  switch (control) {
    case 'toggle':
    case 'tristate':
      return typeof value === 'boolean';
    case 'number':
      return typeof value === 'number';
    case 'text':
    case 'textarea':
    case 'secret':
    case 'ref-select':
      return typeof value === 'string';
    case 'select':
      return isPrimitive(value);
    case 'literal':
      return (getFieldShape(field).values ?? []).some((member) => member === value);
    case 'array':
    case 'multi-enum':
      return isStringList(value);
    case 'model-list':
      return Array.isArray(value) && value.every(isModelItem);
    case 'bool-or-list':
      return typeof value === 'boolean' || isStringList(value);
    case 'scalar-union':
      return isPrimitive(value) || isStringList(value);
    case 'switch-object':
      return typeof value === 'boolean' || isPlainObject(value);
    case 'text-record':
      return typeof value === 'string' || isStringList(value) || isPlainObject(value);
    case 'list-record':
      return Array.isArray(value) || isPlainObject(value);
    case 'record':
      return isKeyValueValue(field, value);
    case 'array-object':
      return Array.isArray(value);
    case 'object':
    case 'variant':
    case 'record-object':
      return isPlainObject(value);
    default:
      return true;
  }
}

function shapeAdmits(shape: t.FieldShape, kind: t.SchemaKind): boolean {
  if (shape.kind === kind) return true;
  return shape.kind === 'union' && (shape.options ?? []).some((option) => option.kind === kind);
}

/** A free-text control refined by metadata: secrets, multiline text, references to other entries. */
function refineText(meta: t.FieldMeta | undefined): t.ControlKind {
  if (meta?.secret) return 'secret';
  if (meta?.optionSource) return 'ref-select';
  if (meta?.multiline) return 'textarea';
  return 'text';
}

/**
 * The control for a field (WS2 → WS3): `FieldMeta.control` when set, else the
 * one its shape maps to (free text becomes `secret`, `ref-select` or
 * `textarea` per `FieldMeta.secret`/`optionSource`/`multiline`). Given the current `value`, a control that can't
 * round-trip it is replaced by a text input (strings the schema allows) or the
 * YAML editor — never an editor that hides or rewrites the value.
 */
export function getControlType(field: t.SchemaField, value?: t.ConfigValue): t.ControlKind {
  const shape = getFieldShape(field);
  const meta = getFieldMeta(field.path);
  const mapped = controlForShape(shape, field);
  const control = meta?.control ?? (mapped === 'text' ? refineText(meta) : mapped);
  if (value === undefined || canRoundTrip(control, field, value)) return control;
  return typeof value === 'string' && shapeAdmits(shape, 'string') ? 'text' : 'code';
}

function scalarUnionFallback(field: t.SchemaField, value: t.ConfigValue): t.ControlType {
  if (typeof value === 'boolean') return 'toggle';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'text';
  if (Array.isArray(value)) return 'array';
  const kinds = (getFieldShape(field).options ?? []).map((option) => option.kind).sort();
  return kinds.join() === 'boolean,string' ? 'toggle' : 'code';
}

/**
 * The nearest generic control (`ControlType`) for a kind a renderer has no
 * dedicated component for, chosen so the current value still round-trips:
 * `bool-or-list` → toggle or list by value, `literal` → select, `variant` →
 * nested object, `textarea`/`secret` → text, and so on.
 */
export function fallbackControl(
  kind: t.ControlKind,
  field: t.SchemaField,
  value?: t.ConfigValue,
): t.ControlType {
  switch (kind) {
    case 'textarea':
    case 'secret':
    case 'ref-select':
      return 'text';
    case 'tristate':
      return 'toggle';
    case 'literal':
      return 'select';
    case 'multi-enum':
      return 'array';
    case 'model-list':
      return value == null || isStringList(value) ? 'array' : 'code';
    case 'bool-or-list':
      return Array.isArray(value) ? 'array' : 'toggle';
    case 'scalar-union':
      return scalarUnionFallback(field, value);
    case 'variant':
      return 'object';
    default:
      return kind;
  }
}

/** Humanizes a raw enum member: `azure_blob` → `Azure blob`. */
function humanize(value: string): string {
  const text = value.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

interface ChoiceMember {
  value: string | number | boolean;
  name?: string;
}

function choiceMembers(shape: t.FieldShape): ChoiceMember[] {
  if (shape.kind === 'boolean') return [{ value: false }, { value: true }];
  if (shape.kind === 'enum' || shape.kind === 'literal') {
    return (shape.values ?? []).map((value, i) => ({ value, name: shape.names?.[i] }));
  }
  if (shape.kind === 'union') return (shape.options ?? []).flatMap(choiceMembers);
  return [];
}

/** The shape whose members a select offers: the field's own, or its list items' or record values'. */
function choiceShape(field: t.SchemaField): t.FieldShape {
  const shape = getFieldShape(field);
  return (shape.kind === 'array' || shape.kind === 'record') && shape.item ? shape.item : shape;
}

/**
 * Locale key of an enum member's label: the field's `FieldMeta.enumLabels`
 * entry, else the shared `com_admin_config_enum_<value>` key (`com_admin_config_enum_empty`
 * for `''`). Members whose value can't form a key get none.
 */
export function enumLabelKey(path: string, value: string | number | boolean): string | undefined {
  const raw = String(value);
  const metaKey = getFieldMeta(path)?.enumLabels?.[raw];
  if (metaKey) return metaKey;
  if (raw === '') return 'com_admin_config_enum_empty';
  return /^[\w-]+$/.test(raw) ? `com_admin_config_enum_${raw}` : undefined;
}

function memberLabel(
  path: string,
  member: ChoiceMember,
  localize: t.LocalizeFn | undefined,
): string {
  const fallback = member.name
    ? humanize(member.name.toLowerCase())
    : humanize(String(member.value));
  const key = localize ? enumLabelKey(path, member.value) : undefined;
  if (!key || !localize) return fallback;
  const label = localize(key);
  return label === key ? fallback : label;
}

/**
 * Select options for a field (or the items of an enum list, or the values of
 * an enum-valued record), WS2:
 * enum and literal members in schema order, Off/On for a boolean member, the
 * empty member labelled "Auto", and the current value when it is not a member
 * (so the select always shows it). Labels come from `FieldMeta.enumLabels`,
 * `com_admin_config_enum_<value>` keys, then the humanized value. Members listed in
 * `FieldMeta.hiddenOptions` (aliases) are left out unless selected.
 */
export function getFieldOptions(
  field: t.SchemaField,
  localize?: t.LocalizeFn,
  value?: t.ConfigValue,
): t.SelectOption[] {
  const hidden = new Set(getFieldMeta(field.path)?.hiddenOptions ?? []);
  const current = isPrimitive(value ?? null) ? String(value) : undefined;
  const seen = new Set<string>();
  const options: t.SelectOption[] = [];
  for (const member of choiceMembers(choiceShape(field))) {
    const optionValue = String(member.value);
    if (seen.has(optionValue) || (hidden.has(optionValue) && optionValue !== current)) continue;
    seen.add(optionValue);
    options.push({ label: memberLabel(field.path, member, localize), value: optionValue });
  }
  if (current !== undefined && !seen.has(current)) options.push({ label: current, value: current });
  return options;
}

/**
 * Coerces a select's string value back to its typed member: numeric enum
 * values become numbers and `'true'`/`'false'` booleans. With a field, only
 * members of that field are converted (and an unknown number stays a number
 * when the schema accepts numbers).
 */
export function coerceEnumValue(value: string, field?: t.SchemaField): string | number | boolean {
  if (field) {
    const shape = choiceShape(field);
    const member = choiceMembers(shape).find((m) => String(m.value) === value);
    if (member) return member.value;
    return NUMERIC.test(value) && shapeAdmits(shape, 'number') ? Number(value) : value;
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (NUMERIC.test(value)) return Number(value);
  return value;
}

/** Legacy option list from a type string (no labels from meta or locale). */
export function getEnumOptions(typeString: string): t.SelectOption[] {
  const shape = parseTypeShape(typeString);
  return choiceMembers(shape)
    .filter((member) => member.value !== '' && typeof member.value !== 'boolean')
    .map((member) => ({
      label: member.name ? humanize(member.name.toLowerCase()) : humanize(String(member.value)),
      value: String(member.value),
    }));
}

/** Validation limits of a field, with `required` for keys its parent object must have. */
export function getFieldConstraints(field: t.SchemaField): t.FieldConstraints {
  return field.isOptional ? { ...field.constraints } : { ...field.constraints, required: true };
}

/** `min`/`max`/`step` attributes for a numeric input of this field. */
export function getNumberInputProps(field: t.SchemaField): {
  min?: number;
  max?: number;
  step?: number;
} {
  const constraints = field.constraints;
  if (!constraints) return {};
  const props: { min?: number; max?: number; step?: number } = {};
  if (constraints.min !== undefined) props.min = constraints.min;
  if (constraints.max !== undefined) props.max = constraints.max;
  if (constraints.step !== undefined) props.step = constraints.step;
  return props;
}

const HINT_MAX_LENGTH = 40;
const NUMBER_FORMAT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 });

/**
 * A value as short display text (WS2): option labels for enum and boolean
 * values (`temporary` → "Temporary", `true` → "On"), numbers with the field's
 * unit ("50 MB"), and short strings. Lists and objects give null.
 */
export function formatFieldValue(
  field: t.SchemaField,
  value: t.ConfigValue,
  localize: t.LocalizeFn,
): string | null {
  if (value === undefined || value === null || typeof value === 'object') return null;
  const option = getFieldOptions(field, localize).find((o) => o.value === String(value));
  if (option) return option.label;
  if (typeof value === 'boolean')
    return localize(value ? 'com_admin_config_enum_true' : 'com_admin_config_enum_false');
  const unit = getFieldMeta(field.path)?.unit;
  if (typeof value === 'number') {
    const text = NUMBER_FORMAT.format(value);
    return unit ? localize(`com_admin_config_unit_${unit}`, { value: text }) : text;
  }
  return value.length > HINT_MAX_LENGTH ? `${value.slice(0, HINT_MAX_LENGTH - 3)}…` : value;
}

/** The "(default: …)" text for a field: its schema default, else LibreChat's runtime default. */
export function getDefaultHint(
  field: t.SchemaField,
  schemaDefault: t.ConfigValue,
  localize: t.LocalizeFn,
): string | null {
  const value = schemaDefault ?? getFieldMeta(field.path)?.runtimeDefault;
  return formatFieldValue(field, value, localize);
}

export function getArrayItemType(typeString: string): string {
  const match = typeString.match(/array<(.+)>/);
  return match ? match[1] : 'string';
}

/** Whether a list's items are plain strings (or enum/literal members), so a string list editor fits. */
export function isStringLikeItemType(itemType: string): boolean {
  return isStringLikeShape(parseTypeShape(itemType));
}

/**
 * Whether a string list editor can show this list: its items are string-like,
 * or they may be strings and every current item is one (a model list without
 * `{ name }` entries).
 */
export function fitsStringList(field: t.SchemaField, value: t.ConfigValue): boolean {
  const item = getFieldShape(field).item;
  if (isStringLikeShape(item)) return true;
  return !!item && shapeAdmits(item, 'string') && (value == null || isStringList(value));
}

/** Whether a field renders as a container (nested group or collection) rather than a row. */
function isContainerField(field: t.SchemaField): boolean {
  return (
    !!field.children?.length ||
    (field.type === 'record' && field.recordValueType === 'complex') ||
    !!field.variants?.length
  );
}

function metaOrder(parentPath: string): string[] {
  const meta = getFieldMeta(parentPath);
  if (meta?.order) return meta.order;
  return meta?.groups?.flatMap((group) => group.fields) ?? [];
}

function parentOf(fields: t.SchemaField[]): string {
  const path = fields[0]?.path ?? '';
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(0, dot);
}

/**
 * Display order for sibling fields (WS2; replaces the control-type sort): keys
 * named by the parent's `FieldMeta.order` (or its `groups`) first, in that
 * order; then the rest in schema order, rows before containers (nested groups
 * and collections), so a row never looks like part of the group above it.
 */
export function orderFields(fields: t.SchemaField[], parentPath?: string): t.SchemaField[] {
  const order = metaOrder(parentPath ?? parentOf(fields));
  const rank = new Map(order.map((key, index) => [key, index]));
  const listed: t.SchemaField[] = [];
  const rows: t.SchemaField[] = [];
  const containers: t.SchemaField[] = [];
  for (const field of fields) {
    if (rank.has(field.key)) listed.push(field);
    else if (isContainerField(field)) containers.push(field);
    else rows.push(field);
  }
  listed.sort((a, b) => (rank.get(a.key) ?? 0) - (rank.get(b.key) ?? 0));
  return [...listed, ...rows, ...containers];
}

/** Splits a `union(A | B | C)` type string into its variants. Expects the
 *  ` | ` (space-pipe-space) delimiter produced by `getZodTypeName`. Handles
 *  nested parens (e.g. `union(enum(a | b) | string)`) via depth tracking. */
export function splitUnionTypes(typeString: string): string[] {
  const inner = typeString.match(/^union\((.+)\)$/)?.[1];
  if (!inner) return [];

  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '(') depth++;
    else if (inner[i] === ')') depth--;
    else if (depth === 0 && inner[i] === '|' && inner[i - 1] === ' ' && inner[i + 1] === ' ') {
      parts.push(inner.slice(start, i - 1).trim());
      start = i + 2;
    }
  }
  parts.push(inner.slice(start).trim());
  return parts;
}
