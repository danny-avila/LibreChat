import React, { useRef, useState, useMemo, useCallback } from 'react';
import {
  Select,
  SelectArrow,
  SelectItem,
  SelectItemCheck,
  SelectLabel,
  SelectPopover,
  SelectProvider,
} from '@ariakit/react';
import { Search, X } from 'lucide-react';
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
  searchable?: boolean;
  searchThreshold?: number;
  searchPlaceholder?: string;
  noResultsText?: string;
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
  searchable = false,
  searchThreshold = 5,
  searchPlaceholder = 'Search...',
  noResultsText = 'No results found',
}: MultiSelectProps<T>) {
  const selectRef = useRef<HTMLButtonElement>(null);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  const showSearch = searchable || items.length > searchThreshold;

  const filteredItems = useMemo(() => {
    if (!showSearch || !searchValue.trim()) {
      return items;
    }
    const lowerSearch = searchValue.toLowerCase();
    return items.filter((item) => getItemLabel(item).toLowerCase().includes(lowerSearch));
  }, [items, searchValue, showSearch]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchValue('');
  }, []);

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
            'animate-popover z-50 flex max-h-[300px]',
            'flex-col overscroll-contain rounded-xl',
            'bg-surface-secondary text-text-primary shadow-lg',
            'border border-border-light',
            'outline-none',
            showSearch ? 'p-0' : 'px-1.5 py-1',
            popoverClassName,
          )}
        >
          {showSearch && (
            <div className="sticky top-0 z-10 border-b border-border-light bg-surface-secondary p-1.5">
              <div className="flex items-center gap-2 rounded-lg bg-surface-tertiary px-2 py-1">
                <Search className="h-3.5 w-3.5 text-text-secondary" aria-hidden="true" />
                <input
                  type="text"
                  value={searchValue}
                  onChange={handleSearchChange}
                  placeholder={searchPlaceholder}
                  className="flex-1 border-none bg-transparent text-sm text-text-primary placeholder-text-secondary focus:outline-none"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  aria-label={searchPlaceholder}
                />
                {searchValue && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearSearch();
                    }}
                    className="flex h-4 w-4 items-center justify-center rounded text-text-secondary hover:text-text-primary"
                    aria-label="Clear search"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          )}
          <div className={cn('flex flex-col', showSearch ? 'overflow-auto px-1.5 py-1' : '')}>
            {filteredItems.length === 0 ? (
              <div className="px-2 py-3 text-center text-sm text-text-secondary">
                {noResultsText}
              </div>
            ) : (
              filteredItems.map((item) => {
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
              })
            )}
          </div>
        </SelectPopover>
      </SelectProvider>
    </div>
  );
}
