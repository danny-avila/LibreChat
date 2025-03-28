import * as React from 'react';
import {
  Select,
  SelectArrow,
  SelectItem,
  SelectItemCheck,
  SelectLabel,
  SelectPopover,
  SelectProvider,
} from '@ariakit/react';
import { cn } from '~/utils';

interface MultiSelectProps<T extends string> {
  // Required props
  items: T[];
  label?: string;

  // Optional props with defaults
  placeholder?: string;
  defaultSelectedValues?: T[];
  onSelectedValuesChange?: (values: T[]) => void;

  // Optional styling props
  className?: string;
  labelClassName?: string;
  selectClassName?: string;
  popoverClassName?: string;
  itemClassName?: string;
}

// Function to nicely format selected values
function renderSelectedValues<T extends string>(values: T[], placeholder?: string) {
  if (values.length === 0) {
    return placeholder || 'Select...';
  }
  if (values.length === 1) {
    return values[0];
  }
  return `${values.length} items selected`;
}

export default function MultiSelect<T extends string>({
  items,
  label,
  placeholder = 'Select...',
  defaultSelectedValues = [],
  onSelectedValuesChange,
  className,
  labelClassName,
  selectClassName,
  popoverClassName,
  itemClassName,
}: MultiSelectProps<T>) {
  const [selectedValues, setSelectedValues] = React.useState<T[]>(defaultSelectedValues);

  const handleValueChange = (values: T[]) => {
    setSelectedValues(values);
    if (onSelectedValuesChange) {
      onSelectedValuesChange(values);
    }
  };

  return (
    <div className={cn('h-full', className)}>
      <SelectProvider value={selectedValues} setValue={handleValueChange}>
        {label && (
          <SelectLabel className={cn('mb-1 block text-sm text-text-primary', labelClassName)}>
            {label}
          </SelectLabel>
        )}
        <Select
          className={cn(
            'flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm',
            'bg-surface-tertiary text-text-primary hover:bg-surface-hover',
            'shadow-sm hover:cursor-pointer',
            'outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75',
            'cursor-default',
            selectClassName,
          )}
        >
          <span className="truncate">{renderSelectedValues(selectedValues, placeholder)}</span>
          <SelectArrow className="ml-1 stroke-1 text-base opacity-75" />
        </Select>
        <SelectPopover
          gutter={4}
          sameWidth
          modal
          unmountOnHide
          className={cn(
            'animate-popover z-50 flex max-h-[300px]',
            'flex-col overflow-auto overscroll-contain rounded-xl',
            'bg-surface-secondary px-1.5 py-1 text-text-primary shadow-lg',
            'border border-border-light',
            'outline-none',
            popoverClassName,
          )}
        >
          {items.map((value) => (
            <SelectItem
              key={value}
              value={value}
              className={cn(
                'flex cursor-default items-center gap-2 rounded-lg px-2 py-1.5',
                'scroll-m-1 outline-none transition-colors',
                'hover:bg-black/[0.075] dark:hover:bg-white/10',
                'data-[active-item]:bg-black/[0.075] dark:data-[active-item]:bg-white/10',
                'w-full min-w-0 text-sm',
                itemClassName,
              )}
            >
              <SelectItemCheck className="text-primary" />
              <span className="truncate">{value}</span>
            </SelectItem>
          ))}
        </SelectPopover>
      </SelectProvider>
    </div>
  );
}
