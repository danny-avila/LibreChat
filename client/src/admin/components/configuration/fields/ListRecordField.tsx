import { useState, useEffect, useRef } from 'react';
import type * as t from '~/admin/types';
import { useLocalize } from '~/admin/hooks';
import { ButtonGroup } from '~/admin/ui';
import { ListField } from './ListField';
import { CodeField } from './CodeField';

type Mode = 'list' | 'advanced';

function inferMode(value: t.ConfigValue): Mode {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return 'advanced';
  return 'list';
}

export function ListRecordField({
  id,
  value,
  onChange,
  disabled,
  'aria-label': ariaLabel,
}: t.ListRecordFieldProps) {
  const localize = useLocalize();
  const [mode, setMode] = useState<Mode>(() => inferMode(value));

  /* The mode follows the value only when its kind changes (a list became a record), so an
     edit within the current kind keeps the mode the person chose. */
  const valueKind = Array.isArray(value) ? 'array' : typeof value;
  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => {
    setMode(inferMode(valueRef.current));
  }, [valueKind]);

  const handleToggle = () => {
    if (mode === 'list') {
      const arr = Array.isArray(value)
        ? value.filter((v): v is string => typeof v === 'string')
        : [];
      const record: Record<string, Record<string, never>> = {};
      for (const key of arr) record[key] = {};
      onChange(record);
      setMode('advanced');
    } else {
      const obj =
        typeof value === 'object' && value !== null && !Array.isArray(value)
          ? (value as Record<string, t.ConfigValue>)
          : {};
      onChange(Object.keys(obj));
      setMode('list');
    }
  };

  return (
    <div id={id} className="flex w-full max-w-150 flex-col">
      {!disabled && (
        <ButtonGroup
          aria-label={localize('com_admin_config_ctl_list_form', { name: ariaLabel ?? '' })}
          className="mb-2 max-w-full self-start"
          selected={mode}
          onClick={(next) => {
            if (!disabled && next !== mode) handleToggle();
          }}
          options={[
            { value: 'list', label: localize('com_admin_config_ctl_list_mode'), disabled },
            { value: 'advanced', label: localize('com_admin_config_ctl_yaml_mode'), disabled },
          ]}
        />
      )}
      {mode === 'list' && (
        <ListField
          id={`${id}-list`}
          values={
            Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
          }
          onChange={(v) => onChange(v)}
          disabled={disabled}
          aria-label={ariaLabel}
        />
      )}
      {mode === 'advanced' && (
        <CodeField
          id={`${id}-code`}
          value={value}
          onChange={onChange}
          disabled={disabled}
          aria-label={ariaLabel}
        />
      )}
    </div>
  );
}
