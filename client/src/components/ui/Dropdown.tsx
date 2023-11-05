import React, { FC, useContext } from 'react';
import { Listbox } from '@headlessui/react';
import { cn } from '~/utils/';
import { ThemeContext } from '~/hooks';

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
  const { theme } = useContext(ThemeContext);

  const themeStyles = {
    light: 'bg-white text-gray-700 hover:bg-gray-200 border-gray-300',
    dark: 'bg-[#202123] text-white hover:bg-[#323236] border-gray-600',
  };

  const currentThemeStyle = themeStyles[theme] || themeStyles.light;

  return (
    <div className={cn('relative', className)}>
      <Listbox value={value} onChange={onChange}>
        <div className="relative">
          <Listbox.Button
            className={cn(
              'bg-grey inline-flex justify-between rounded-md py-2 pl-3 pr-6 text-left',
              currentThemeStyle,
              className,
            )}
          >
            <span className="block truncate font-medium">
              {label}
              {options.find((o) => (typeof o === 'string' ? o === value : o.value === value))
                ?.display || value}
            </span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                className="h-5 w-5 text-gray-400"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                />
              </svg>
            </span>
          </Listbox.Button>
          <Listbox.Options
            className={cn(
              'max-h-90 absolute z-50 mt-1 w-64 overflow-auto rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none',
              currentThemeStyle,
              className,
            )}
          >
            {options.map((item, index) => (
              <Listbox.Option
                key={index}
                value={typeof item === 'string' ? item : item.value}
                className={cn(
                  'relative cursor-pointer select-none py-1 pl-3 pr-6', // Reduced vertical padding with py-1
                  currentThemeStyle,
                )}
              >
                <span className="block truncate">
                  {typeof item === 'string' ? item : item.display}
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
