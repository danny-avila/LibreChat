import React, { FC, useContext, useState } from 'react';
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
  const { theme } = useContext(ThemeContext);
  const [selectedValue, setSelectedValue] = useState(initialValue);

  const themeStyles = {
    light: 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300',
    dark: 'bg-gray-800 text-white hover:bg-gray-700 border-gray-600',
  };

  const isSystemDark =
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const currentThemeStyle =
    theme === 'system'
      ? isSystemDark
        ? themeStyles.dark
        : themeStyles.light
      : themeStyles[theme] || themeStyles.light;

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
              'relative inline-flex items-center justify-between rounded-md py-2 pl-3 pr-10',
              currentThemeStyle,
              'w-auto',
              className,
            )}
          >
            <span className="block truncate font-medium">
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
                strokeWidth="1.5"
                stroke="currentColor"
                className="h-5 w-5 rotate-0 transform text-gray-400 transition-transform duration-300 ease-in-out"
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
              'absolute z-50 mt-1 max-h-[40vh] overflow-auto rounded-md shadow-lg transition-opacity focus:outline-none',
              currentThemeStyle,
              className,
            )}
            style={{ width: width ? `${width}px` : 'auto' }}
          >
            {options.map((item, index) => (
              <Listbox.Option
                key={index}
                value={typeof item === 'string' ? item : item.value}
                className={cn(
                  'relative cursor-pointer select-none py-1 pl-3 pr-6',
                  currentThemeStyle,
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
