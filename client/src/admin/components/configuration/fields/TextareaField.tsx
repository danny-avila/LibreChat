import { useId, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import type * as t from '~/admin/types';
import { useDraftValue, useLocalize } from '~/admin/hooks';
import { cn, isFilledText } from '~/admin/utils';
import { FieldNotice } from './Notice';
import { widthClass } from './display';

/**
 * Multi-line text that grows with its content and keeps newlines (prompts,
 * descriptions). Commits like `TextField`: after a pause while typing and on
 * blur; clearing an optional field calls `onClear`, a required one errors.
 */
export function TextareaField({
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
  rows = 3,
  width = 'L',
  monospace,
  'aria-describedby': ariaDescribedBy,
  ...ariaProps
}: t.TextareaFieldProps) {
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
    <div className={cn('flex w-full flex-col gap-1', widthClass(width))}>
      <TextareaAutosize
        id={id}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setNotice(null);
          if (error && isFilled(e.target.value)) setError(null);
        }}
        onBlur={commit}
        placeholder={placeholder ?? localize('com_admin_ui_enter_text')}
        disabled={disabled}
        minRows={Math.min(rows, 2)}
        maxRows={16}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          'config-input w-full resize-y leading-5',
          monospace && 'config-input-mono',
          error && 'config-input-error',
        )}
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
