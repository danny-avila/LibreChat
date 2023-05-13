import React, { useState, useContext } from 'react';
import DarkModeIcon from '../svg/DarkModeIcon';
import LightModeIcon from '../svg/LightModeIcon';
import { ThemeContext } from '~/hooks/ThemeContext';

export default function DarkMode({ onClick }) {
  const { theme, setTheme } = useContext(ThemeContext);

  const clickHandler = e => {
    if (onClick) onClick(e);
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };
  const mode = theme === 'dark' ? 'Light mode' : 'Dark mode';

  return (
    <button
      className="flex w-full cursor-pointer items-center gap-3 px-3 py-3 text-sm text-white transition-colors duration-200 hover:bg-gray-700"
      onClick={clickHandler}
    >
      {theme === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
      {mode}
    </button>
  );
}
