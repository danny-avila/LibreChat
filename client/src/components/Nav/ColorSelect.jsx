import React, { useState, useContext } from 'react';
import DarkModeIcon from '../svg/DarkModeIcon';
import LightModeIcon from '../svg/LightModeIcon';
import { ThemeContext } from '~/hooks/ThemeContext';
import SelectDropDown from '../ui/SelectDropDown.jsx';
import { COLORS } from '../../../colors.js';
import { cn } from '~/utils/';

export default function DarkMode({ className }) {
  const { theme, setTheme } = useContext(ThemeContext);

  const cardStyle =
    'transition-colors rounded-md min-w-[75px] font-normal bg-white border-black/10 hover:border-black/10 focus:border-black/10 dark:border-black/10 dark:hover:border-black/10 dark:focus:border-black/10 border dark:bg-gray-700 text-black dark:text-white';

  function getValue() {
    if (!theme) return 'Default';
    const defaultColor = COLORS.find(color => color.value === theme.color);
    if (!defaultColor) return 'Default';
    return defaultColor.name;
  }

  return (
    <SelectDropDown
      value={getValue()}
      setValue={value => {
        const defaultColor = COLORS.find(color => color.name === value);
        setTheme({ theme: theme && theme.theme, color: defaultColor && defaultColor.value });
      }}
      availableValues={COLORS.map(color => color.name)}
      showAbove={false}
      showLabel={false}
      title={
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="mr-1.5 h-[1.1rem] w-[1.1rem] text-base dark:text-white"
          viewBox="0 0 24 24"
        >
          <path
            fill="currentColor"
            fill-rule="evenodd"
            d="M12 2.75c-5.107 0-9.25 4.151-9.25 9.276c0 4.762 3.579 8.685 8.183 9.215c.462.053.957-.14 1.353-.537a.93.93 0 0 0 0-1.314c-.312-.312-.625-.73-.796-1.203c-.175-.485-.219-1.094.137-1.66c.323-.513.807-.788 1.315-.922c.49-.128 1.031-.136 1.552-.104a22.896 22.896 0 0 1 1.638.179c.557.072 1.1.139 1.626.164c1.074.051 1.902-.084 2.467-.546c.542-.443 1.025-1.341 1.025-3.272c0-5.125-4.143-9.276-9.25-9.276ZM1.25 12.026C1.25 6.076 6.061 1.25 12 1.25s10.75 4.826 10.75 10.776c0 2.145-.537 3.584-1.575 4.433c-1.014.829-2.326.939-3.489.883a21.917 21.917 0 0 1-1.862-.19c-.52-.067-.99-.128-1.42-.154c-.467-.028-.821-.01-1.08.058c-.24.063-.356.157-.427.27c-.039.062-.066.158.004.351c.074.206.236.442.447.654a2.43 2.43 0 0 1 0 3.432c-.65.652-1.58 1.084-2.587.968c-5.355-.616-9.511-5.175-9.511-10.705ZM9.585 6.25a.75.75 0 1 0 0 1.5a.75.75 0 0 0 0-1.5ZM7.335 7a2.25 2.25 0 1 1 4.5 0a2.25 2.25 0 0 1-4.5 0Zm7.165-.75a.75.75 0 1 0 0 1.5a.75.75 0 0 0 0-1.5ZM12.25 7a2.25 2.25 0 1 1 4.5 0a2.25 2.25 0 0 1-4.5 0ZM6.5 10.75a.75.75 0 1 0 0 1.5a.75.75 0 0 0 0-1.5Zm-2.25.75a2.25 2.25 0 1 1 4.5 0a2.25 2.25 0 0 1-4.5 0Zm13.25-.75a.75.75 0 1 0 0 1.5a.75.75 0 0 0 0-1.5Zm-2.25.75a2.25 2.25 0 1 1 4.5 0a2.25 2.25 0 0 1-4.5 0Z"
            clip-rule="evenodd"
          />
        </svg>
      }
      className={cn(
        cardStyle,
        'min-w-44 z-50 flex h-[40px] w-48 flex-none items-center justify-center px-4 ring-0 hover:cursor-pointer hover:bg-slate-50 focus:ring-0 focus:ring-offset-0 data-[state=open]:bg-slate-50 dark:bg-gray-700 dark:hover:bg-gray-600 dark:data-[state=open]:bg-gray-600',
        className
      )}
    />
  );
}
