/** JSON-compatible value for config entries — replaces bare `unknown` in config contexts. */
export type ConfigValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ConfigValue[]
  | { [key: string]: ConfigValue };

/** Flattened config: dot-path keys to leaf values. Produced by `flattenObject()`. */
export type FlatConfigMap = Record<string, ConfigValue>;

/** An object-shaped config value (a section, entry or record), keyed by setting name. */
export type ConfigRecord = { [key: string]: ConfigValue };

export type ControlType =
  | 'toggle'
  | 'select'
  | 'text'
  | 'number'
  | 'array'
  | 'array-object'
  | 'object'
  | 'record'
  | 'record-object'
  | 'switch-object'
  | 'text-record'
  | 'list-record'
  | 'code';

/**
 * A schema field as sent to the client. `type` is the compact wire encoding of
 * the field's shape (`getFieldShape` parses it); flags that are `false` and
 * properties that are unset are left out of the payload (WS2).
 */
export interface SchemaField {
  path: string;
  key: string;
  type: string;
  isOptional: boolean;
  isNullable?: boolean;
  isArray?: boolean;
  isObject?: boolean;
  description?: string;
  children?: SchemaField[];
  depth: number;
  recordValueType?: 'primitive' | 'complex';
  recordValueAllowsPrimitive?: boolean;
  recordValueKVTypes?: KVValueType[];
  /** Wire type of a primitive record's values when they are choices (`enum(provider | text | none)`). */
  itemType?: string;
  /** The alternatives of a union of objects or discriminated union; `children` holds them merged. */
  variants?: SchemaVariant[];
  /** The key whose literal value selects the variant (`type` for `summarization.trigger`). */
  discriminator?: string;
  /** Validation limits taken from the Zod checks. */
  constraints?: FieldConstraints;
}

/** One alternative of a variant field (WS2). */
export interface SchemaVariant {
  /** The discriminator value, else the first key unique to this variant, else its index. */
  key: string;
  fields: SchemaField[];
}

/**
 * Limits from a field's Zod checks (WS2). `required` marks a key that must be
 * present whenever its parent object is configured.
 */
export interface FieldConstraints {
  min?: number;
  max?: number;
  /** `min`/`max` exclude the bound itself (`.positive()`, `.lt()`). */
  minExclusive?: boolean;
  maxExclusive?: boolean;
  int?: boolean;
  /** Input step: 1 for integers, 0.01 for fractions capped at 1, 0.1 for fractions capped at 10. */
  step?: number;
  minLength?: number;
  maxLength?: number;
  url?: boolean;
  email?: boolean;
  regex?: string;
  required?: boolean;
}

/** Structural kind of a schema node once optional/default/effects wrappers are removed (WS2). */
export type SchemaKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'literal'
  | 'null'
  | 'undefined'
  | 'object'
  | 'array'
  | 'record'
  | 'union'
  | 'variant'
  | 'any'
  | 'unknown';

/** Parsed shape of a schema node, which `getControlType` maps to a control (WS2). */
export interface FieldShape {
  kind: SchemaKind;
  /** `enum`/`literal` members, typed (numeric native enums give numbers). */
  values?: Array<string | number | boolean>;
  /** Names of numeric native-enum members, aligned with `values` (`OFF` for 0). */
  names?: string[];
  /** Array element or record value. */
  item?: FieldShape;
  /** Union members other than `null`/`undefined`. */
  options?: FieldShape[];
}

/** One entry of a Zod v3 `_def.checks` list (number and string checks). */
export interface ZodCheck {
  kind: string;
  value?: number | string | bigint;
  inclusive?: boolean;
  regex?: RegExp;
}

export interface ZodDef {
  typeName?: string;
  description?: string;
  options?: ZodSchemaLike[];
  discriminator?: string;
  checks?: ZodCheck[];
  valueType?: ZodSchemaLike;
  /** A Zod default's factory; its result is JSON-like config data. */
  defaultValue?: () => unknown;
  innerType?: ZodSchemaLike;
  schema?: ZodSchemaLike;
  type?: ZodSchemaLike;
  left?: ZodSchemaLike;
  right?: ZodSchemaLike;
  getter?: () => ZodSchemaLike;
  out?: ZodSchemaLike;
  values?: string[] | Record<string, string | number>;
  value?: string | number | boolean;
}

export interface ZodSchemaLike {
  _def?: ZodDef;
  shape?: Record<string, ZodSchemaLike>;
}

export interface FieldValidationError {
  fieldPath: string;
  error: string;
}

export interface SelectOption {
  label: string;
  value: string;
  /** Shown but not selectable (e.g. a choice only librechat.yaml can make). */
  disabled?: boolean;
}

export type KVValueType = 'string' | 'number' | 'boolean' | 'json';

export interface KeyValuePair {
  [k: string]: string | KVValueType | undefined;
  key: string;
  value: string;
  valueType?: KVValueType;
}

/** Why a config section or field cannot be edited in the panel. */
export type ReadOnlyReason = 'baseOnly' | 'yamlOnly';

/**
 * Why a pending change is not stored:
 * - `ReadOnlyReason`: the section (or YAML-managed field) is read only from librechat.yaml
 * - `permission`: a role permission, managed on the roles page
 * - `dedicated`: a section with its own settings API (e.g. the Langfuse connection)
 * - `yamlValue`: clearing a value that only librechat.yaml sets (there is no override to remove)
 * - `empty`: an imported value that is blank or empty
 * - `notStored`: sent, but LibreChat's admin API did not store it
 * - `notApplied`: stored, but the effective configuration still shows the lower layer's value
 * - `yamlMerged`: a key removed in the panel that LibreChat merges back from the layer beneath
 * - `baseScope`: applies to everyone, so it can only be set in Base, not in a profile
 */
export type SkipReason =
  | ReadOnlyReason
  | 'permission'
  | 'dedicated'
  | 'yamlValue'
  | 'empty'
  | 'notStored'
  | 'notApplied'
  | 'yamlMerged'
  | 'baseScope'
  | 'inheritedValue'
  | 'inheritedMerged';

/** A record key the admin API cannot store, and the dot-path of the object holding it. */
export interface UnsafeConfigKey {
  path: string;
  key: string;
}

/** Whitespace-only text: a blank key (with the dot-path of the object holding it) or a blank string at `path`. */
export interface BlankConfigText {
  path: string;
  key?: string;
}

/** Control vocabulary for `FieldMeta.control` (WS2 maps kinds; WS3 adds one per control it ships). */
export type ControlKind =
  | ControlType
  | 'textarea'
  | 'secret'
  | 'tristate'
  | 'bool-or-list'
  | 'variant'
  | 'scalar-union'
  | 'literal'
  | 'multi-enum'
  | 'ref-select'
  | 'model-list';

/** Display unit for numeric fields (WS2). */
export type FieldUnit = 'MB' | 'ms' | 's' | 'minutes' | 'px' | 'hours' | 'credits';

/** Control width token (WS6 applies it through `FieldMeta.width`). */
export type ControlWidth = 'S' | 'M' | 'L';

/** A named group of sibling fields, optionally collapsed behind a toggle field (WS2). */
export interface FieldMetaGroup {
  key: string;
  fields: string[];
  toggle?: string;
}

/** Where a reference select gets its options (WS9 implements `useOptionSources`; WS3 consumes it). */
export type OptionSource = 'endpoints' | `models:${string}` | 'mcpServers' | 'specGroups' | 'tools';

/** Options of an `OptionSource` (WS9). */
export interface OptionSourceResult {
  options: SelectOption[];
  isLoading: boolean;
}

/** Per-field metadata the schema cannot express (WS2 registry; area workstreams contribute entries). */
export interface FieldMeta {
  labelKey?: string;
  descriptionKey?: string;
  docsUrl?: string;
  unit?: FieldUnit;
  /** Effective value LibreChat applies when the field is unset and the schema has no default. */
  runtimeDefault?: ConfigValue;
  /** Label of the Default choice when an unset value falls back to another setting ("Same as File strategy"). */
  defaultLabelKey?: string;
  /** Enum value → locale key of its display label (else `com_admin_config_enum_<value>` is tried). */
  enumLabels?: Record<string, string>;
  /** Enum values left out of selects unless currently set (aliases such as `d` for `day`). */
  hiddenOptions?: string[];
  /** Child keys in display order. */
  order?: string[];
  groups?: FieldMetaGroup[];
  control?: ControlKind;
  optionSource?: OptionSource;
  multiline?: boolean;
  width?: ControlWidth;
  secret?: boolean;
  hidden?: boolean;
  baseOnly?: boolean;
  yamlOnly?: boolean;
  permission?: boolean;
  confirmChange?: boolean;
  /** An empty list is a value LibreChat reads as "none" (capabilities left out are unavailable), not "unset". */
  emptyListIsValue?: boolean;
}

/**
 * Field metadata keyed by index-free path. `[]` stands for any array element
 * and `{}` for any record key; both `endpoints.custom[].name` and
 * `endpoints.custom.[].name` are accepted (WS2).
 */
export type FieldMetaRegistry = Record<string, FieldMeta>;

/** A node of the compiled metadata registry: one path segment (WS2). */
export interface FieldMetaNode {
  meta?: FieldMeta;
  children: Map<string, FieldMetaNode>;
}
