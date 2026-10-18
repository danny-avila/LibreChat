import type * as t from '~/admin/types';
import { defaultChoiceLabel } from './display';
import { useLocalize } from '~/admin/hooks';
import { ButtonGroup } from '~/admin/ui';

const CHOICE_VALUE: Record<t.TriStateChoice, boolean | undefined> = {
  default: undefined,
  on: true,
  off: false,
};

function toChoice(value: boolean | undefined): t.TriStateChoice {
  if (value === undefined) return 'default';
  return value ? 'on' : 'off';
}

/**
 * Optional boolean as a segmented control: "Default (On)" / On / Off; with
 * no known default, "Not set (LibreChat decides)" (or `unsetLabel`).
 * Default emits `undefined` (no own value), so turning a setting on and back
 * to Default never pins an explicit `false`.
 */
export function TriStateField({
  id,
  value,
  defaultValue,
  defaultSource = 'default',
  defaultFromGlobal,
  unsetLabel,
  onChange,
  disabled,
  'aria-label': ariaLabel,
}: t.TriStateFieldProps) {
  const localize = useLocalize();
  const selected = toChoice(value);
  const defaultLabel =
    defaultValue === undefined
      ? (unsetLabel ?? localize('com_admin_config_ctl_default_unknown_tristate'))
      : defaultChoiceLabel(
          { value: defaultValue, source: defaultSource, fromGlobal: defaultFromGlobal },
          localize,
        );
  const options: Array<{ value: t.TriStateChoice; label: string; disabled?: boolean }> = [
    { value: 'default', label: defaultLabel },
    { value: 'on', label: localize('com_admin_config_ctl_on') },
    { value: 'off', label: localize('com_admin_config_ctl_off') },
  ];

  return (
    <ButtonGroup
      id={id}
      aria-label={ariaLabel}
      data-tristate={selected}
      className="max-w-full self-start"
      options={options.map((option) => ({ ...option, disabled }))}
      selected={selected}
      onClick={(choice) => {
        if (disabled || choice === selected) return;
        onChange(CHOICE_VALUE[choice as t.TriStateChoice]);
      }}
    />
  );
}
