import React, { FC, useContext, useState } from 'react';
import { Listbox } from '@headlessui/react';
import { cn } from '~/utils/';

type OptionType = {
  value: string;
  display?: string;
};

interface DropdownProps {
  value: string;
  label?: string;
  onChange: (value: string) => void;
  options: (string | OptionType)[];
  className?: string;
  width?: number;
  testId?: string;
}

const Dropdown: FC<DropdownProps> = ({
  value: initialValue,
  label = '',
  onChange,
  options,
  className = '',
  width,
  testId = 'dropdown-menu',
}) => {
  const [selectedValue, setSelectedValue] = useState(initialValue);

  return (
    <div className={cn('relative', className)}>
      <Listbox
        value={selectedValue}
        onChange={(newValue) => {
          setSelectedValue(newValue);
          onChange(newValue);
        }}
      >
        <div className={cn('relative', className)}>
          <Listbox.Button
            data-testid={testId}
            className={cn(
              'relative inline-flex items-center justify-between rounded-md border-gray-300 bg-white py-2 pl-3 pr-8 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 ',
              'w-auto',
              className,
            )}
          >
            <span className="block truncate">
              {label}
              {options
                .map((o) => (typeof o === 'string' ? { value: o, display: o } : o))
                .find((o) => o.value === selectedValue)?.display || selectedValue}
            </span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
                className="h-4 w-5 rotate-0 transform text-gray-400 transition-transform duration-300 ease-in-out"
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </span>
          </Listbox.Button>
          <Listbox.Options
            className={cn(
              'absolute z-50 mt-1 max-h-[40vh] overflow-auto rounded-md border-gray-300 bg-white text-gray-700 shadow-lg transition-opacity hover:bg-gray-50 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600',
              className,
            )}
            style={{ width: width ? `${width}px` : 'auto' }}
          >
            {options.map((item, index) => (
              <Listbox.Option
                key={index}
                value={typeof item === 'string' ? item : item.value}
                className={cn(
                  'relative cursor-pointer select-none border-gray-300 bg-white py-1 pl-3 pr-6 text-gray-700 hover:bg-gray-50 dark:border-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600',
                )}
                style={{ width: width ? `${width}px` : 'auto' }}
                data-theme={typeof item === 'string' ? item : (item as OptionType).value}
              >
                <span className="block truncate">
                  {typeof item === 'string' ? item : (item as OptionType).display}
                </span>
              </Listbox.Option>
            ))}
          </Listbox.Options>
        </div>
      </Listbox>
    </div>
  );
};

export default Dropdown;
