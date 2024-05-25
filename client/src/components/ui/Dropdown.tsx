import React, { FC, useState } from 'react';
import { Listbox } from '@headlessui/react';
import { cn } from '~/utils/';

type OptionType = {
  value: string;
  display?: string;
};

type DropdownPosition = 'left' | 'right';

interface DropdownProps {
  value: string;
  label?: string;
  onChange: (value: string) => void;
  options: (string | OptionType)[];
  className?: string;
  position?: DropdownPosition;
  width?: number;
  maxHeight?: string;
  testId?: string;
}

const Dropdown: FC<DropdownProps> = ({
  value: initialValue,
  label = '',
  onChange,
  options,
  className = '',
  position = 'right',
  width,
  maxHeight = 'auto',
  testId = 'dropdown-menu',
}) => {
  const [selectedValue, setSelectedValue] = useState(initialValue);

  const positionClasses = {
    right: 'origin-bottom-left left-0',
    left: 'origin-bottom-right right-0',
  };

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
              'relative inline-flex items-center justify-between rounded-md border-gray-300 bg-white py-2 pl-3 pr-8 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600',
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
              `absolute z-50 mt-1 flex max-h-[40vh] flex-col items-start gap-1 overflow-auto rounded-lg border border-gray-300 bg-white p-1.5 text-gray-700 shadow-lg transition-opacity focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white ${positionClasses[position]}`,
              className,
            )}
            style={{ width: width ? `${width}px` : 'auto', maxHeight: maxHeight }}
          >
            {options.map((item, index) => (
              <Listbox.Option
                key={index}
                value={typeof item === 'string' ? item : item.value}
                className={cn(
                  'relative cursor-pointer select-none rounded border-gray-300 bg-white py-2.5 pl-3 pr-6 text-gray-700 hover:bg-gray-100 dark:border-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600',
                )}
                style={{ width: '100%' }}
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
