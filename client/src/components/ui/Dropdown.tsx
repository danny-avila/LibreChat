import React, { useState } from 'react';
import * as Select from '@ariakit/react/select';
import { cn } from '~/utils/';
import type { Option } from '~/common';

interface DropdownProps {
  value: string;
  label?: string;
  onChange: (value: string) => void;
  options: string[] | Option[];
  className?: string;
  sizeClasses?: string;
  testId?: string;
}

const Dropdown: React.FC<DropdownProps> = ({
  value: initialValue,
  label = '',
  onChange,
  options,
  className = '',
  sizeClasses,
  testId = 'dropdown-menu',
}) => {
  const [selectedValue, setSelectedValue] = useState(initialValue);

  const handleChange = (value: string) => {
    setSelectedValue(value);
    onChange(value);
  };

  const selectProps = Select.useSelectStore({
    value: selectedValue,
    setValue: handleChange,
  });

  return (
    <div className={cn('relative', className)}>
      <Select.Select
        store={selectProps}
        className={cn(
          'btn-neutral focus:ring-offset-ring-offset relative inline-flex w-auto items-center justify-between rounded-md border-border-light bg-header-primary py-2 pl-3 pr-8 text-text-primary transition-all duration-100 ease-in-out hover:bg-header-hover focus:ring-ring-primary',
          className,
        )}
        data-testid={testId}
      >
        <span className="block truncate">
          {label}
          {options
            .map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
            .find((o) => o.value === selectedValue)?.label ?? selectedValue}
        </span>
        <Select.SelectArrow />
      </Select.Select>
      <Select.SelectPopover
        store={selectProps}
        className={cn(
          'absolute z-50 mt-1 flex flex-col items-start gap-1 overflow-auto rounded-lg border border-border-medium bg-header-primary p-1.5 shadow-lg transition-opacity',
          sizeClasses,
          className,
        )}
      >
        {options.map((item, index) => (
          <Select.SelectItem
            key={index}
            value={typeof item === 'string' ? item : item.value}
            className="focus-visible:ring-offset ring-offset-ring-offset relative w-full cursor-pointer select-none rounded border-border-light bg-header-primary py-2.5 pl-3 pr-3 text-sm text-text-secondary ring-ring-primary hover:bg-header-hover focus-visible:ring data-[focus]:bg-surface-hover data-[focus]:text-text-primary"
            data-theme={typeof item === 'string' ? item : (item as Option).value}
          >
            <div className="flex w-full items-center justify-between">
              <span className="block truncate">
                {typeof item === 'string' ? item : (item as Option).label}
              </span>
              {selectedValue === (typeof item === 'string' ? item : item.value) && (
                <span className="ml-auto pl-2">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="icon-md block group-hover:hidden"
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
          </Select.SelectItem>
        ))}
      </Select.SelectPopover>
    </div>
  );
};

export default Dropdown;
