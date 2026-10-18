import { useState } from 'react';
import type * as t from '~/admin/types';
import { TextareaField } from './TextareaField';
import { SelectField } from './SelectField';
import { NumberField } from './NumberField';
import { useLocalize } from '~/admin/hooks';
import { ButtonGroup } from '~/admin/ui';
import { TextField } from './TextField';
import { ListField } from './ListField';

type Mode = 'default' | 'off' | 'on' | 'number' | 'string' | 'list';

const NUMERIC = /^-?\d+(\.\d+)?$/;
const MODE_LABEL_KEYS: Record<Mode, string> = {
  default: 'com_admin_config_ctl_default',
  off: 'com_admin_config_ctl_off',
  on: 'com_admin_config_ctl_on',
  number: 'com_admin_config_ctl_kind_number',
  string: 'com_admin_config_ctl_kind_text',
  list: 'com_admin_config_ctl_kind_list',
};

function modeOf(value: t.ConfigValue): Mode {
  if (value === true) return 'on';
  if (value === false) return 'off';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'string';
  if (Array.isArray(value)) return 'list';
  return 'default';
}

function encodeChoice(value: t.ConfigValue): string | undefined {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return typeof value === 'string' ? value : undefined;
}

/**
 * Union of scalars. `number | string` is a number input that still shows a
 * non-numeric string as text; `boolean | enum` is one select with Off/On and
 * the enum values; other unions pick the member type with a segmented control
 * (Default / Off / On / Number / Text / List) and show its input.
 */
export function ScalarUnionField({
  id,
  value,
  kinds,
  options,
  onChange,
  onClear,
  defaultLabel,
  disabled,
  unit,
  'aria-label': ariaLabel,
}: t.ScalarUnionFieldProps) {
  const localize = useLocalize();
  const valueMode = modeOf(value);
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);
  const hasBoolean = kinds.includes('boolean');
  const valueKinds = kinds.filter((kind) => kind !== 'boolean');

  if (hasBoolean && options?.length) {
    return (
      <SelectField
        id={id}
        value={encodeChoice(value)}
        options={[
          { value: 'false', label: localize('com_admin_config_ctl_off') },
          { value: 'true', label: localize('com_admin_config_ctl_on') },
          ...options,
        ]}
        onChange={(next) => {
          if (next === 'true' || next === 'false') onChange(next === 'true');
          else onChange(next);
        }}
        onClear={onClear}
        defaultLabel={defaultLabel}
        disabled={disabled}
        aria-label={ariaLabel}
      />
    );
  }

  const isNumberText =
    !hasBoolean && valueKinds.length === 2 && kinds.includes('number') && kinds.includes('string');
  if (isNumberText) {
    if (typeof value === 'string' && !NUMERIC.test(value)) {
      return (
        <TextField
          id={id}
          value={value}
          onChange={(next) => onChange(NUMERIC.test(next) ? Number(next) : next)}
          onClear={onClear}
          disabled={disabled}
          aria-label={ariaLabel}
        />
      );
    }
    return (
      <NumberField
        id={id}
        value={value == null || value === '' ? undefined : Number(value)}
        onChange={(next) => onChange(next)}
        onClear={onClear}
        unit={unit}
        disabled={disabled}
        aria-label={ariaLabel}
      />
    );
  }

  const mode = pendingMode ?? valueMode;
  const modes: Mode[] = [
    ...(onClear ? (['default'] as const) : []),
    ...(hasBoolean ? (['off', 'on'] as const) : []),
    ...valueKinds,
  ];

  const choose = (next: Mode) => {
    if (disabled || next === mode) return;
    if (next === 'default') {
      setPendingMode(null);
      onClear?.();
      return;
    }
    if (next === 'off' || next === 'on') {
      setPendingMode(null);
      onChange(next === 'on');
      return;
    }
    setPendingMode(next === valueMode ? null : next);
  };
  const commit = (next: t.ConfigValue) => {
    setPendingMode(null);
    onChange(next);
  };
  const clearValue = () => {
    setPendingMode(null);
    if (onClear) onClear();
    else onChange(undefined);
  };
  const ownValue = mode === valueMode ? value : undefined;

  return (
    <div id={id} className="flex w-full flex-col gap-2">
      <ButtonGroup
        aria-label={ariaLabel}
        className="max-w-full self-start"
        options={modes.map((m) => ({
          value: m,
          label: m === 'default' && defaultLabel ? defaultLabel : localize(MODE_LABEL_KEYS[m]),
          disabled,
        }))}
        selected={mode}
        onClick={(next) => choose(next as Mode)}
      />
      {mode === 'number' && (
        <NumberField
          id={`${id}-number`}
          value={typeof ownValue === 'number' ? ownValue : undefined}
          onChange={commit}
          onClear={clearValue}
          unit={unit}
          disabled={disabled}
          aria-label={ariaLabel}
        />
      )}
      {mode === 'string' && (
        <StringInput
          id={`${id}-text`}
          value={typeof ownValue === 'string' ? ownValue : ''}
          onChange={commit}
          onClear={clearValue}
          disabled={disabled}
          aria-label={ariaLabel}
        />
      )}
      {mode === 'list' && (
        <ListField
          id={`${id}-list`}
          values={Array.isArray(ownValue) ? ownValue.map(String) : []}
          onChange={commit}
          onClear={clearValue}
          disabled={disabled}
          aria-label={ariaLabel}
        />
      )}
    </div>
  );
}

function StringInput({
  id,
  value,
  onChange,
  onClear,
  disabled,
  'aria-label': ariaLabel,
}: Pick<t.TextFieldProps, 'id' | 'value' | 'onChange' | 'onClear' | 'disabled' | 'aria-label'>) {
  if (value.includes('\n')) {
    return (
      <TextareaField
        id={id}
        value={value}
        onChange={onChange}
        onClear={onClear}
        disabled={disabled}
        aria-label={ariaLabel}
      />
    );
  }
  return (
    <TextField
      id={id}
      value={value}
      onChange={onChange}
      onClear={onClear}
      disabled={disabled}
      aria-label={ariaLabel}
    />
  );
}
