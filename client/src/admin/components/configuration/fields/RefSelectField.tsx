import { useId } from 'react';
import type * as t from '~/admin/types';
import { useLocalize, useOptionSources } from '~/admin/hooks';
import { TextField } from './TextField';

/**
 * Reference to another configured thing (an endpoint, a model, an MCP
 * server): a text input with suggestions from `useOptionSources`, free entry,
 * and a warning when the value matches none of the known options.
 */
export function RefSelectField({
  id,
  value,
  source,
  extraOptions,
  onChange,
  onClear,
  placeholder,
  disabled,
  width = 'M',
  'aria-label': ariaLabel,
}: t.RefSelectFieldProps) {
  const localize = useLocalize();
  const listId = useId();
  const warningId = useId();
  const { options, isLoading } = useOptionSources(source);
  const allOptions = extraOptions ? [...extraOptions, ...options] : options;
  const isUnknown =
    !isLoading &&
    allOptions.length > 0 &&
    value != null &&
    value !== '' &&
    !allOptions.some((option) => option.value === value);

  return (
    <div className="flex w-full flex-col gap-1">
      <TextField
        id={id}
        value={value ?? ''}
        list={listId}
        onChange={onChange}
        onClear={onClear}
        placeholder={placeholder ?? localize('com_admin_config_ctl_ref_placeholder')}
        disabled={disabled}
        width={width}
        aria-label={ariaLabel}
        aria-describedby={isUnknown ? warningId : undefined}
      />
      <datalist id={listId}>
        {allOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </datalist>
      {isUnknown && (
        <span id={warningId} className="text-xs text-(--cui-color-text-warning)">
          {localize('com_admin_config_ctl_ref_unknown', { value })}
        </span>
      )}
    </div>
  );
}
