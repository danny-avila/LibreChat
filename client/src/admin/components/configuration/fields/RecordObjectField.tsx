import { useId, useState, useContext, useCallback, useEffect, useRef, memo } from 'react';
import type * as t from '~/admin/types';
import { cn, focusElement, isRowVisible, isUnsafeConfigKey } from '~/admin/utils';
import { RowFilterContext } from '~/admin/contexts/RowFilterContext';
import { BLOCK_UNSAFE_CONFIG_KEYS } from '~/admin/constants';
import { AddItemButton } from '~/admin/components/shared';
import { ObjectEntryCard } from './ObjectEntryCard';
import { useLocalize } from '~/admin/hooks';
import { INPUT_CLASSES } from './display';
import { Button } from '~/admin/ui';

function asRecord(value: t.ConfigValue): t.ConfigRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/** Copy of `record` with `key: value` inserted at position `index`. */
function insertAt(
  record: t.ConfigRecord,
  index: number,
  key: string,
  value: t.ConfigValue,
): t.ConfigRecord {
  const entries = Object.entries(record);
  entries.splice(Math.min(index, entries.length), 0, [key, value]);
  return Object.fromEntries(entries);
}

/**
 * Record of object entries keyed by name (e.g. OCR or agent endpoints keyed
 * by provider). New keys are appended, expanded and marked "New"; delete
 * marks the entry pending deletion with Undo until Save; rename keeps the
 * entry's position.
 */
export function RecordObjectField({
  id,
  path,
  value,
  fields,
  onChange,
  disabled,
  allowPrimitiveValues,
  addTriggerRef,
  renderFields,
  editSessionId,
  lockedKeys,
}: t.RecordObjectFieldProps) {
  const localize = useLocalize();
  const rowFilter = useContext(RowFilterContext);
  const [showAddInput, setShowAddInput] = useState(false);
  const [newKeys, setNewKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [removed, setRemoved] = useState<Array<t.PendingRemoval<string>>>([]);
  const record = asRecord(value);
  const recordRef = useRef(record);
  recordRef.current = record;
  const entries = Object.entries(record);
  /** Entries back in the record (Undo, a removal reverted from the review) are no longer pending deletion. */
  if (removed.some((ghost) => ghost.key in record)) {
    setRemoved((list) => list.filter((ghost) => !(ghost.key in record)));
  }

  useEffect(() => {
    if (!addTriggerRef) return;
    addTriggerRef.current = () => setShowAddInput(true);
    return () => {
      addTriggerRef.current = null;
    };
  }, [addTriggerRef]);

  useEffect(() => {
    setRemoved([]);
    setNewKeys(new Set());
  }, [editSessionId]);

  const handleAdd = useCallback(
    (key: string) => {
      const current = recordRef.current;
      if (key in current) return;
      onChange({ ...current, [key]: allowPrimitiveValues ? true : {} });
      setNewKeys((prev) => new Set(prev).add(key));
      setShowAddInput(false);
    },
    [onChange, allowPrimitiveValues],
  );

  const handleRemove = (key: string, index: number) => {
    const current = recordRef.current;
    setRemoved((list) => [...list, { key, index, value: current[key], label: key }]);
    const next = { ...current };
    delete next[key];
    onChange(next);
  };

  const handleUndo = (ghost: t.PendingRemoval<string>) => {
    setRemoved((list) => list.filter((entry) => entry.key !== ghost.key));
    const current = recordRef.current;
    if (ghost.key in current) return;
    onChange(insertAt(current, ghost.index, ghost.key, ghost.value));
  };

  const handleEntryChange = (key: string, newValue: t.ConfigValue) => {
    const next = { ...recordRef.current, [key]: newValue };
    recordRef.current = next;
    onChange(next);
  };

  const handleRename = (oldKey: string, renamed: string) => {
    const current = recordRef.current;
    if (renamed === oldKey || renamed in current) return;
    if (BLOCK_UNSAFE_CONFIG_KEYS && isUnsafeConfigKey(renamed)) return;
    const next: t.ConfigRecord = {};
    for (const [k, v] of Object.entries(current)) {
      next[k === oldKey ? renamed : k] = v;
    }
    onChange(next);
  };

  const rows: Array<
    | { kind: 'entry'; key: string; entryValue: t.ConfigValue }
    | { kind: 'removed'; ghost: t.PendingRemoval<string> }
  > = entries.map(([key, entryValue]) => ({ kind: 'entry', key, entryValue }));
  /** Pending deletions stay listed under the filter, with Undo. */
  for (const ghost of [...removed].sort((a, b) => a.index - b.index)) {
    rows.splice(Math.min(ghost.index, rows.length), 0, { kind: 'removed', ghost });
  }

  return (
    <div id={id} className="flex w-full flex-col gap-2">
      {rows.map((row, position) => {
        if (row.kind === 'removed') {
          return (
            <ObjectEntryCard
              key={`removed-${row.ghost.key}`}
              entryKey={row.ghost.label}
              fields={fields}
              value={row.ghost.value}
              onValueChange={() => undefined}
              renderFields={renderFields}
              pendingRemoval
              focusUndo
              onUndoRemove={() => handleUndo(row.ghost)}
            />
          );
        }
        const { key, entryValue } = row;
        const index = position - rows.slice(0, position).filter((r) => r.kind === 'removed').length;
        if (path && !isRowVisible(rowFilter, `${path}.${key}`)) return null;
        const isLocked = lockedKeys?.has(key) ?? false;
        const canEdit = !disabled && !isLocked;
        return (
          <ObjectEntryCard
            key={key}
            dataPath={path ? `${path}.${key}` : undefined}
            entryKey={key}
            fields={fields}
            value={entryValue}
            onValueChange={(v) => handleEntryChange(key, v)}
            onRemove={canEdit ? () => handleRemove(key, index) : undefined}
            onRename={canEdit ? (renamed) => handleRename(key, renamed) : undefined}
            lockedNote={isLocked ? localize('com_admin_config_ctl_kv_locked') : undefined}
            disabled={disabled}
            isNew={newKeys.has(key)}
            defaultExpanded={newKeys.has(key)}
            renderFields={renderFields}
            editSessionId={editSessionId}
          />
        );
      })}
      {entries.length === 0 && removed.length === 0 && !showAddInput && (
        <p className="m-0 py-2 text-sm text-(--cui-color-text-muted)">
          {localize('com_admin_config_no_entries')}
        </p>
      )}
      {!disabled && showAddInput && (
        <AddKeyInput
          existingKeys={record}
          onAdd={handleAdd}
          onCancel={() => setShowAddInput(false)}
        />
      )}
      {!disabled && !addTriggerRef && !showAddInput && (
        <div className="self-start">
          <AddItemButton
            label={localize('com_admin_ui_add_item', { item: localize('com_admin_ui_entry') })}
            onClick={() => setShowAddInput(true)}
          />
        </div>
      )}
    </div>
  );
}

/** Isolated input so keystrokes don't re-render sibling ObjectEntryCards. */
const AddKeyInput = memo(function AddKeyInput({
  existingKeys,
  onAdd,
  onCancel,
}: {
  existingKeys: Record<string, t.ConfigValue>;
  onAdd: (key: string) => void;
  onCancel: () => void;
}) {
  const localize = useLocalize();
  const [newKey, setNewKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  const handleAdd = () => {
    const trimmed = newKey.trim();
    if (!trimmed) return;
    if (trimmed in existingKeys) {
      setError(localize('com_admin_config_ctl_kv_duplicate'));
      return;
    }
    if (BLOCK_UNSAFE_CONFIG_KEYS && isUnsafeConfigKey(trimmed)) {
      setError(localize('com_admin_config_unsafe_key_error'));
      return;
    }
    (document.activeElement as HTMLElement)?.blur();
    onAdd(trimmed);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={newKey}
          aria-label={localize('com_admin_ui_key')}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            setNewKey(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
            if (e.key === 'Escape') {
              setNewKey('');
              onCancel();
            }
          }}
          placeholder={localize('com_admin_ui_key')}
          className={cn(INPUT_CLASSES, 'max-w-60')}
          ref={focusElement}
        />
        <Button
          htmlType="button"
          type="primary"
          label={localize('com_admin_ui_add')}
          onClick={handleAdd}
        />
        <Button
          htmlType="button"
          type="secondary"
          label={localize('com_admin_ui_cancel')}
          onClick={() => {
            setNewKey('');
            onCancel();
          }}
        />
      </div>
      {error && (
        <p id={errorId} role="alert" className="m-0 text-xs text-(--cui-color-text-danger)">
          {error}
        </p>
      )}
    </div>
  );
});
