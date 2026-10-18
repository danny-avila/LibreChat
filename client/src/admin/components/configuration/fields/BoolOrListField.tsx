import { useState } from 'react';
import type * as t from '~/admin/types';
import { useLocalize } from '~/admin/hooks';
import { ButtonGroup } from '~/admin/ui';
import { ListField } from './ListField';

type Mode = 'default' | 'off' | 'all' | 'some';

function modeOf(value: t.ConfigValue): Mode {
  if (Array.isArray(value)) return 'some';
  if (value === true) return 'all';
  if (value === false) return 'off';
  return 'default';
}

function toStrings(value: t.ConfigValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/**
 * `boolean | string[]` (e.g. a spec's Skills or Run in background): Off, All,
 * or Only these (a list). "Only these" stays local until the list has an
 * item, so switching modes never saves an empty list.
 */
export function BoolOrListField({
  id,
  value,
  onChange,
  onClear,
  defaultLabel,
  disabled,
  options,
  itemLabel,
  'aria-label': ariaLabel,
}: t.BoolOrListFieldProps) {
  const localize = useLocalize();
  const valueMode = modeOf(value);
  const [pendingSome, setPendingSome] = useState(false);
  const mode: Mode = pendingSome && valueMode !== 'some' ? 'some' : valueMode;

  const choose = (next: Mode) => {
    if (disabled || next === mode) return;
    setPendingSome(next === 'some');
    if (next === 'default') onClear?.();
    if (next === 'off') onChange(false);
    if (next === 'all') onChange(true);
  };

  const choices: Array<{ value: Mode; label: string }> = [
    ...(onClear
      ? [
          {
            value: 'default' as const,
            label: defaultLabel ?? localize('com_admin_config_ctl_default'),
          },
        ]
      : []),
    { value: 'off', label: localize('com_admin_config_ctl_off') },
    { value: 'all', label: localize('com_admin_config_ctl_bool_list_all') },
    { value: 'some', label: localize('com_admin_config_ctl_bool_list_some') },
  ];

  return (
    <div id={id} className="flex w-full flex-col gap-2">
      <ButtonGroup
        aria-label={ariaLabel}
        className="max-w-full self-start"
        options={choices.map((choice) => ({ ...choice, disabled }))}
        selected={mode}
        onClick={(next) => choose(next as Mode)}
      />
      {mode === 'some' && (
        <ListField
          id={`${id}-list`}
          values={toStrings(value)}
          options={options}
          itemLabel={itemLabel}
          disabled={disabled}
          onChange={(next) => {
            setPendingSome(false);
            onChange(next);
          }}
          onClear={() => {
            setPendingSome(true);
            if (onClear) onClear();
            else onChange(false);
          }}
          aria-label={ariaLabel}
        />
      )}
    </div>
  );
}
