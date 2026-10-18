import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import type * as t from '~/admin/types';
import { useListKeys, useLocalize, useEntryMarkers } from '~/admin/hooks';
import { RowFilterContext } from '~/admin/contexts/RowFilterContext';
import { getEntryIdentity, getEntryTitle } from './entries';
import { AddItemButton } from '~/admin/components/shared';
import { ObjectEntryCard } from './ObjectEntryCard';
import { isRowVisible } from '~/admin/utils';

/**
 * List of object entries as cards. Add appends an entry and expands, scrolls
 * to and marks it "New" (as does an entry appended from outside, e.g. a
 * create dialog). Delete marks the entry pending deletion with Undo until
 * Save (the pending edit is the list without it). Cards keep their React
 * identity across edits, renames, removals and reloads.
 */
export function ArrayObjectField({
  id,
  path,
  value,
  fields,
  onChange,
  onEntryChange,
  disabled,
  hideAddButton,
  addTriggerRef,
  renderFields,
  entryIdPrefix,
  editSessionId,
  getEntryTitle: getTitle,
  renderSummary,
  reorderable,
  emptyLabel,
  isEntryLocked,
}: t.ArrayObjectFieldProps) {
  const localize = useLocalize();
  const rowFilter = useContext(RowFilterContext);
  const markersOf = useEntryMarkers(path);
  const items = Array.isArray(value) ? value : [];
  /** Card ids the table of contents and deep links target (`section-endpoints-custom-3`). */
  const entryCardId = (index: number): string | undefined => {
    if (entryIdPrefix) return `${entryIdPrefix}-${index}`;
    return path ? `section-${path.replace(/[^\w-]+/g, '-')}-${index}` : undefined;
  };
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const keys = useListKeys({ items, identity: getEntryIdentity, prefix: `${id}-entry` });
  const [newKeys, setNewKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [removed, setRemoved] = useState<Array<t.PendingRemoval<string> & { focus: boolean }>>([]);
  const prevRef = useRef({ length: items.length, session: editSessionId, keys });
  const undoingRef = useRef(false);

  /** Entries back in the list (Undo, a removal reverted from the review) are no longer pending deletion. */
  const liveIdentities = new Set(items.map(getEntryIdentity));
  const restored = removed.filter((ghost) => {
    const identity = getEntryIdentity(ghost.value);
    return identity != null && liveIdentities.has(identity);
  });
  if (restored.length > 0) {
    setRemoved((list) => list.filter((ghost) => !restored.includes(ghost)));
  }

  const prev = prevRef.current;
  if (prev.keys !== keys) {
    const lastIdentity = getEntryIdentity(items[items.length - 1]);
    const isRestored = restored.some((ghost) => getEntryIdentity(ghost.value) === lastIdentity);
    const appended =
      !undoingRef.current &&
      !isRestored &&
      prev.session === editSessionId &&
      items.length === prev.length + 1 &&
      keys.length > 0
        ? keys[keys.length - 1]
        : null;
    undoingRef.current = false;
    prevRef.current = { length: items.length, session: editSessionId, keys };
    if (appended && !prev.keys.includes(appended) && !newKeys.has(appended)) {
      setNewKeys((current) => new Set(current).add(appended));
    }
  }

  useEffect(() => {
    setRemoved([]);
    setNewKeys(new Set());
  }, [editSessionId]);

  const handleAdd = useCallback(() => {
    onChange([...itemsRef.current, {}]);
  }, [onChange]);

  useEffect(() => {
    if (!addTriggerRef) return;
    addTriggerRef.current = handleAdd;
    return () => {
      addTriggerRef.current = null;
    };
  }, [addTriggerRef, handleAdd]);

  const titleOf = (item: t.ConfigValue, index: number) =>
    getTitle?.(item, index) ?? getEntryTitle(item, index, localize);

  const handleRemove = (index: number, focus: boolean) => {
    const current = itemsRef.current;
    setRemoved((list) => [
      ...list,
      {
        key: keys[index],
        index,
        value: current[index],
        label: titleOf(current[index], index),
        focus,
      },
    ]);
    onChange(current.filter((_, i) => i !== index));
  };

  const handleUndo = (ghost: t.PendingRemoval<string>) => {
    const current = itemsRef.current;
    const at = Math.min(ghost.index, current.length);
    setRemoved((list) => list.filter((entry) => entry.key !== ghost.key));
    undoingRef.current = true;
    onChange([...current.slice(0, at), ghost.value, ...current.slice(at)]);
  };

  const handleMove = (index: number, offset: number) => {
    const target = index + offset;
    const current = [...itemsRef.current];
    if (target < 0 || target >= current.length) return;
    [current[index], current[target]] = [current[target], current[index]];
    onChange(current);
  };

  const handleEntryChange = (index: number, newValue: t.ConfigValue) => {
    if (onEntryChange) {
      onEntryChange(index, newValue);
      return;
    }
    const next = [...itemsRef.current];
    next[index] = newValue;
    itemsRef.current = next;
    onChange(next);
  };

  /** While the tab filter is active, only entries that match or hold a match are listed. */
  const isShown = (index: number) => !path || isRowVisible(rowFilter, `${path}.${index}`);
  const rows: Array<
    | { kind: 'entry'; item: t.ConfigValue; index: number; key: string }
    | { kind: 'removed'; ghost: t.PendingRemoval<string> & { focus: boolean } }
  > = items.flatMap((item, index) =>
    isShown(index) ? [{ kind: 'entry' as const, item, index, key: keys[index] }] : [],
  );
  /** Pending deletions stay listed under the filter (last, as positions no longer line up), with Undo. */
  for (const ghost of [...removed].sort((a, b) => a.index - b.index)) {
    const at = rowFilter ? rows.length : Math.min(ghost.index, rows.length);
    rows.splice(at, 0, { kind: 'removed', ghost });
  }

  return (
    <div id={id} className="flex w-full flex-col gap-2">
      {rows.map((row) => {
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
              focusUndo={row.ghost.focus}
              onUndoRemove={() => handleUndo(row.ghost)}
            />
          );
        }
        const { item, index, key } = row;
        const title = titleOf(item, index);
        return (
          <ObjectEntryCard
            key={key}
            id={entryCardId(index)}
            dataPath={`${path ?? id}.${index}`}
            entryKey={title}
            fields={fields}
            value={item}
            onValueChange={(v) => handleEntryChange(index, v)}
            onRemove={
              disabled || isEntryLocked?.(item, index) ? undefined : () => handleRemove(index, true)
            }
            onMoveUp={reorderable && index > 0 ? () => handleMove(index, -1) : undefined}
            onMoveDown={
              reorderable && index < items.length - 1 ? () => handleMove(index, 1) : undefined
            }
            summary={renderSummary?.(item, index)}
            disabled={disabled}
            isNew={newKeys.has(key)}
            markers={newKeys.has(key) ? undefined : markersOf?.(item)}
            defaultExpanded={newKeys.has(key)}
            renderFields={renderFields}
            editSessionId={editSessionId}
          />
        );
      })}
      {items.length === 0 && removed.length === 0 && (
        <p className="m-0 py-2 text-sm text-(--cui-color-text-muted)">
          {emptyLabel ?? localize('com_admin_config_no_entries')}
        </p>
      )}
      {!disabled && !hideAddButton && (
        <div className="self-start">
          <AddItemButton
            label={localize('com_admin_ui_add_item', { item: localize('com_admin_ui_entry') })}
            onClick={handleAdd}
          />
        </div>
      )}
    </div>
  );
}
