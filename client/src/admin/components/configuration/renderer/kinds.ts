import type * as t from '~/admin/types';
import { getControlType, getFieldOptions, splitUnionTypes } from '../controls';
import { SECRET_CONFIG_KEYS } from '~/admin/constants';
import { getFieldMeta } from '../meta';

const MULTILINE_KEY =
  /^(prompt|promptPrefix|instructions|additional_instructions|content|context|description|greeting|system|customWelcome|modalContent)$|(Prompt|PromptTemplate|Instructions)$/;
const SECRET_KEY = /ApiKey$/;
const SECRET_PATH = /(^|\.)apiKey\.key$/;
const LONG_TEXT_KEY = /(URL|Url|url|Uri|uri|Endpoint|endpoint)$/;
const SCALAR_MEMBERS: ReadonlySet<string> = new Set(['boolean', 'number', 'string']);

/** Metadata for a data path, falling back to the field's schema path. */
export function fieldMetaFor(field: t.SchemaField, path: string): t.FieldMeta | undefined {
  return getFieldMeta(path) ?? getFieldMeta(field.path);
}

export function isSecretField(field: t.SchemaField, path: string, meta?: t.FieldMeta): boolean {
  if (meta?.secret != null) return meta.secret;
  return SECRET_CONFIG_KEYS.has(field.key) || SECRET_KEY.test(field.key) || SECRET_PATH.test(path);
}

/** Whether a string control should be a textarea (prompts, descriptions, values with newlines). */
export function isMultilineField(
  field: t.SchemaField,
  value: t.ConfigValue,
  meta?: t.FieldMeta,
): boolean {
  if (typeof value === 'string' && value.includes('\n')) return true;
  if (meta?.multiline != null) return meta.multiline;
  return MULTILINE_KEY.test(field.key);
}

/** Literal value of a `literal(...)` type string, or undefined. */
export function literalValue(type: string): string | number | boolean | undefined {
  const match = /^literal\((.+)\)$/.exec(type);
  if (!match) return undefined;
  try {
    const parsed: t.ConfigValue = JSON.parse(match[1]);
    return typeof parsed === 'object' || parsed == null ? undefined : parsed;
  } catch {
    return match[1];
  }
}

/** Scalar members of a union type, in schema order, when every member is a scalar, an enum or `array<string>`. */
export function scalarUnionKinds(type: string): t.ScalarKind[] | null {
  const members = splitUnionTypes(type);
  if (members.length < 2) return null;
  const kinds: t.ScalarKind[] = [];
  for (const member of members) {
    if (SCALAR_MEMBERS.has(member)) kinds.push(member as t.ScalarKind);
    else if (member === 'array<string>') kinds.push('list');
    else if (!member.startsWith('enum(') && member !== 'null') return null;
  }
  return kinds.length > 0 ? kinds : null;
}

/**
 * The renderer's control for a field: WS2's schema mapping (`getControlType`,
 * which applies the schema path's `FieldMeta.control`), plus the choices only
 * the renderer makes: an optional boolean becomes the Default/On/Off
 * tri-state, a reference field a ref select, and free text a secret input or
 * a textarea for keys, prompts and values with newlines.
 */
function inferKind(
  field: t.SchemaField,
  path: string,
  value: t.ConfigValue,
  meta?: t.FieldMeta,
): t.ControlKind {
  const kind = getControlType(field);
  if (meta?.optionSource && (kind === 'text' || kind === 'select')) return 'ref-select';
  if (kind === 'toggle' && field.type === 'boolean' && field.isOptional) return 'tristate';
  if (kind !== 'text') return kind;
  if (isSecretField(field, path, meta)) return 'secret';
  if (isMultilineField(field, value, meta)) return 'textarea';
  return kind;
}

function inferWidth(field: t.SchemaField, kind: t.ControlKind): t.ControlWidth | undefined {
  if (kind === 'textarea' || kind === 'model-list') return 'L';
  if ((kind === 'text' || kind === 'ref-select') && LONG_TEXT_KEY.test(field.key)) return 'L';
  return undefined;
}

/** The control for a field: the data path's `FieldMeta.control` override, else the kind inferred from its schema. */
export function resolveControl({ field, path, value }: t.ControlKindInput): t.ResolvedControl {
  const meta = fieldMetaFor(field, path);
  const kind = meta?.control ?? inferKind(field, path, value, meta);
  return {
    kind,
    unit: meta?.unit,
    width: meta?.width ?? inferWidth(field, kind),
    optionSource: meta?.optionSource,
  };
}

/** A select's options (WS2 labels from meta and locale), plus a value → label map. */
export function fieldOptions(
  field: t.SchemaField,
  localize: t.LocalizeFn,
  value?: t.ConfigValue,
): { options: t.SelectOption[]; labels: Record<string, string> } {
  const options = getFieldOptions(field, localize, value);
  return { options, labels: Object.fromEntries(options.map((o) => [o.value, o.label])) };
}

/** Options of the enum member of a union field (`string | enum(…)`), labelled like the field's own. */
export function enumMemberOptions(
  field: t.SchemaField,
  localize: t.LocalizeFn,
): t.SelectOption[] | undefined {
  const member = splitUnionTypes(field.type).find((type) => type.startsWith('enum('));
  if (!member) return undefined;
  return getFieldOptions({ ...field, type: member }, localize);
}

/** `remaining_tokens` → "Remaining tokens". */
function humanizeKey(key: string): string {
  const text = key.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The branches of a variant field (WS2 `SchemaField.variants`) as the variant
 * control reads them: a discriminated union's branch key is its discriminator
 * value, and labels come from `com_admin_config_enum_<key>` when translated.
 */
export function fieldVariants(
  field: t.SchemaField,
  localize: t.LocalizeFn,
): { variants: t.FieldVariant[]; discriminator?: string } {
  const discriminator = field.discriminator;
  const enumLabels = getFieldMeta(field.path)?.enumLabels;
  const variants = (field.variants ?? []).map((variant): t.FieldVariant => {
    const labelKey = enumLabels?.[variant.key] ?? `com_admin_config_enum_${variant.key}`;
    const label = localize(labelKey);
    return {
      key: variant.key,
      label: label === labelKey ? humanizeKey(variant.key) : label,
      discriminatorValue: discriminator ? variant.key : undefined,
      fields: variant.fields,
    };
  });
  return { variants, discriminator };
}
