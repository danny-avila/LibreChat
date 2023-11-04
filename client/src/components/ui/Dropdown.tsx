import React, { FC } from 'react';
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
}

const Dropdown: FC<DropdownProps> = ({ value, label = '', onChange, options, className = '' }) => {
  return (
    <div className={cn('relative', className)}>
      <Listbox value={value} onChange={onChange}>
        <Listbox.Button
          className={cn(
            'relative w-full cursor-default rounded-md bg-white py-2 pl-3 pr-10 text-left focus:outline-none',
            className,
          )}
        >
          <span className="block truncate font-medium text-gray-700">
            {label}
            {options.find((o) => (typeof o === 'string' ? o === value : o.value === value))
              ?.display || value}
          </span>
        </Listbox.Button>
        <Listbox.Options
          className={cn(
            'absolute z-50 mt-1 w-full rounded-md bg-white py-1 shadow-lg focus:outline-none',
            className,
          )}
        >
          {options.map((item, index) => (
            <Listbox.Option
              key={index}
              value={typeof item === 'string' ? item : item.value}
              className={cn(
                'relative cursor-pointer select-none py-2 pl-10 pr-4',
                'text-gray-900 hover:bg-gray-200',
              )}
            >
              <span className="block truncate">
                {typeof item === 'string' ? item : item.display}
              </span>
            </Listbox.Option>
          ))}
        </Listbox.Options>
      </Listbox>
    </div>
  );
};

export default Dropdown;
