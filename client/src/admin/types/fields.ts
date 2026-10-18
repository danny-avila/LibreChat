import type { ReactNode } from 'react';
import type React from 'react';
import type {
  ConfigValue,
  SchemaField,
  SelectOption,
  KeyValuePair,
  KVValueType,
  ControlWidth,
  ControlKind,
  FieldUnit,
} from './config';

/**
 * Returns a field to "Default" (removes the edit target's own value). Returns
 * `false` when there was nothing of the target's own to remove (the value
 * comes from librechat.yaml or Base), so the control can say so (D3).
 */
export type ClearHandler = () => boolean | void;

export interface SelectFieldProps {
  id: string;
  /** Selected value; `undefined` (or `''` when `''` is not an option) means unset. */
  value: string | undefined;
  options: SelectOption[];
  onChange: (value: string) => void;
  /** Offers a leading "Default (…)" option that calls this (no own value). */
  onClear?: ClearHandler;
  /** Label of the Default option, e.g. "Default (Structured)". */
  defaultLabel?: string;
  disabled?: boolean;
  placeholder?: string;
  width?: ControlWidth;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

export interface KeyValueFieldProps {
  id: string;
  pairs: KeyValuePair[];
  onChange: (pairs: KeyValuePair[]) => void;
  /** Called instead of emitting `[]` when the last row is removed (remove the own value). */
  onClear?: ClearHandler;
  disabled?: boolean;
  valueTypes?: KVValueType[];
  /** Allowed values (a record of enums): the value becomes a select. */
  valueOptions?: SelectOption[];
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  /** Keys the layer beneath sets (librechat.yaml, Base): editable values, but no rename or delete (D3). */
  lockedKeys?: ReadonlySet<string>;
  'aria-label'?: string;
}

export interface TextFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** The row already shows a pipeline error for this field: the local "Required" stays unsaid. */
  hasRowError?: boolean;
  /** Called when the input is cleared (remove the own value) instead of emitting `''`. */
  onClear?: ClearHandler;
  /** A cleared required field shows an error and is not committed. */
  required?: boolean;
  /** Returns an error message to reject a non-empty value (it stays local). */
  validate?: (value: string) => string | null;
  /** Whitespace is the value (a stop sequence): only empty text counts as cleared, not blank text. */
  keepsWhitespace?: boolean;
  placeholder?: string;
  disabled?: boolean;
  width?: ControlWidth;
  /** Id of a `<datalist>` of suggestions (free entry stays possible). */
  list?: string;
  type?: 'text' | 'url' | 'email';
  'aria-label'?: string;
  'aria-describedby'?: string;
}

export interface SecretFieldProps {
  id: string;
  /** Pending replacement value; empty string when no replacement is typed. */
  value: string;
  /** Masked display of the stored secret (e.g. `sk-mist...4321`). */
  maskedValue: string;
  onChange: (value: string) => void;
  /** Invoked when the admin abandons the replace flow. */
  onCancel: () => void;
  /**
   * True when the field has a queued edit for this path (including an
   * explicitly cleared, empty-string replacement). Remounting this
   * component (e.g. switching config tabs and back) resets its local
   * replace-mode state, so an empty queued edit would otherwise render
   * as the untouched masked secret and hide a save that will clear it.
   */
  hasPendingEdit?: boolean;
  /** Removes the target's own stored secret (shown only when it owns one). */
  onRemove?: () => void;
  disabled?: boolean;
  width?: ControlWidth;
  'aria-label'?: string;
}

/** A secret typed in plain (no stored masked preview): a password input with reveal. */
export interface SecretInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** The row already shows a pipeline error for this field: the local "Required" stays unsaid. */
  hasRowError?: boolean;
  onClear?: ClearHandler;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  width?: ControlWidth;
  /** Take focus when shown: the person just opened this field to replace a value. */
  focusOnMount?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

export interface TextareaFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** The row already shows a pipeline error for this field: the local "Required" stays unsaid. */
  hasRowError?: boolean;
  /** Called when the text is cleared (remove the own value) instead of emitting `''`. */
  onClear?: ClearHandler;
  required?: boolean;
  /** Returns an error message to reject a non-empty value (it stays local). */
  validate?: (value: string) => string | null;
  /** Whitespace is the value (a stop sequence): only empty text counts as cleared, not blank text. */
  keepsWhitespace?: boolean;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  width?: ControlWidth;
  monospace?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

export interface ToggleFieldProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

export interface NumberFieldProps {
  id: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  /** Called when the input is cleared (remove the own value). */
  onClear?: ClearHandler;
  /** A cleared required field shows an error and is not committed. */
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  /** Defaults to 1 for integers and 0.01 when `max <= 1`, else any. */
  step?: number;
  int?: boolean;
  /** Unit suffix shown inside the input (the value is stored in this unit). */
  unit?: FieldUnit;
  width?: ControlWidth;
  /** The row already shows the save pipeline's error for the committed value; the control shows none of its own. */
  hasRowError?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

/** A value shown as text where it can't be edited here (read-only, gated or no permission). */
export interface StaticFieldProps {
  id: string;
  field: SchemaField;
  kind: ControlKind;
  value: ConfigValue;
  /** What applies while the value is unset (the default or the inherited value). */
  fallback?: ConfigValue;
  /** Masked display of a stored secret (already redacted by the backend), shown as-is. */
  secretPreview?: string | null;
  unit?: FieldUnit;
  width?: ControlWidth;
}

export interface NumberListFieldProps {
  id: string;
  values: number[];
  onChange: (values: number[]) => void;
  disabled?: boolean;
  placeholder?: string;
  itemLabel?: string;
}

export interface ListFieldProps {
  id: string;
  values: string[];
  onChange: (values: string[]) => void;
  /** Called instead of emitting `[]` when the last item is removed (remove the own value). */
  onClear?: ClearHandler;
  disabled?: boolean;
  placeholder?: string;
  itemLabel?: string;
  variant?: 'inline-edit' | 'display';
  options?: SelectOption[];
  /** Items are multi-line (each item gets a textarea). */
  multiline?: boolean;
  /** Items are whitespace-significant (stop sequences): a blank item is kept, only an empty one is dropped. */
  keepsWhitespace?: boolean;
  width?: ControlWidth;
  'aria-label'?: string;
}

export interface CodeFieldProps {
  id: string;
  value: ConfigValue;
  onChange: (value: ConfigValue) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

export interface ArrayObjectFieldProps {
  id: string;
  /** Data path of the array (`endpoints.custom`); entries get `${path}.${index}`. */
  path?: string;
  value: ConfigValue;
  fields: SchemaField[];
  onChange: (value: ConfigValue) => void;
  /** Per-entry change callback. When provided, individual entry edits use
   *  this instead of replacing the entire array via `onChange`. */
  onEntryChange?: (index: number, value: ConfigValue) => void;
  disabled?: boolean;
  /** Hide the bottom "Add entry" button (e.g. when add is in the section header). */
  hideAddButton?: boolean;
  /** Ref that gets populated with a function to add a new entry. */
  addTriggerRef?: React.MutableRefObject<(() => void) | null>;
  renderFields: CollectionRenderFields;
  /** When set, each entry card gets an id of `{entryIdPrefix}-{index}` for TOC scroll targets. */
  entryIdPrefix?: string;
  /** See `SingleFieldRendererProps.editSessionId`. Forwarded to `renderFields`. */
  editSessionId?: number;
  /** Card title; defaults to the entry's name/label/group, else "Entry N". */
  getEntryTitle?: (item: ConfigValue, index: number) => string | null;
  /** Collapsed-row summary for an entry. */
  renderSummary?: (item: ConfigValue, index: number) => ReactNode;
  /** Offer move up/down on each card (order matters, e.g. model specs). */
  reorderable?: boolean;
  /** Text shown when the list is empty. */
  emptyLabel?: string;
  /** Entries that cannot be deleted (e.g. defined in librechat.yaml, D1). */
  isEntryLocked?: (item: ConfigValue, index: number) => boolean;
}

export interface RecordObjectFieldProps {
  id: string;
  /** Data path of the record (`mcpServers`); entries get `${path}.${key}`. */
  path?: string;
  value: ConfigValue;
  fields: SchemaField[];
  onChange: (value: ConfigValue) => void;
  disabled?: boolean;
  allowPrimitiveValues?: boolean;
  /** Ref that gets populated with a function to open the add-key input. */
  addTriggerRef?: React.MutableRefObject<(() => void) | null>;
  renderFields: CollectionRenderFields;
  /** See `SingleFieldRendererProps.editSessionId`. Forwarded to `renderFields`. */
  editSessionId?: number;
  /** Keys the layer beneath defines (D3): their values can change, but they can't be renamed or removed. */
  lockedKeys?: ReadonlySet<string>;
}

export type CollectionRenderFields = (
  fields: SchemaField[],
  parentValue: ConfigValue,
  parentPath: string,
  onChange: (path: string, value: ConfigValue) => void,
  /** Optional ref populated with a trigger to open the "add field" dropdown. */
  addFieldTriggerRef?: React.MutableRefObject<(() => void) | null>,
  /** See `SingleFieldRendererProps.editSessionId`. */
  editSessionId?: number,
  /** Render the entry's fields read-only. */
  disabled?: boolean,
) => React.ReactNode;

/** Words a collapsed entry's summary uses; `type` labels a transport id ("Streamable HTTP"). */
export interface EntrySummaryLabels {
  enabled: string;
  disabled: string;
  type?: (value: string) => string;
}

/** What an entry card's header marks (a keyed list entry, by identity). */
export interface EntryMarkers {
  /** The edit target's stored override adds or changes the entry. */
  overridden: boolean;
  /** The layer beneath (librechat.yaml in Base, Base in a profile) doesn't define the entry: the target added it. */
  added?: boolean;
  /** The entry differs from its saved value (unsaved edits). */
  edited: boolean;
}

export interface ObjectEntryCardProps {
  id?: string;
  /** Data path of the entry (`endpoints.custom.3`, `mcpServers.github`); field ids derive from it. */
  dataPath?: string;
  entryKey: string;
  fields: SchemaField[];
  value: ConfigValue;
  onValueChange: (value: ConfigValue) => void;
  onRemove?: () => void;
  onRename?: (newKey: string) => void;
  /** Why the entry can't be renamed or removed, shown in place of those actions. */
  lockedNote?: string;
  /** Renders the entry as pending deletion (struck title, Undo) until Save. */
  pendingRemoval?: boolean;
  onUndoRemove?: () => void;
  /** Moves focus to Undo when the entry was just deleted with the keyboard. */
  focusUndo?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /** Added in this session: marked "New", expanded and scrolled into view. */
  isNew?: boolean;
  /** Header markers: the edit target overrides the entry, or it has unsaved edits. */
  markers?: EntryMarkers;
  /** Collapsed-row summary; `null` hides it. Defaults to the entry's type/url/label. */
  summary?: ReactNode;
  disabled?: boolean;
  /** Expanded on mount, or as soon as it turns true unless the admin toggled the card. */
  defaultExpanded?: boolean;
  renderFields: CollectionRenderFields;
  /** See `SingleFieldRendererProps.editSessionId`. Forwarded to `renderFields`. */
  editSessionId?: number;
}

export interface SwitchObjectFieldProps {
  id: string;
  value: ConfigValue;
  onChange: (value: ConfigValue) => void;
  disabled?: boolean;
  children: ReactNode;
  'aria-label'?: string;
}

export interface TextRecordFieldProps {
  id: string;
  value: ConfigValue;
  onChange: (value: ConfigValue) => void;
  disabled?: boolean;
  variant: 'record' | 'array';
  'aria-label'?: string;
}

export interface ListRecordFieldProps {
  id: string;
  value: ConfigValue;
  onChange: (value: ConfigValue) => void;
  disabled?: boolean;
  'aria-label'?: string;
}
