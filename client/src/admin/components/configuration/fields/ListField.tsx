import { useRef, useState, useLayoutEffect } from 'react';
import type * as t from '~/admin/types';
import { AddItemButton, TrashButton } from '~/admin/components/shared';
import { useListKeys, useLocalize } from '~/admin/hooks';
import { TextField as CUITextField } from '~/admin/ui';
import { cn, isFilledText } from '~/admin/utils';
import { TextareaField } from './TextareaField';
import { SelectField } from './SelectField';
import { TextField } from './TextField';
import { FieldNotice } from './Notice';
import { widthClass } from './display';

const identity = (value: string) => value;

/**
 * List of strings. Item text is kept exactly as typed (whitespace matters for
 * stop sequences; items with newlines get a textarea). A new row stays a
 * local draft until it has text, blank items are dropped, duplicates are
 * rejected inline, and removing the last item calls `onClear` (when given)
 * instead of saving an empty list. With `options`, Add opens a picker of the
 * values not yet in the list.
 */
export function ListField({
  id,
  values,
  onChange,
  onClear,
  disabled,
  placeholder,
  itemLabel,
  variant = 'inline-edit',
  options,
  multiline,
  keepsWhitespace,
  width,
  'aria-label': ariaLabel,
}: t.ListFieldProps) {
  const localize = useLocalize();
  const isBlank = (value: string) => !isFilledText(value, keepsWhitespace);
  const keys = useListKeys({ items: values, identity, prefix: `${id}-item` });
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const focusDraftRef = useRef(false);
  const resolvedItemLabel = itemLabel ?? localize('com_admin_ui_item');
  const resolvedPlaceholder = placeholder ?? localize('com_admin_ui_enter_value');
  const optionLabels = new Map(options?.map((option) => [option.value, option.label]));
  const unusedOptions = options?.filter((option) => !values.includes(option.value)) ?? [];

  useLayoutEffect(() => {
    if (!focusDraftRef.current) return;
    focusDraftRef.current = false;
    listRef.current
      ?.querySelector<HTMLElement>('[data-list-draft] input, [data-list-draft] select')
      ?.focus();
  });

  const emit = (next: string[]) => {
    setNotice(null);
    if (next.length > 0 || !onClear) {
      onChange(next);
      return;
    }
    if (onClear() === false) setNotice(localize('com_admin_config_ctl_clear_unavailable'));
  };
  const duplicateError = (value: string, index: number) =>
    values.some((existing, i) => i !== index && existing === value)
      ? localize('com_admin_config_ctl_list_duplicate')
      : null;
  const removeAt = (index: number) => emit(values.filter((_, i) => i !== index));
  const replaceAt = (index: number, value: string) => {
    if (isBlank(value)) {
      removeAt(index);
      return;
    }
    const next = [...values];
    next[index] = value;
    onChange(next);
  };
  const openDraft = () => {
    setAdding(true);
    focusDraftRef.current = true;
  };
  const appendDraft = (value: string) => {
    setAdding(false);
    if (isBlank(value)) return;
    onChange([...values, value]);
  };

  const renderItemControl = (value: string, index: number) => {
    const label = `${resolvedItemLabel} ${index + 1}`;
    if (options) {
      if (disabled) {
        return (
          <span className="config-input flex-1" aria-label={label}>
            {optionLabels.get(value) ?? value}
          </span>
        );
      }
      return (
        <SelectField
          id={`${keys[index]}-input`}
          value={value}
          options={[...unusedOptions, { value, label: optionLabels.get(value) ?? value }]}
          onChange={(next) => replaceAt(index, next)}
          aria-label={label}
        />
      );
    }
    if (variant === 'display') return <span className="config-input flex-1">{value}</span>;
    const Control = multiline || value.includes('\n') ? TextareaField : TextField;
    return (
      <Control
        id={`${keys[index]}-input`}
        value={value}
        onChange={(next) => replaceAt(index, next)}
        onClear={() => removeAt(index)}
        validate={(next) => duplicateError(next, index)}
        keepsWhitespace={keepsWhitespace}
        placeholder={resolvedPlaceholder}
        disabled={disabled}
        width="L"
        aria-label={label}
      />
    );
  };

  const renderDraft = () => {
    const label = `${resolvedItemLabel} ${values.length + 1}`;
    if (options) {
      return (
        <SelectField
          id={`${id}-draft`}
          value={undefined}
          options={unusedOptions}
          placeholder={localize('com_admin_config_ctl_list_pick')}
          onChange={appendDraft}
          aria-label={label}
        />
      );
    }
    return (
      <DraftInput
        id={`${id}-draft`}
        placeholder={resolvedPlaceholder}
        label={label}
        isBlank={isBlank}
        isDuplicate={(value) => values.includes(value)}
        onCommit={appendDraft}
        onCancel={() => setAdding(false)}
        onContinue={(value) => {
          onChange([...values, value]);
          focusDraftRef.current = true;
        }}
      />
    );
  };

  const canAdd = !disabled && (!options || unusedOptions.length > 0);

  return (
    <div
      ref={listRef}
      id={id}
      className={cn('flex w-full flex-col gap-2', widthClass(width ?? 'M'))}
      role="list"
      aria-label={ariaLabel}
    >
      {values.map((value, index) => (
        <div key={keys[index]} className="flex items-start gap-2" role="listitem">
          <div className="flex min-w-0 flex-1">{renderItemControl(value, index)}</div>
          {!disabled && (
            <TrashButton
              onClick={() => removeAt(index)}
              ariaLabel={`${localize('com_admin_ui_delete')} ${value.trim() || `${resolvedItemLabel} ${index + 1}`}`}
            />
          )}
        </div>
      ))}
      {adding && !disabled && (
        <div className="flex items-start gap-2" role="listitem" data-list-draft>
          <div className="flex min-w-0 flex-1">{renderDraft()}</div>
        </div>
      )}
      {values.length === 0 && !adding && disabled && (
        <span role="listitem" className="text-sm text-(--cui-color-text-muted)">
          {localize('com_admin_config_ctl_list_empty')}
        </span>
      )}
      {notice && (
        <div role="listitem">
          <FieldNotice>{notice}</FieldNotice>
        </div>
      )}
      {canAdd && !adding && (
        <div className="self-start" role="listitem" data-add-item>
          <AddItemButton
            label={localize('com_admin_ui_add_item', { item: resolvedItemLabel })}
            onClick={openDraft}
          />
        </div>
      )}
    </div>
  );
}

/** The new-item row: stays local until it has text; Enter adds it and opens the next draft. */
function DraftInput({
  id,
  placeholder,
  label,
  isBlank,
  isDuplicate,
  onCommit,
  onCancel,
  onContinue,
}: {
  id: string;
  placeholder: string;
  label: string;
  isBlank: (value: string) => boolean;
  isDuplicate: (value: string) => boolean;
  onCommit: (value: string) => void;
  onCancel: () => void;
  onContinue: (value: string) => void;
}) {
  const localize = useLocalize();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const errorId = `${id}-error`;

  const accept = (next: string): boolean => {
    if (isBlank(next)) return true;
    if (isDuplicate(next)) {
      setError(localize('com_admin_config_ctl_list_duplicate'));
      return false;
    }
    return true;
  };

  return (
    <div className="cui-field flex w-full flex-col gap-1">
      <CUITextField
        id={id}
        value={value}
        placeholder={placeholder}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(next) => {
          setValue(next);
          setError(null);
        }}
        onBlur={() => {
          if (!accept(value)) return;
          onCommit(value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
            return;
          }
          if (e.key !== 'Enter') return;
          if (isBlank(value)) {
            onCancel();
            return;
          }
          e.preventDefault();
          if (!accept(value)) return;
          setValue('');
          onContinue(value);
        }}
      />
      {error && (
        <span id={errorId} role="alert" className="text-xs text-(--cui-color-text-danger)">
          {error}
        </span>
      )}
    </div>
  );
}
