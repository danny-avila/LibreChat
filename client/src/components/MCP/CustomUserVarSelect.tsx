import React, { useMemo } from 'react';
import * as Ariakit from '@ariakit/react';
import { ChevronDown } from 'lucide-react';
import {
  mcpCustomUserVarSeparator,
  splitMCPCustomUserVarValue,
  normalizeMCPCustomUserVarValues,
} from 'librechat-data-provider';
import type { MCPCustomUserVarValue } from 'librechat-data-provider';
import cn from '~/utils/cn';

interface CustomUserVarSelectProps {
  id: string;
  values: MCPCustomUserVarValue[];
  multiple?: boolean;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  labelId: string;
  autoFocus?: boolean;
}

/**
 * Strict select for a custom user variable declaring predefined `values`.
 * Selections are stored as a single string so the credential shape stays
 * identical to free-text variables: comma-joined when `multiple` is set.
 */
export default function CustomUserVarSelect({
  id,
  values,
  multiple,
  value,
  onChange,
  placeholder,
  labelId,
  autoFocus,
}: CustomUserVarSelectProps) {
  const choices = useMemo(() => normalizeMCPCustomUserVarValues(values), [values]);
  const selected = useMemo(
    () => (multiple === true ? splitMCPCustomUserVarValue(value) : value),
    [multiple, value],
  );

  const displayed = useMemo(() => {
    const selectedValues = Array.isArray(selected) ? selected : [selected];
    const labels = selectedValues
      .filter((selection) => selection !== '')
      .map((selection) => choices.find((choice) => choice.value === selection)?.label ?? selection);
    return labels.length > 0 ? labels.join(', ') : placeholder;
  }, [choices, placeholder, selected]);

  const handleChange = (next: string | string[]) => {
    onChange(Array.isArray(next) ? next.join(mcpCustomUserVarSeparator) : next);
  };

  const hasSelection = Array.isArray(selected) ? selected.length > 0 : selected !== '';

  return (
    <Ariakit.SelectProvider value={selected} setValue={handleChange}>
      <Ariakit.Select
        id={id}
        /* eslint-disable-next-line jsx-a11y/no-autofocus -- mirrors the text inputs of this form */
        autoFocus={autoFocus}
        aria-labelledby={labelId}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded border border-border-medium',
          'bg-transparent px-2 py-1 text-left focus:outline-none sm:text-sm',
          hasSelection ? 'text-text-primary' : 'text-text-secondary',
        )}
      >
        <span className="truncate">{displayed}</span>
        <ChevronDown className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
      </Ariakit.Select>
      <Ariakit.SelectPopover
        gutter={4}
        sameWidth
        unmountOnHide
        className={cn(
          'z-50 flex max-h-[300px] flex-col overflow-auto overscroll-contain rounded-lg',
          'border border-border-light bg-surface-secondary px-1.5 py-1 text-text-primary shadow-lg',
          'outline-none',
        )}
      >
        {choices.map((choice) => (
          <Ariakit.SelectItem
            key={choice.value}
            value={choice.value}
            className={cn(
              'flex items-center gap-2 rounded px-2 py-1.5 text-sm outline-none',
              'hover:cursor-pointer hover:bg-surface-hover',
              'data-[active-item]:bg-surface-hover',
            )}
          >
            {multiple === true && <Ariakit.SelectItemCheck className="text-primary" />}
            <span className="truncate">{choice.label}</span>
          </Ariakit.SelectItem>
        ))}
      </Ariakit.SelectPopover>
    </Ariakit.SelectProvider>
  );
}
