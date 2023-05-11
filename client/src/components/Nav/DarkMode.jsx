import React, { useState, useContext } from 'react';
import DarkModeIcon from '../svg/DarkModeIcon';
import LightModeIcon from '../svg/LightModeIcon';
import { ThemeContext } from '~/hooks/ThemeContext';

export default function DarkMode() {
  const { theme, setTheme } = useContext(ThemeContext);

  const clickHandler = () => {
		setTheme(theme && theme.theme === 'dark' ? { theme: 'light', color: theme && theme.color } : { theme: 'dark', color: theme && theme.color })
	};
  const mode = theme && theme.theme === 'dark' ? 'Light mode' : 'Dark mode';

  return (
    <button
      className="flex cursor-pointer items-center gap-3 rounded-md py-3 px-3 text-sm text-white transition-colors duration-200 hover:bg-gray-500/10"
      onClick={clickHandler}
    >
      {theme && theme.theme === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
      {mode}
    </button>
  );
}
