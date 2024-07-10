import React, { FC, useContext, useState } from 'react';
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Transition,
} from '@headlessui/react';
import { AnchorPropsWithSelection } from '@headlessui/react/dist/internal/floating';
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
  anchor?: AnchorPropsWithSelection;
  sizeClasses?: string;
  testId?: string;
}

const Dropdown: FC<DropdownProps> = ({
  value,
  label = '',
  onChange,
  options,
  className = '',
  anchor,
  sizeClasses,
  testId = 'dropdown-menu',
}) => {
  return (
    <div className={cn('relative', className)}>
      <Listbox
        value={value}
        onChange={(newValue) => {
          onChange(newValue);
        }}
      >
        <div className={cn('relative', className)}>
          <ListboxButton
            data-testid={testId}
            className={cn(
              'relative inline-flex items-center justify-between rounded-md border-gray-50 bg-white py-2 pl-3 pr-8 text-black transition-all duration-100 ease-in-out hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 dark:focus:ring-white dark:focus:ring-offset-gray-700',
              'w-auto',
              className,
            )}
            aria-label="Select an option"
          >
            <span className="block truncate">
              {label}
              {options
                .map((o) => (typeof o === 'string' ? { value: o, display: o } : o))
                .find((o) => o.value === value)?.display || value}
            </span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
                className="h-4 w-5 rotate-0 transform text-black transition-transform duration-300 ease-in-out dark:text-gray-50"
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </span>
          </ListboxButton>
          <Transition
            leave="transition ease-in duration-50"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <ListboxOptions
              className={cn(
                'absolute z-50 mt-1 flex flex-col items-start gap-1 overflow-auto rounded-lg border border-gray-300 bg-white bg-white p-1.5 text-gray-700 shadow-lg transition-opacity focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white',
                sizeClasses,
                className,
              )}
              anchor={anchor}
              aria-label="List of options"
            >
              {options.map((item, index) => (
                <ListboxOption
                  key={index}
                  value={typeof item === 'string' ? item : item.value}
                  className={cn(
                    'relative cursor-pointer select-none rounded border-gray-300 bg-white py-2.5 pl-3 pr-3 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600',
                  )}
                  style={{ width: '100%' }}
                  data-theme={typeof item === 'string' ? item : (item as OptionType).value}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="block truncate">
                      {typeof item === 'string' ? item : (item as OptionType).display}
                    </span>
                  </div>
                </ListboxOption>
              ))}
            </ListboxOptions>
          </Transition>
        </div>
      </Listbox>
    </div>
  );
};

export default Dropdown;
