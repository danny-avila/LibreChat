import { useId, useState } from 'react';
import type * as t from '~/admin/types';
import { NumberField as CUINumberField } from '~/admin/ui';
import { useDraftValue, useLocalize } from '~/admin/hooks';
import { FieldNotice } from './Notice';
import { widthClass } from './display';
import { cn } from '~/admin/utils';

function toText(value: number | undefined): string {
  return value != null ? String(value) : '';
}

function rangeError(
  parsed: number,
  { min, max, int }: Pick<t.NumberFieldProps, 'min' | 'max' | 'int'>,
  localize: t.LocalizeFn,
): string | null {
  if (Number.isNaN(parsed)) return localize('com_admin_config_ctl_number_invalid');
  if (int && !Number.isInteger(parsed)) return localize('com_admin_config_ctl_number_int');
  if (min != null && parsed < min) return localize('com_admin_config_ctl_number_min', { min });
  if (max != null && parsed > max) return localize('com_admin_config_ctl_number_max', { max });
  return null;
}

/**
 * Number control with an optional unit suffix (MB, ms, …), schema min/max/step
 * and the default shown as placeholder. Out-of-range input is committed like
 * any other value, so the save pipeline reports it (counted, listed in the
 * review, Save blocked) instead of it being left out of the save unseen; the
 * control explains it inline unless the row already shows that error.
 * Clearing calls `onClear` (remove the own value).
 */
export function NumberField({
  id,
  value,
  onChange,
  onClear,
  required,
  placeholder,
  disabled,
  min,
  max,
  step,
  int,
  unit,
  width,
  hasRowError,
  'aria-describedby': ariaDescribedBy,
  ...ariaProps
}: t.NumberFieldProps) {
  const localize = useLocalize();
  const errorId = useId();
  const unitId = useId();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { draft, setDraft, commit } = useDraftValue<string>({
    value: toText(value),
    autoCommit: (next) =>
      next !== '' && rangeError(Number(next), { min, max, int }, localize) == null,
    onCommit: (next) => {
      if (next === '') {
        if (required) {
          setError(localize('com_admin_config_ctl_required'));
          return false;
        }
        setError(null);
        if (!onClear) {
          onChange(undefined);
          return;
        }
        const cleared = onClear();
        setNotice(cleared === false ? localize('com_admin_config_ctl_clear_unavailable') : null);
        return 'reset';
      }
      const parsed = Number(next);
      const problem = rangeError(parsed, { min, max, int }, localize);
      setError(problem);
      if (Number.isNaN(parsed)) return false;
      onChange(parsed);
    },
  });
  const shownError = hasRowError ? null : error;

  const fractionStep = max != null && max <= 1 ? 0.01 : undefined;
  const resolvedStep = step ?? (int ? 1 : fractionStep);
  const describedBy = [ariaDescribedBy, unit ? unitId : undefined, shownError ? errorId : undefined]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cn('cui-field flex w-full flex-col gap-1', widthClass(width))}>
      <CUINumberField
        id={id}
        value={draft}
        onChange={(next) => {
          setDraft(next);
          setNotice(null);
          if (error) setError(null);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        placeholder={placeholder ?? (unit ? undefined : localize('com_admin_ui_enter_number'))}
        disabled={disabled}
        min={min}
        max={max}
        step={resolvedStep ?? 'any'}
        loading={false}
        hideControls
        endContent={
          unit ? (
            <span id={unitId} className="pr-1 text-xs text-(--cui-color-text-muted)">
              {localize(`com_admin_config_ctl_unit_${unit}`)}
            </span>
          ) : undefined
        }
        aria-invalid={shownError ? true : undefined}
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
