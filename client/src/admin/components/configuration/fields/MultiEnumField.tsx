import { useMemo } from 'react';
import type * as t from '~/admin/types';
import { useLocalize } from '~/admin/hooks';
import { Checkbox } from '~/admin/ui';

/**
 * Set of enum values as a checkbox grid (e.g. agent capabilities): no
 * duplicates are possible and every choice is visible. Existing order is
 * kept and newly checked values are appended; values the schema does not
 * list are kept and shown at the end.
 */
export function MultiEnumField({
  id,
  value,
  options,
  onChange,
  clearOnEmpty,
  disabled,
  'aria-label': ariaLabel,
}: t.MultiEnumFieldProps) {
  const localize = useLocalize();
  const selected = useMemo(() => new Set(value ?? []), [value]);
  const known = useMemo(() => new Set(options.map((option) => option.value)), [options]);
  const unknown = (value ?? []).filter((item) => !known.has(item));
  const allOptions: t.MultiEnumOption[] = [
    ...options,
    ...unknown.map((item) => ({
      value: item,
      label: localize('com_admin_config_ctl_unknown_option', { value: item }),
    })),
  ];

  const toggle = (optionValue: string, checked: boolean) => {
    const current = value ?? [];
    const next = checked
      ? [...current, optionValue]
      : current.filter((item) => item !== optionValue);
    onChange(next.length === 0 && clearOnEmpty ? undefined : next);
  };

  return (
    <fieldset
      id={id}
      aria-label={ariaLabel}
      className="m-0 grid w-full max-w-150 grid-cols-1 gap-x-6 gap-y-2 border-none p-0 sm:grid-cols-2"
    >
      {allOptions.map((option) => (
        <div key={option.value} className="flex flex-col gap-0.5">
          <Checkbox
            id={`${id}-${option.value.replace(/[^\w-]/g, '-')}`}
            checked={selected.has(option.value)}
            disabled={disabled}
            label={option.label}
            onCheckedChange={(next) => toggle(option.value, next === true)}
          />
          {option.description && (
            <span className="pl-6 text-xs text-(--cui-color-text-muted)">{option.description}</span>
          )}
        </div>
      ))}
    </fieldset>
  );
}
