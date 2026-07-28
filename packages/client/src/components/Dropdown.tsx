import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { matchSorter } from 'match-sorter';
import * as Select from '@ariakit/react/select';
import * as Combobox from '@ariakit/react/combobox';
import type { Option } from '~/common';
import { cn } from '~/utils/';
import './Dropdown.css';

interface DropdownProps {
  value?: string;
  label?: string;
  onChange: (value: string) => void;
  options: (string | Option | { divider: true })[];
  className?: string;
  sizeClasses?: string;
  testId?: string;
  icon?: React.ReactNode;
  iconOnly?: boolean;
  renderValue?: (option: Option) => React.ReactNode;
  ariaLabel?: string;
  'aria-labelledby'?: string;
  portal?: boolean;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchEmptyText?: string;
}

const isDivider = (item: string | Option | { divider: true }): item is { divider: true } =>
  typeof item === 'object' && 'divider' in item;

const isOption = (item: string | Option | { divider: true }): item is Option =>
  typeof item === 'object' && 'value' in item && 'label' in item;

const normalizeOption = (item: string | Option): Option =>
  typeof item === 'string' ? { value: item, label: item } : item;

const Dropdown: React.FC<DropdownProps> = ({
  value: selectedValue,
  label = '',
  onChange,
  options,
  className = '',
  sizeClasses,
  testId = 'dropdown-menu',
  icon,
  iconOnly = false,
  renderValue,
  ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  portal = true,
  disabled = false,
  searchable = false,
  searchPlaceholder,
  searchEmptyText,
}) => {
  const [searchValue, setSearchValue] = useState('');

  const handleChange = (value: string) => {
    onChange(value);
  };

  const comboboxStore = Combobox.useComboboxStore({
    resetValueOnHide: true,
    value: searchValue,
    setValue: setSearchValue,
  });

  const selectProps = Select.useSelectStore({
    combobox: searchable ? comboboxStore : undefined,
    value: selectedValue,
    setValue: handleChange,
  });

  const getOptionObject = (val: string | undefined): Option | undefined => {
    if (val == null || val === '') {
      return undefined;
    }
    return options
      .filter((o) => !isDivider(o))
      .map((o) => normalizeOption(o as string | Option))
      .find((o) => o.value === val);
  };

  const getOptionLabel = (currentValue: string | undefined) => {
    if (currentValue == null || currentValue === '') {
      return '';
    }
    const option = getOptionObject(currentValue);
    return option ? option.label : currentValue;
  };

  const matches = useMemo(() => {
    if (!searchable) {
      return [];
    }
    const optionItems = options
      .filter((o) => !isDivider(o))
      .map((o) => normalizeOption(o as string | Option));
    return matchSorter(optionItems, searchValue, {
      keys: ['label', 'value'],
      baseSort: (a, b) => (a.index < b.index ? -1 : 1),
    });
  }, [searchable, options, searchValue]);

  const renderOptionContent = (option: Option) => (
    <div className="flex w-full items-center gap-2">
      {option.icon != null && <span>{option.icon as React.ReactNode}</span>}
      <span className="block truncate">{option.label}</span>
      {selectedValue === option.value && (
        <span className="ml-auto pl-2">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="icon-md block group-hover:hidden"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM16.0755 7.93219C16.5272 8.25003 16.6356 8.87383 16.3178 9.32549L11.5678 16.0755C11.3931 16.3237 11.1152 16.4792 10.8123 16.4981C10.5093 16.517 10.2142 16.3973 10.0101 16.1727L7.51006 13.4227C7.13855 13.014 7.16867 12.3816 7.57733 12.0101C7.98598 11.6386 8.61843 11.6687 8.98994 12.0773L10.6504 13.9039L14.6822 8.17451C15 7.72284 15.6238 7.61436 16.0755 7.93219Z"
              fill="currentColor"
            />
          </svg>
        </span>
      )}
    </div>
  );

  return (
    <div className={cn('relative', className)}>
      <Select.Select
        store={selectProps}
        disabled={disabled}
        className={cn(
          'focus:ring-offset-ring-offset relative inline-flex items-center justify-between rounded-xl border border-input bg-background px-3 py-2 text-sm text-text-primary transition-all duration-200 ease-in-out hover:bg-accent hover:text-accent-foreground focus:ring-ring-primary',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-background disabled:hover:text-text-primary',
          iconOnly ? 'size-10' : 'w-fit gap-2',
          className,
        )}
        data-testid={testId}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
      >
        <div className="flex w-full items-center gap-2">
          {icon}
          {!iconOnly && (
            <span className="block truncate">
              {label}
              {(() => {
                const matchedOption = getOptionObject(selectedValue);
                if (matchedOption && renderValue) {
                  return renderValue(matchedOption);
                }
                return getOptionLabel(selectedValue);
              })()}
            </span>
          )}
        </div>
        {!iconOnly && <Select.SelectArrow />}
      </Select.Select>
      <Select.SelectPopover
        portal={portal}
        store={selectProps}
        className={cn(
          'popover-ui z-40 text-sm',
          sizeClasses,
          className,
          'max-h-[80vh] overflow-y-auto',
          '[pointer-events:auto]', // Override body's pointer-events:none when in modal
        )}
      >
        {searchable ? (
          <>
            <div className="sticky -top-2 z-10 -mx-2 -mt-2 mb-1 bg-surface-primary px-2 pb-1.5 pt-2 dark:bg-surface-secondary">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary"
                  aria-hidden="true"
                />
                <Combobox.Combobox
                  store={comboboxStore}
                  autoSelect
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  className="w-full rounded-lg bg-transparent py-1.5 pl-8 pr-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-border-xheavy"
                />
              </div>
            </div>
            <Combobox.ComboboxList
              store={comboboxStore}
              aria-label={ariaLabel}
              aria-labelledby={ariaLabelledBy}
              className="flex flex-col"
            >
              {matches.map((option) => (
                <Combobox.ComboboxItem
                  key={`option-${String(option.value)}`}
                  value={String(option.value)}
                  className="select-item"
                  render={
                    <Select.SelectItem value={String(option.value)} data-theme={option.value} />
                  }
                >
                  {renderOptionContent(option)}
                </Combobox.ComboboxItem>
              ))}
            </Combobox.ComboboxList>
            {matches.length === 0 && (
              <div className="px-2 py-6 text-center text-sm text-text-secondary" aria-hidden="true">
                {searchEmptyText}
              </div>
            )}
            <div role="status" aria-live="polite" className="sr-only">
              {matches.length === 0 ? searchEmptyText : ''}
            </div>
          </>
        ) : (
          options.map((item, index) => {
            if (isDivider(item)) {
              return <div key={`divider-${index}`} className="my-1 border-t border-border-heavy" />;
            }

            const option = normalizeOption(item);
            if (!isOption(option)) {
              return null;
            }

            return (
              <Select.SelectItem
                key={`option-${index}`}
                value={String(option.value)}
                className="select-item"
                data-theme={option.value}
              >
                {renderOptionContent(option)}
              </Select.SelectItem>
            );
          })
        )}
      </Select.SelectPopover>
    </div>
  );
};

export default Dropdown;
