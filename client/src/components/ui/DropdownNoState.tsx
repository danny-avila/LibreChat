import React, { FC } from 'react';
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Transition,
} from '@headlessui/react';
import { AnchorPropsWithSelection } from '@headlessui/react/dist/internal/floating';
import type { Option } from '~/common';
import { cn } from '~/utils/';

interface DropdownProps {
  value?: string | Option;
  label?: string;
  onChange: (value: string | Option) => void;
  options: (string | Option)[];
  className?: string;
  anchor?: AnchorPropsWithSelection;
  sizeClasses?: string;
  testId?: string;
}

/*
 * Mainly used for the Speech Voice Selection Dropdown
 */

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
  const getValue = (option?: string | Option) =>
    typeof option === 'string' ? option : option?.value;

  const getDisplay = (option?: string | Option) =>
    typeof option === 'string' ? option : option?.label ?? option?.value;

  const isEqual = (a: string | Option, b: string | Option): boolean => getValue(a) === getValue(b);

  const selectedOption = options.find((option) => isEqual(option, value ?? '')) ?? value;

  const handleChange = (newValue: string | Option) => {
    onChange(newValue);
  };

  return (
    <div className={cn('relative', className)}>
      <Listbox value={selectedOption} onChange={handleChange}>
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
              {getDisplay(selectedOption)}
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
                'absolute z-50 mt-1 flex flex-col items-start gap-1 overflow-auto rounded-lg border border-gray-300 bg-white p-1.5 text-gray-700 shadow-lg transition-opacity focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white',
                sizeClasses,
                className,
              )}
              anchor={anchor}
              aria-label="List of options"
            >
              {options.map((item, index) => (
                <ListboxOption
                  key={index}
                  value={item}
                  className={cn(
                    'relative cursor-pointer select-none rounded border-gray-300 bg-white py-2.5 pl-3 pr-3 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600',
                  )}
                  style={{ width: '100%' }}
                  data-theme={getValue(item)}
                >
                  {({ selected }) => (
                    <div className="flex w-full items-center justify-between">
                      <span className="block truncate">{getDisplay(item)}</span>
                      {selected && (
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
                  )}
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
