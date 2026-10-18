import { useId, useState } from 'react';
import type * as t from '~/admin/types';
import { useDraftValue, useLocalize } from '~/admin/hooks';
import { TextField as CUITextField } from '~/admin/ui';
import { cn, isFilledText } from '~/admin/utils';
import { FieldNotice } from './Notice';
import { widthClass } from './display';

/**
 * Single-line text control. Typing commits after a short pause (and on blur
 * or Enter). Clearing an optional field calls `onClear` (remove the own
 * value) instead of saving `''`; clearing a required field shows an error and
 * keeps the previous value.
 */
export function TextField({
  id,
  value,
  onChange,
  onClear,
  required,
  hasRowError,
  validate,
  keepsWhitespace,
  placeholder,
  disabled,
  width,
  list,
  type = 'text',
  'aria-describedby': ariaDescribedBy,
  ...ariaProps
}: t.TextFieldProps) {
  const localize = useLocalize();
  const errorId = useId();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const isFilled = (text: string) => isFilledText(text, keepsWhitespace);
  const { draft, setDraft, commit } = useDraftValue<string>({
    value,
    autoCommit: isFilled,
    onCommit: (next) => {
      if (isFilled(next)) {
        const problem = validate?.(next) ?? null;
        setError(problem);
        if (problem) return false;
        onChange(next);
        return;
      }
      if (required) {
        setError(localize('com_admin_config_ctl_required'));
        onChange('');
        return;
      }
      if (!onClear) {
        onChange('');
        return;
      }
      const cleared = onClear();
      setNotice(cleared === false ? localize('com_admin_config_ctl_clear_unavailable') : null);
      return 'reset';
    },
  });

  const shownError = hasRowError ? null : error;
  const describedBy = [ariaDescribedBy, shownError ? errorId : undefined].filter(Boolean).join(' ');

  return (
    <div className={cn('cui-field flex w-full flex-col gap-1', widthClass(width))}>
      <CUITextField
        id={id}
        type={type}
        list={list}
        value={draft}
        onChange={(next) => {
          setDraft(next);
          setNotice(null);
          if (error && isFilled(next)) setError(null);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        placeholder={placeholder ?? localize('com_admin_ui_enter_value')}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...ariaProps}
      />
      {shownError && (
        <span id={errorId} role="alert" className="text-xs text-(--cui-color-text-danger)">
          {shownError}
        </span>
      )}
      {notice && !error && <FieldNotice>{notice}</FieldNotice>}
    </div>
  );
}
