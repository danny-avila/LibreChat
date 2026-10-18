import { useId, useState } from 'react';
import type * as t from '~/admin/types';
import { cn, focusElement, isFilledText, isEnvReference } from '~/admin/utils';
import { DecorativeIcon } from '~/admin/components/shared';
import { useDraftValue, useLocalize } from '~/admin/hooks';
import { INPUT_CLASSES, widthClass } from './display';
import { FieldNotice } from './Notice';

const ACTION_BUTTON_CLASSES =
  'inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-(--cui-color-stroke-default) bg-transparent px-1.5 py-1 text-xs text-(--cui-color-text-muted) transition-colors hover:bg-(--cui-color-background-hover) hover:text-(--cui-color-text-default) focus-visible:outline-1 focus-visible:outline-(--cui-color-outline)';

/**
 * Password input with a reveal toggle. Commits like `TextField` (after a
 * pause, on blur or Enter); clearing calls `onClear` (remove the own value).
 */
export function SecretInput({
  id,
  value,
  onChange,
  onClear,
  required,
  hasRowError,
  placeholder,
  disabled,
  width,
  focusOnMount,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
}: t.SecretInputProps) {
  const localize = useLocalize();
  const errorId = useId();
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { draft, setDraft, commit } = useDraftValue<string>({
    value,
    autoCommit: isFilledText,
    onCommit: (next) => {
      if (isFilledText(next)) {
        setError(null);
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
  const name = ariaLabel ?? id;
  const shownError = hasRowError ? null : error;
  const describedBy = [ariaDescribedBy, shownError ? errorId : undefined].filter(Boolean).join(' ');

  return (
    <div className={cn('flex w-full flex-col gap-1', widthClass(width))}>
      <div className="relative w-full">
        <input
          id={id}
          type={revealed || isEnvReference(draft) ? 'text' : 'password'}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setNotice(null);
            if (error && isFilledText(e.target.value)) setError(null);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
          placeholder={placeholder ?? localize('com_admin_ui_enter_value')}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          ref={focusOnMount ? focusElement : undefined}
          aria-label={ariaLabel}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cn(INPUT_CLASSES, 'pr-9')}
        />
        {draft !== '' && !isEnvReference(draft) && (
          <button
            type="button"
            onClick={() => setRevealed((prev) => !prev)}
            disabled={disabled}
            aria-pressed={revealed}
            aria-label={localize(
              revealed ? 'com_admin_config_ctl_secret_hide' : 'com_admin_config_ctl_secret_show',
              { name },
            )}
            className="icon-btn icon-btn-xs absolute top-1/2 right-1 -translate-y-1/2"
          >
            <DecorativeIcon name={revealed ? 'eye-closed' : 'eye'} size="sm" />
          </button>
        )}
      </div>
      {shownError && (
        <span id={errorId} role="alert" className="text-xs text-(--cui-color-text-danger)">
          {shownError}
        </span>
      )}
      {notice && !error && <FieldNotice>{notice}</FieldNotice>}
    </div>
  );
}

/**
 * A secret that is set but redacted by the backend: a read-only masked
 * display with explicit Replace (and, when the target owns it, Remove)
 * actions. The masked value is never editable and never emitted through
 * onChange, so it cannot enter a save payload.
 */
export function SecretField({
  id,
  value,
  maskedValue,
  onChange,
  onCancel,
  onRemove,
  hasPendingEdit,
  disabled,
  width,
  ...ariaProps
}: t.SecretFieldProps) {
  const localize = useLocalize();
  const [replacing, setReplacing] = useState(false);
  const showInput = replacing || value !== '' || (hasPendingEdit ?? false);
  const fieldName = ariaProps['aria-label'] ?? id;

  if (!showInput) {
    return (
      <div className={cn('flex w-full items-center gap-2', widthClass(width))}>
        <input
          id={id}
          value={maskedValue}
          readOnly
          disabled
          aria-label={localize('com_admin_a11y_secret_configured', { name: fieldName })}
          className={cn(INPUT_CLASSES, 'flex-1 font-mono')}
        />
        {!disabled && (
          <button
            type="button"
            onClick={() => setReplacing(true)}
            aria-label={localize('com_admin_a11y_secret_replace', { name: fieldName })}
            className={ACTION_BUTTON_CLASSES}
          >
            <DecorativeIcon name="pencil" size="sm" />
            <span>{localize('com_admin_config_secret_replace')}</span>
          </button>
        )}
        {!disabled && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={localize('com_admin_config_ctl_secret_remove_a11y', { name: fieldName })}
            className={ACTION_BUTTON_CLASSES}
          >
            <DecorativeIcon name="trash" size="sm" />
            <span>{localize('com_admin_config_ctl_secret_remove')}</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex w-full items-start gap-2', widthClass(width))}>
      <SecretInput
        id={id}
        value={value}
        onChange={onChange}
        disabled={disabled}
        focusOnMount={replacing && value === ''}
        placeholder={localize('com_admin_config_ctl_secret_new')}
        {...ariaProps}
      />
      {!disabled && (
        <button
          type="button"
          onClick={() => {
            setReplacing(false);
            onCancel();
          }}
          aria-label={localize('com_admin_a11y_secret_cancel_replace', { name: fieldName })}
          className={cn(ACTION_BUTTON_CLASSES, 'mt-1')}
        >
          <DecorativeIcon name="cross" size="sm" />
          <span>{localize('com_admin_ui_cancel')}</span>
        </button>
      )}
    </div>
  );
}
