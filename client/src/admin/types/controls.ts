import type { MutableRefObject, ReactNode } from 'react';
import type {
  ConfigValue,
  ControlKind,
  ControlWidth,
  FieldUnit,
  OptionSource,
  SchemaField,
  SelectOption,
} from './config';
import type { ClearHandler, CollectionRenderFields } from './fields';
import type { ProvenanceSource } from './values';

/** One branch of a variant field as the variant control reads it (from WS2's `SchemaField.variants`). */
export interface FieldVariant {
  /** Stable key of the branch (the discriminator value, or the branch index). */
  key: string;
  /** Display label; falls back to the humanized `key`. */
  label?: string;
  /** Value of the discriminator field that selects this branch. */
  discriminatorValue?: string;
  fields: SchemaField[];
}

/** What "Default" stands for in a control: the value in effect without the edit target's own value. */
export interface FieldDefault {
  /** The edit target holds its own value (an override or a pending edit). */
  hasOwnValue: boolean;
  /** The value in effect when the target has no own value. */
  value: ConfigValue;
  /** Which layer that value comes from (labels the Default option). */
  source: ProvenanceSource;
  /** The value is Global's (`endpoints.all`), which takes precedence over this field (D11). */
  fromGlobal?: boolean;
}

/** Inputs of `resolveControlKind` (renderer/kinds.ts). */
export interface ControlKindInput {
  field: SchemaField;
  /** Data or schema path, used for the `FieldMeta.control` override. */
  path: string;
  /** Current value; picks a textarea for multi-line strings. */
  value?: ConfigValue;
}

/** Everything one field control needs, shared by full rows and inline entry rows. */
export interface FieldControlProps {
  field: SchemaField;
  /** Data path of the value (meta lookup, ids). */
  path: string;
  id: string;
  label: string;
  value: ConfigValue;
  onChange: (value: ConfigValue) => void;
  /** Return to "Default": remove the target's own value. */
  onClear: ClearHandler;
  fieldDefault: FieldDefault;
  disabled?: boolean;
  required?: boolean;
  /** Masked display of a stored secret (`<key>Preview` companion). */
  secretPreview?: string | null;
  /** The secret has a queued replacement (see `SecretFieldProps.hasPendingEdit`). */
  hasPendingEdit?: boolean;
  /** Abandons a secret replacement without recording an edit. */
  onCancelSecret?: () => void;
  /** Record keys the layer beneath sets: their values can change, but they cannot be removed (D3). */
  lockedKeys?: ReadonlySet<string>;
  editSessionId?: number;
  'aria-describedby'?: string;
}

/** A control kind together with the props that only some kinds use. */
export interface ResolvedControl {
  kind: ControlKind;
  unit?: FieldUnit;
  width?: ControlWidth;
  optionSource?: OptionSource;
}

export type TriStateChoice = 'default' | 'on' | 'off';

export interface TriStateFieldProps {
  id: string;
  /** The target's own value; `undefined` while it uses the default. */
  value: boolean | undefined;
  /** Value in effect while `value` is undefined (labels the Default option). */
  defaultValue?: boolean;
  defaultSource?: ProvenanceSource;
  /** The default is Global's value (D11), so the choice reads "Global (On)". */
  defaultFromGlobal?: boolean;
  /** Label of the Default choice when no default value is known (else "Not set (LibreChat decides)"). */
  unsetLabel?: string;
  onChange: (value: boolean | undefined) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

/** `boolean | string[]` (e.g. spec `skills`): Off, All, or Only these. */
export interface BoolOrListFieldProps {
  id: string;
  value: ConfigValue;
  onChange: (value: ConfigValue) => void;
  /** Return to the default (no own value). Omit for a required field. */
  onClear?: ClearHandler;
  defaultLabel?: string;
  disabled?: boolean;
  options?: SelectOption[];
  itemLabel?: string;
  'aria-label'?: string;
}

/** Scalar member of a `ScalarUnionField`. */
export type ScalarKind = 'boolean' | 'number' | 'string' | 'list';

export interface ScalarUnionFieldProps {
  id: string;
  value: ConfigValue;
  /** Member types in schema order; the first that fits the value is shown. */
  kinds: ScalarKind[];
  /** Enum members of the union (`boolean | enum(...)`), offered with Off/On. */
  options?: SelectOption[];
  onChange: (value: ConfigValue) => void;
  onClear?: ClearHandler;
  defaultLabel?: string;
  disabled?: boolean;
  unit?: FieldUnit;
  'aria-label'?: string;
}

export interface LiteralFieldProps {
  id: string;
  /** The only value the schema accepts. */
  literal: string | number | boolean;
  value: ConfigValue;
  onChange: (value: ConfigValue) => void;
  disabled?: boolean;
  /** Label of the checkbox (e.g. "Use native Anthropic client"); defaults to the literal. */
  label?: string;
  'aria-label'?: string;
}

export interface MultiEnumOption extends SelectOption {
  description?: string;
}

export interface MultiEnumFieldProps {
  id: string;
  value: string[] | undefined;
  options: MultiEnumOption[];
  /** Emits `undefined` when nothing is selected and `clearOnEmpty` is set. */
  onChange: (value: string[] | undefined) => void;
  /** An empty selection means "unset" (true for optional fields). */
  clearOnEmpty?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
}

export interface RefSelectFieldProps {
  id: string;
  value: string | undefined;
  source?: OptionSource;
  /** Extra options merged before the source's (e.g. `current_model`). */
  extraOptions?: SelectOption[];
  onChange: (value: string) => void;
  /** Called when the input is cleared (remove the own value). */
  onClear?: ClearHandler;
  placeholder?: string;
  disabled?: boolean;
  width?: ControlWidth;
  'aria-label'?: string;
}

/** A model list item: a bare id or `{ name, description }`. */
export type ModelItem = string | { name: string; description?: string };

export interface ModelListFieldProps {
  id: string;
  value: ConfigValue;
  /** Models used while the list is unset (provider defaults), shown read-only. */
  defaults?: string[];
  onChange: (value: ConfigValue) => void;
  /** Return to "Use provider defaults"; called instead of saving `[]`. */
  onClear: ClearHandler;
  disabled?: boolean;
  /** The list must keep at least one model (custom endpoints). */
  required?: boolean;
  'aria-label'?: string;
}

/** Keys a `VariantField` asks to hide in the edit target when switching branches. */
export interface VariantFieldProps {
  id: string;
  value: ConfigValue;
  variants: FieldVariant[];
  /** Field whose value selects the branch (discriminated unions). */
  discriminator?: string;
  /** Keys present in a lower layer (librechat.yaml, Base); switching away tombstones them. */
  inheritedKeys?: string[];
  onChange: (value: ConfigValue) => void;
  /** Called with the lower-layer keys to tombstone when the chosen branch drops them. */
  onTombstone?: (keys: string[]) => void;
  renderFields: (
    fields: SchemaField[],
    value: ConfigValue,
    onChange: (key: string, value: ConfigValue) => void,
  ) => ReactNode;
  disabled?: boolean;
  'aria-label'?: string;
}

/** Ghost of an entry deleted in this edit session, shown with Undo until Save (D9). */
export interface PendingRemoval<K> {
  key: K;
  /** Position in the list when it was removed. */
  index: number;
  value: ConfigValue;
  label: string;
}

/** An MCP server pending deletion, with the edits made under it before Delete (restored by Undo). */
export interface McpRemoval extends PendingRemoval<string> {
  edits: Array<[string, ConfigValue]>;
}

/** A row of a list with pending deletions: an entry, or a deleted entry shown with Undo. */
export type RemovalRow<T> =
  | { kind: 'entry'; key: string; value: T }
  | { kind: 'removed'; ghost: McpRemoval };

/** Options of `useDraftValue`. */
export interface DraftValueOptions<T> {
  value: T;
  /** Receives the draft; `false` rejects it (it stays local), `'reset'` shows the current value again. */
  onCommit: (value: T) => boolean | 'reset' | void;
  /** Debounce in ms; `0` commits only on `commit()`. */
  delay?: number;
  /** Whether a draft may commit on the timer (e.g. skip `''` until blur). */
  autoCommit?: (value: T) => boolean;
}

/** Result of `useDraftValue`. */
export interface DraftValue<T> {
  draft: T;
  setDraft: (value: T) => void;
  /** Commits the draft now (blur, Enter). */
  commit: () => void;
}

/** Options of `useListKeys`. */
export interface ListKeysOptions<T> {
  items: readonly T[];
  /** Identity used to keep keys when items are added or removed (e.g. an entry name). */
  identity: (item: T) => string | null;
  prefix?: string;
}

/** Props of `InlineFieldRenderer`: the fields of one collection entry (or nested object in it). */
export interface InlineFieldRendererProps {
  fields: SchemaField[];
  parentValue: ConfigValue;
  /** Data path of the object holding the fields (e.g. `endpoints.custom.3`); ids derive from it. */
  parentPath: string;
  /** Writes one key of the object: `onChange(key, value)`; `undefined` removes the key. */
  onChange: (path: string, value: ConfigValue) => void;
  disabled?: boolean;
  addFieldTriggerRef?: MutableRefObject<(() => void) | null>;
  onHiddenFieldsChange?: (hasHidden: boolean) => void;
  editSessionId?: number;
  /** Mark non-optional fields as required (*). */
  showRequired?: boolean;
}

/** Props of one inline entry field row. */
export interface InlineFieldProps {
  field: SchemaField;
  parentValue: ConfigValue;
  parentPath: string;
  onChange: (path: string, value: ConfigValue) => void;
  disabled?: boolean;
  collectionRenderOverrides?: Record<string, CollectionRenderFields>;
  showRequired?: boolean;
  editSessionId?: number;
}

/** Props of the notice shown when a profile or admin override owns a whole list (D2). */
export interface ListOwnershipNoticeProps {
  /** The open target is a profile (the list replaces the one inherited from Base). */
  isScope: boolean;
  /** Reverts the whole list (resets the override); absent when that isn't possible here. */
  onRevert?: () => void;
}

/** Props of the NestedGroup wrappers around array-of-object and record-of-object fields. */
export interface CollectionGroupProps {
  fieldId: string;
  fieldLabel: string;
  /** Data path of the collection. */
  path: string;
  currentValue: ConfigValue;
  field: SchemaField;
  onChange: (path: string, value: ConfigValue) => void;
  disabled?: boolean;
  isSoleField?: boolean;
  editSessionId?: number;
  /** Shown above the entries (e.g. D2: this list overrides librechat.yaml). */
  notice?: ReactNode;
}
