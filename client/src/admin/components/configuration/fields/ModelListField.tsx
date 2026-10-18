import { useId, useState } from 'react';
import type * as t from '~/admin/types';
import { AddItemButton, DecorativeIcon } from '~/admin/components/shared';
import { ButtonGroup, TextField as CUITextField } from '~/admin/ui';
import { useLocalize } from '~/admin/hooks';
import { TextField } from './TextField';
import { FieldNotice } from './Notice';

const SEPARATORS = /[,\n]/;

function modelName(item: t.ModelItem): string {
  return typeof item === 'string' ? item : item.name;
}

/** Model items of a value; anything else (a stray object without a name) is dropped. */
export function toModelItems(value: t.ConfigValue): t.ModelItem[] {
  if (!Array.isArray(value)) return [];
  const items: t.ModelItem[] = [];
  for (const item of value) {
    if (typeof item === 'string') items.push(item);
    else if (
      item &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      typeof item.name === 'string'
    ) {
      const description = typeof item.description === 'string' ? item.description : undefined;
      items.push(
        description ? { ...item, name: item.name, description } : { ...item, name: item.name },
      );
    }
  }
  return items;
}

/** Splits pasted or typed text into model names: trimmed, blank-free, deduplicated against `existing`. */
export function parseModelNames(text: string, existing: readonly t.ModelItem[]): string[] {
  const seen = new Set(existing.map(modelName));
  const names: string[] = [];
  for (const part of text.split(SEPARATORS)) {
    const name = part.trim();
    if (name === '' || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

type Mode = 'defaults' | 'only';

/**
 * Model list editor: chips for each model (bare ids or `{ name, description }`
 * objects, kept as they are), paste of comma- or newline-separated lists with
 * trimming and de-duplication, and two modes: "Use provider defaults" (the
 * list is unset; defaults are shown read-only) and "Only these models".
 * Removing the last model calls `onClear` instead of saving an empty list,
 * which LibreChat would read as "no models".
 */
export function ModelListField({
  id,
  value,
  defaults,
  onChange,
  onClear,
  disabled,
  required,
  'aria-label': ariaLabel,
}: t.ModelListFieldProps) {
  const localize = useLocalize();
  const inputId = useId();
  const items = toModelItems(value);
  const hasList = Array.isArray(value);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mode: Mode = required || hasList || pendingOnly ? 'only' : 'defaults';

  /** Back to the list's default; a list only the layer beneath sets cannot be cleared (D3). */
  const clear = () => {
    setNotice(onClear() === false ? localize('com_admin_config_ctl_clear_unavailable') : null);
  };
  const emit = (next: t.ModelItem[]) => {
    setNotice(null);
    if (next.length > 0) {
      onChange(next);
      return;
    }
    setPendingOnly(false);
    setEditing(null);
    clear();
  };
  const addNames = (text: string) => {
    const names = parseModelNames(text, items);
    setDraft('');
    if (names.length === 0) return;
    setPendingOnly(false);
    onChange([...items, ...names]);
  };
  const removeAt = (index: number) => {
    if (editing === index) setEditing(null);
    emit(items.filter((_, i) => i !== index));
  };
  const updateAt = (index: number, patch: { name?: string; description?: string }) => {
    const current = items[index];
    const name = patch.name ?? modelName(current);
    const base = typeof current === 'string' ? {} : current;
    const currentDescription = typeof current === 'string' ? undefined : current.description;
    const description = patch.description ?? currentDescription;
    const nextItem: t.ModelItem = description ? { ...base, name, description } : name;
    const next = [...items];
    next[index] = nextItem;
    onChange(next);
  };

  const chooseMode = (next: Mode) => {
    if (disabled || next === mode) return;
    if (next === 'only') {
      setPendingOnly(true);
      return;
    }
    setPendingOnly(false);
    setEditing(null);
    clear();
  };

  const editingItem = editing != null ? items[editing] : undefined;

  return (
    <div id={id} className="flex w-full max-w-150 flex-col gap-2">
      {!required && (
        <ButtonGroup
          aria-label={ariaLabel}
          className="max-w-full self-start"
          selected={mode}
          onClick={(next) => chooseMode(next as Mode)}
          options={[
            {
              value: 'defaults',
              label: localize('com_admin_config_ctl_models_defaults'),
              disabled,
            },
            { value: 'only', label: localize('com_admin_config_ctl_models_only'), disabled },
          ]}
        />
      )}
      {mode === 'defaults' && (
        <div className="flex flex-col gap-2">
          <span className="text-xs text-(--cui-color-text-muted)">
            {localize('com_admin_config_ctl_models_defaults_hint')}
          </span>
          {defaults && defaults.length > 0 && (
            <>
              <ul
                className="m-0 flex list-none flex-wrap gap-1.5 p-0"
                aria-label={localize('com_admin_config_ctl_models_defaults')}
              >
                {defaults.map((name) => (
                  <li
                    key={name}
                    className="rounded-full border border-dashed border-(--cui-color-stroke-default) px-2.5 py-0.5 text-xs text-(--cui-color-text-muted)"
                  >
                    {name}
                  </li>
                ))}
              </ul>
              {!disabled && (
                <div className="self-start">
                  <AddItemButton
                    label={localize('com_admin_config_ctl_models_start_from_defaults')}
                    onClick={() => onChange([...defaults])}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
      {mode === 'only' && (
        <>
          <ul
            className="m-0 flex list-none flex-wrap gap-1.5 p-0"
            aria-label={ariaLabel ?? localize('com_admin_config_ctl_models_only')}
          >
            {items.map((item, index) => {
              const name = modelName(item);
              const description = typeof item === 'string' ? undefined : item.description;
              return (
                <li
                  key={`${name}-${index}`}
                  className="flex max-w-full items-center gap-1 rounded-full border border-(--cui-color-stroke-default) bg-(--cui-color-background-muted) py-0.5 pr-1 pl-2.5 text-xs text-(--cui-color-text-default)"
                  title={description}
                >
                  <span className="truncate font-mono">{name}</span>
                  {description && (
                    <span className="max-w-40 truncate text-(--cui-color-text-muted)">
                      · {description}
                    </span>
                  )}
                  {!disabled && (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditing(editing === index ? null : index)}
                        aria-label={localize('com_admin_config_ctl_models_edit', { name })}
                        aria-expanded={editing === index}
                        className="icon-btn icon-btn-xs"
                      >
                        <DecorativeIcon name="pencil" size="xs" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeAt(index)}
                        aria-label={localize('com_admin_ui_remove_item', { name })}
                        className="icon-btn icon-btn-xs icon-btn-danger"
                      >
                        <DecorativeIcon name="cross" size="xs" />
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {editing != null && editingItem !== undefined && !disabled && (
            <div className="flex flex-col gap-2 rounded-md border border-(--cui-color-stroke-default) p-2 sm:flex-row">
              <TextField
                key={`name-${editing}`}
                id={`${id}-edit-name`}
                value={modelName(editingItem)}
                required
                validate={(name) =>
                  items.some((item, i) => i !== editing && modelName(item) === name.trim())
                    ? localize('com_admin_config_ctl_list_duplicate')
                    : null
                }
                onChange={(name) => updateAt(editing, { name: name.trim() })}
                aria-label={localize('com_admin_config_ctl_models_name')}
              />
              <TextField
                key={`description-${editing}`}
                id={`${id}-edit-description`}
                value={typeof editingItem === 'string' ? '' : (editingItem.description ?? '')}
                onChange={(description) => updateAt(editing, { description })}
                onClear={() => updateAt(editing, { description: '' })}
                placeholder={localize('com_admin_config_ctl_models_description')}
                aria-label={localize('com_admin_config_ctl_models_description')}
              />
            </div>
          )}
          {!disabled && (
            <div className="cui-field max-w-100">
              <CUITextField
                id={inputId}
                value={draft}
                onChange={setDraft}
                onBlur={() => addNames(draft)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' || draft.trim() === '') return;
                  e.preventDefault();
                  addNames(draft);
                }}
                onPaste={(e) => {
                  const text = e.clipboardData.getData('text');
                  if (!SEPARATORS.test(text)) return;
                  e.preventDefault();
                  addNames(`${draft}${text}`);
                }}
                placeholder={localize('com_admin_config_ctl_models_add')}
                aria-label={localize('com_admin_config_ctl_models_add')}
              />
            </div>
          )}
          {items.length === 0 && (
            <span className="text-xs text-(--cui-color-text-muted)">
              {localize(
                required
                  ? 'com_admin_config_ctl_models_required'
                  : 'com_admin_config_ctl_models_empty',
              )}
            </span>
          )}
        </>
      )}
      {notice && <FieldNotice>{notice}</FieldNotice>}
    </div>
  );
}
