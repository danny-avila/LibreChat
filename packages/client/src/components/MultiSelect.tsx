import React, { useRef, useState } from 'react';
import {
  Select,
  SelectArrow,
  SelectItem,
  SelectItemCheck,
  SelectLabel,
  SelectPopover,
  SelectProvider,
} from '@ariakit/react';
import './AnimatePopover.css';
import { cn } from '~/utils';

type MultiSelectItem<T extends string> = T | { label: string; value: T };

function getItemValue<T extends string>(item: MultiSelectItem<T>): T {
  return typeof item === 'string' ? item : item.value;
}

function getItemLabel<T extends string>(item: MultiSelectItem<T>): string {
  return typeof item === 'string' ? item : item.label;
}

interface MultiSelectProps<T extends string> {
  items: MultiSelectItem<T>[];
  label?: string;
  placeholder?: string;
  onSelectedValuesChange?: (values: T[]) => void;
  renderSelectedValues?: (
    values: T[],
    placeholder?: string,
    items?: MultiSelectItem<T>[],
  ) => React.ReactNode;
  className?: string;
  itemClassName?: string;
  labelClassName?: string;
  selectClassName?: string;
  selectIcon?: React.ReactNode;
  popoverClassName?: string;
  selectItemsClassName?: string;
  selectedValues: T[];
  setSelectedValues: (values: T[]) => void;
  renderItemContent?: (
    value: T,
    defaultContent: React.ReactNode,
    isSelected: boolean,
  ) => React.ReactNode;
}

function defaultRender<T extends string>(
  values: T[],
  placeholder?: string,
  items?: MultiSelectItem<T>[],
) {
  if (values.length === 0) {
    return placeholder || 'Select...';
  }
  if (values.length === 1) {
    // Find the item to get its label
    if (items) {
      const item = items.find((item) => getItemValue(item) === values[0]);
      if (item) {
        return getItemLabel(item);
      }
    }
    return values[0];
  }
  return `${values.length} items selected`;
}

export default function MultiSelect<T extends string>({
  items,
  label,
  placeholder = 'Select...',
  onSelectedValuesChange,
  renderSelectedValues = defaultRender,
  className,
  selectIcon,
  itemClassName,
  labelClassName,
  selectClassName,
  popoverClassName,
  selectItemsClassName,
  selectedValues = [],
  setSelectedValues,
  renderItemContent,
}: MultiSelectProps<T>) {
  const selectRef = useRef<HTMLButtonElement>(null);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const handleValueChange = (values: T[]) => {
    setSelectedValues(values);
    if (onSelectedValuesChange) {
      onSelectedValuesChange(values);
    }
  };

  return (
    <div className={className}>
      <SelectProvider
        value={selectedValues}
        setValue={handleValueChange}
        open={isPopoverOpen}
        setOpen={setIsPopoverOpen}
      >
        {label && (
          <SelectLabel className={cn('mb-1 block text-sm text-text-primary', labelClassName)}>
            {label}
          </SelectLabel>
        )}
        <Select
          ref={selectRef}
          className={cn(
            'flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm',
            'bg-surface-tertiary text-text-primary shadow-sm hover:cursor-pointer hover:bg-surface-hover',
            'outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
            selectClassName,
            selectedValues.length > 0 && selectItemsClassName != null && selectItemsClassName,
          )}
          onChange={(e) => e.stopPropagation()}
        >
          {selectIcon && <span>{selectIcon as React.JSX.Element}</span>}
          <span className="mr-auto hidden truncate md:block">
            {renderSelectedValues(selectedValues, placeholder, items)}
          </span>
          <SelectArrow
            className={cn(
              'ml-1 hidden stroke-1 text-base opacity-75 transition-transform duration-300 md:block',
              isPopoverOpen && 'rotate-180',
            )}
          />
        </Select>
        <SelectPopover
          gutter={4}
          sameWidth
          modal
          unmountOnHide
          finalFocus={selectRef}
          className={cn(
            'animate-popover z-40 flex max-h-[300px]',
            'flex-col overflow-auto overscroll-contain rounded-xl',
            'bg-surface-secondary px-1.5 py-1 text-text-primary shadow-lg',
            'border border-border-light',
            'outline-none',
            popoverClassName,
          )}
        >
          {items.map((item) => {
            const value = getItemValue(item);
            const label = getItemLabel(item);
            const defaultContent = (
              <>
                <SelectItemCheck className="mr-0.5 text-primary" />
                <span className="truncate">{label}</span>
              </>
            );
            const isCurrentItemSelected = selectedValues.includes(value);
            return (
              <SelectItem
                key={value}
                value={value}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-2 py-1.5 hover:cursor-pointer',
                  'scroll-m-1 outline-none transition-colors',
                  'hover:bg-black/[0.075] dark:hover:bg-white/10',
                  'data-[active-item]:bg-black/[0.075] dark:data-[active-item]:bg-white/10',
                  'w-full min-w-0 text-sm',
                  itemClassName,
                )}
              >
                {renderItemContent
                  ? (renderItemContent(
                      value,
                      defaultContent,
                      isCurrentItemSelected,
                    ) as React.JSX.Element)
                  : (defaultContent as React.JSX.Element)}
              </SelectItem>
            );
          })}
        </SelectPopover>
      </SelectProvider>
    </div>
  );
}
