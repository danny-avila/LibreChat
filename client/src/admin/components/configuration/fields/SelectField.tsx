import type * as t from '~/admin/types';
import { INPUT_CLASSES, widthClass } from './display';
import { useLocalize } from '~/admin/hooks';
import { cn } from '~/admin/utils';
import { Icon } from '~/admin/ui';

/** Option value of the leading "Default (…)" choice; never a schema value. */
const DEFAULT_CHOICE = '\u0000default';
const PLACEHOLDER_CHOICE = '\u0000placeholder';

/**
 * Single-choice select: a styled native `<select>`, so a `<label for>` targets
 * the control itself and options keep listbox/option semantics. With
 * `onClear`, a leading "Default (…)" option returns the field to its default;
 * `''` enum members are offered as "None"; a value outside the options is
 * kept and shown as unknown instead of being dropped.
 */
export function SelectField({
  id,
  value,
  options,
  onChange,
  onClear,
  defaultLabel,
  disabled,
  placeholder,
  width,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
}: t.SelectFieldProps) {
  const localize = useLocalize();
  const hasDefault = onClear != null;
  const hasEmptyOption = options.some((option) => option.value === '');
  const isUnset = value == null || (value === '' && !hasEmptyOption);
  const isKnown = isUnset || options.some((option) => option.value === value);
  let selected = isUnset ? PLACEHOLDER_CHOICE : value;
  if (isUnset && hasDefault) selected = DEFAULT_CHOICE;

  return (
    <div className={cn('relative w-full', widthClass(width))}>
      <select
        id={id}
        value={selected}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        onChange={(event) => {
          const next = event.target.value;
          if (next === DEFAULT_CHOICE) onClear?.();
          else if (next !== PLACEHOLDER_CHOICE) onChange(next);
        }}
        className={cn(INPUT_CLASSES, 'cursor-pointer appearance-none pr-8')}
      >
        {hasDefault && (
          <option value={DEFAULT_CHOICE}>
            {defaultLabel ?? localize('com_admin_config_ctl_default')}
          </option>
        )}
        {isUnset && !hasDefault && (
          <option value={PLACEHOLDER_CHOICE} disabled>
            {placeholder || localize('com_admin_ui_select')}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.value === '' && option.label === ''
              ? localize('com_admin_config_ctl_empty_option')
              : option.label}
          </option>
        ))}
        {!isKnown && (
          <option value={value}>
            {localize('com_admin_config_ctl_unknown_option', { value })}
          </option>
        )}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2.5 flex -translate-y-1/2 text-(--cui-color-text-muted)"
      >
        <Icon name="chevron-down" size="sm" />
      </span>
    </div>
  );
}
