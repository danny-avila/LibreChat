import { useRef, useState, useLayoutEffect } from 'react';
import type { ReactNode } from 'react';
import type * as t from '~/admin/types';
import { useDraftValue, useListKeys, useLocalize } from '~/admin/hooks';
import { AddItemButton, TrashButton } from '~/admin/components/shared';
import { cn, isBlankText, isUnsafeConfigKey } from '~/admin/utils';
import { BLOCK_UNSAFE_CONFIG_KEYS } from '~/admin/constants';
import { TextareaField } from './TextareaField';
import { SelectField } from './SelectField';
import { INPUT_CLASSES } from './display';
import { FieldNotice } from './Notice';

const DEFAULT_TYPES: t.KVValueType[] = ['string', 'number', 'boolean'];
const TYPE_LABEL_KEYS: Record<t.KVValueType, string> = {
  string: 'com_admin_config_ctl_kv_type_text',
  number: 'com_admin_config_ctl_kv_type_number',
  boolean: 'com_admin_config_ctl_kv_type_boolean',
  json: 'com_admin_config_ctl_kv_type_json',
};
const NUMERIC = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/;
const pairKey = (pair: t.KeyValuePair) => pair.key;

/** Value type for typed text: numbers, true/false and JSON objects/arrays are recognized. */
export function inferTypeFromText(raw: string, allowed: readonly t.KVValueType[]): t.KVValueType {
  const trimmed = raw.trim();
  if (allowed.includes('number') && NUMERIC.test(trimmed)) return 'number';
  if (allowed.includes('boolean') && (trimmed === 'true' || trimmed === 'false')) return 'boolean';
  if (allowed.includes('json') && /^[[{]/.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      return allowed.includes('string') ? 'string' : allowed[0];
    }
  }
  return allowed.includes('string') ? 'string' : allowed[0];
}

function KVInput({
  value,
  onCommit,
  delay,
  placeholder,
  disabled,
  type = 'text',
  title,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  className,
}: {
  value: string;
  onCommit: (value: string) => void;
  /** Commit delay while typing; `0` commits only on blur or Enter. */
  delay?: number;
  placeholder?: string;
  disabled?: boolean;
  type?: 'text' | 'number';
  title?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  className?: string;
}) {
  const { draft, setDraft, commit } = useDraftValue<string>({ value, onCommit, delay });
  return (
    <input
      type={type}
      title={title}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-invalid={ariaInvalid || undefined}
      aria-describedby={ariaDescribedBy}
      className={className}
    />
  );
}

/**
 * Key/value record editor. A new row stays a local draft until it has a key
 * (a blank one is flagged, never committed); clearing a key removes its row;
 * removing the last row calls `onClear` (when given) instead of emitting an
 * empty list. Unless the admin picks a type, a committed value's type is
 * inferred (numbers, true/false, JSON). `valueTypes` of one type gives a
 * string-only (or number-only) editor; `valueOptions` gives a value select.
 */
export function KeyValueField({
  id,
  pairs,
  onChange,
  onClear,
  disabled,
  valueTypes,
  valueOptions,
  keyPlaceholder,
  valuePlaceholder,
  lockedKeys,
  'aria-label': ariaLabel,
}: t.KeyValueFieldProps) {
  const localize = useLocalize();
  const availableTypes = valueTypes ?? DEFAULT_TYPES;
  const keys = useListKeys({ items: pairs, identity: pairKey, prefix: `${id}-row` });
  const [drafts, setDrafts] = useState<Array<{ id: number; pair: t.KeyValuePair }>>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [pinned, setPinned] = useState<ReadonlySet<string>>(() => new Set());
  const draftCounter = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const focusDraftRef = useRef<number | null>(null);
  const adoptedRef = useRef(new Map<string, string>());
  const pendingAdoptionRef = useRef<{ index: number; rowId: string } | null>(null);
  const pending = pendingAdoptionRef.current;
  if (pending && keys[pending.index] != null) {
    adoptedRef.current.set(keys[pending.index], pending.rowId);
    pendingAdoptionRef.current = null;
  }
  const rowIdAt = (index: number) => adoptedRef.current.get(keys[index]) ?? keys[index];
  const safeId = id.replace(/[^\w-]/g, '-');

  useLayoutEffect(() => {
    if (focusDraftRef.current == null) return;
    const draftId = focusDraftRef.current;
    focusDraftRef.current = null;
    listRef.current?.querySelector<HTMLInputElement>(`[data-kv-draft="${draftId}"] input`)?.focus();
  });

  const emit = (next: t.KeyValuePair[]) => {
    setNotice(null);
    if (next.length > 0 || drafts.length > 0 || !onClear) {
      onChange(next);
      return;
    }
    if (onClear() === false) setNotice(localize('com_admin_config_ctl_clear_unavailable'));
  };

  const typed = (pair: t.KeyValuePair, raw: string): t.KeyValuePair => {
    if (valueOptions || pinned.has(pair.key)) return { ...pair, value: raw };
    return { ...pair, value: raw, valueType: inferTypeFromText(raw, availableTypes) };
  };

  const updatePair = (index: number, patch: Partial<t.KeyValuePair>) => {
    const next = [...pairs];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };
  const removePair = (index: number) => emit(pairs.filter((_, i) => i !== index));
  const renameKey = (index: number, key: string) => {
    if (isBlankText(key)) {
      removePair(index);
      return;
    }
    if (key === pairs[index].key) return;
    if (pairs.some((pair, i) => i !== index && pair.key === key)) return;
    updatePair(index, { key });
  };
  const changeType = (index: number, valueType: t.KVValueType) => {
    const pair = pairs[index];
    setPinned((prev) => new Set(prev).add(pair.key));
    const truthy = pair.value === 'true' || pair.value === '1';
    const value = valueType === 'boolean' ? String(truthy) : pair.value;
    updatePair(index, { value, valueType });
  };

  const addDraft = () => {
    const draftId = draftCounter.current++;
    setDrafts((prev) => [
      ...prev,
      { id: draftId, pair: { key: '', value: '', valueType: availableTypes[0] } },
    ]);
    focusDraftRef.current = draftId;
  };
  const updateDraft = (draftId: number, patch: Partial<t.KeyValuePair>) => {
    const draft = drafts.find((d) => d.id === draftId);
    if (!draft) return;
    const pair = { ...draft.pair, ...patch };
    if (isBlankText(pair.key) || pairs.some((existing) => existing.key === pair.key)) {
      setDrafts((prev) => prev.map((d) => (d.id === draftId ? { ...d, pair } : d)));
      return;
    }
    setDrafts((prev) => prev.filter((d) => d.id !== draftId));
    pendingAdoptionRef.current = { index: pairs.length, rowId: `draft-${draftId}` };
    onChange([...pairs, pair]);
  };
  const removeDraft = (draftId: number) => {
    setDrafts((prev) => prev.filter((d) => d.id !== draftId));
  };

  const keyErrorId = (rowId: string) => `${safeId}-${rowId}-key-error`;
  const keyProblem = (pair: t.KeyValuePair, isDraft: boolean): string | null => {
    if (pair.key !== '' && isBlankText(pair.key))
      return localize('com_admin_config_ctl_kv_blank_key');
    if (BLOCK_UNSAFE_CONFIG_KEYS && isUnsafeConfigKey(pair.key)) {
      return localize('com_admin_config_unsafe_key_error');
    }
    if (isDraft && pair.key !== '' && pairs.some((existing) => existing.key === pair.key)) {
      return localize('com_admin_config_ctl_kv_duplicate');
    }
    return null;
  };

  const renderValueControl = (
    pair: t.KeyValuePair,
    rowId: string,
    label: string,
    onValue: (raw: string) => void,
    onType: (type: t.KVValueType) => void,
  ) => {
    const vType = pair.valueType ?? 'string';
    const controlId = `${safeId}-${rowId.replace(/[^\w-]/g, '-')}`;
    let control: ReactNode;
    if (valueOptions) {
      control = (
        <SelectField
          id={`${controlId}-select`}
          value={pair.value || undefined}
          options={valueOptions}
          onChange={onValue}
          disabled={disabled}
          aria-label={label}
        />
      );
    } else if (vType === 'boolean') {
      control = (
        <SelectField
          id={`${controlId}-bool`}
          value={pair.value === 'true' ? 'true' : 'false'}
          options={[
            { value: 'true', label: localize('com_admin_ui_true') },
            { value: 'false', label: localize('com_admin_ui_false') },
          ]}
          onChange={onValue}
          disabled={disabled}
          aria-label={label}
        />
      );
    } else if (vType === 'json') {
      control = (
        <TextareaField
          id={`${controlId}-json`}
          value={pair.value}
          onChange={onValue}
          onClear={() => onValue('')}
          placeholder='{"key": "value"}'
          disabled={disabled}
          monospace
          aria-label={label}
        />
      );
    } else {
      control = (
        <KVInput
          type={vType === 'number' && pinned.has(pair.key) ? 'number' : 'text'}
          value={pair.value}
          onCommit={onValue}
          placeholder={valuePlaceholder ?? localize('com_admin_ui_value')}
          disabled={disabled}
          aria-label={label}
          className={INPUT_CLASSES}
        />
      );
    }
    return (
      <div className="flex min-w-0 flex-2 items-start gap-2">
        <div className="min-w-0 flex-1">{control}</div>
        {!disabled && !valueOptions && availableTypes.length > 1 && (
          <div className="w-28 shrink-0">
            <SelectField
              id={`${controlId}-type`}
              value={vType}
              options={availableTypes.map((type) => ({
                value: type,
                label: localize(TYPE_LABEL_KEYS[type]),
              }))}
              onChange={(type) => onType(type as t.KVValueType)}
              aria-label={`${label} ${localize('com_admin_config_field_type')}`}
            />
          </div>
        )}
      </div>
    );
  };

  const renderRow = (
    rowId: string,
    pair: t.KeyValuePair,
    index: number,
    handlers: {
      onKey: (key: string) => void;
      onValue: (raw: string) => void;
      onType: (type: t.KVValueType) => void;
      onRemove: () => void;
    },
    isDraft: boolean,
  ) => {
    const problem = keyProblem(pair, isDraft);
    const rowLabel = pair.key || `${localize('com_admin_ui_entry')} ${index + 1}`;
    const isLocked = !isDraft && (lockedKeys?.has(pair.key) ?? false);
    return (
      <div
        key={rowId}
        className="flex flex-col gap-1"
        role="listitem"
        data-kv-draft={isDraft ? rowId.replace('draft-', '') : undefined}
      >
        <div className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
          <KVInput
            value={pair.key}
            onCommit={handlers.onKey}
            delay={isDraft ? 0 : undefined}
            placeholder={keyPlaceholder ?? localize('com_admin_ui_key')}
            disabled={disabled || isLocked}
            title={isLocked ? localize('com_admin_config_ctl_kv_locked') : undefined}
            aria-label={`${localize('com_admin_ui_key')} ${index + 1}`}
            aria-invalid={problem != null}
            aria-describedby={problem ? keyErrorId(rowId) : undefined}
            className={cn(INPUT_CLASSES, 'sm:w-auto sm:flex-1')}
          />
          {renderValueControl(
            pair,
            rowId,
            `${localize('com_admin_ui_value')} ${index + 1}`,
            handlers.onValue,
            handlers.onType,
          )}
          {!disabled && !isLocked && (
            <TrashButton
              onClick={handlers.onRemove}
              ariaLabel={`${localize('com_admin_ui_delete')} ${rowLabel}`}
            />
          )}
        </div>
        {problem && (
          <p
            id={keyErrorId(rowId)}
            role="alert"
            className="m-0 text-xs text-(--cui-color-text-danger)"
          >
            {problem}
          </p>
        )}
      </div>
    );
  };

  /** One array, so a draft row that becomes a pair keeps its React key (and the focused input). */
  const rows = [
    ...pairs.map((pair, index) =>
      renderRow(
        rowIdAt(index),
        pair,
        index,
        {
          onKey: (key) => renameKey(index, key),
          onValue: (raw) => updatePair(index, typed(pair, raw)),
          onType: (type) => changeType(index, type),
          onRemove: () => removePair(index),
        },
        false,
      ),
    ),
    ...drafts.map((draft, i) =>
      renderRow(
        `draft-${draft.id}`,
        draft.pair,
        pairs.length + i,
        {
          onKey: (key) => updateDraft(draft.id, { key }),
          onValue: (raw) => updateDraft(draft.id, typed(draft.pair, raw)),
          onType: (valueType) => updateDraft(draft.id, { valueType }),
          onRemove: () => removeDraft(draft.id),
        },
        true,
      ),
    ),
  ];

  return (
    <div
      ref={listRef}
      id={id}
      className="flex w-full max-w-150 flex-col gap-2"
      role="list"
      aria-label={ariaLabel}
    >
      {rows}
      {pairs.length === 0 && drafts.length === 0 && disabled && (
        <span role="listitem" className="text-sm text-(--cui-color-text-muted)">
          {localize('com_admin_config_ctl_list_empty')}
        </span>
      )}
      {notice && (
        <div role="listitem">
          <FieldNotice>{notice}</FieldNotice>
        </div>
      )}
      {!disabled && (
        <div className="self-start" role="listitem" data-add-item>
          <AddItemButton
            label={localize('com_admin_ui_add_item', { item: localize('com_admin_ui_entry') })}
            onClick={addDraft}
          />
        </div>
      )}
    </div>
  );
}
