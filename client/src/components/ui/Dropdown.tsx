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
  width?: number;
}

const Dropdown: FC<DropdownProps> = ({
  value,
  label = '',
  onChange,
  options,
  className = '',
  width,
}) => {
  const { theme } = useContext(ThemeContext);

  const themeStyles = {
    light: 'bg-white text-gray-700 hover:bg-gray-200 border-gray-300', // Light theme styles
    dark: 'bg-[#202123] text-white hover:bg-[#323236] border-gray-600',
  };

  const currentThemeStyle = themeStyles[theme] || themeStyles.light;

  return (
    <div className={cn('relative', className)}>
      <Listbox value={value} onChange={onChange}>
        {({ open }) => (
          <div className={cn('relative', className)}>
            <Listbox.Button
              className={cn(
                'inline-flex items-center justify-between rounded-md py-2 pl-3 pr-10',
                currentThemeStyle,
                'w-auto',
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
                'max-h-90 absolute z-50 mt-1 overflow-auto rounded-md shadow-lg transition-opacity focus:outline-none',
                currentThemeStyle,
                className,
              )}
              style={{
                borderWidth: '0.5px',
                borderColor: theme === 'dark' ? '#343541' : '#F7F7F8',
                opacity: open ? 1 : 0,
                width: width ? `${width}px` : 'auto',
              }}
            >
              {options.map((item, index) => (
                <Listbox.Option
                  key={index}
                  value={typeof item === 'string' ? item : item.value}
                  className={cn(
                    'relative cursor-pointer select-none py-1 pl-3 pr-6',
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
        )}
      </Listbox>
    </div>
  );
};

export default Dropdown;
