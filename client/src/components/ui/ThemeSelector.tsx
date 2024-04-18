import React, { useContext, useCallback } from 'react';
import { Sun, Moon } from 'lucide-react';
import { ThemeContext } from '~/hooks';

const Theme = ({ theme, onChange }: { theme: string; onChange: (value: string) => void }) => {
  const themeIcons = {
    system: <Sun />,
    dark: <Moon color="white" />,
    light: <Sun />,
  };

  return (
    <div className="flex items-center justify-between">
      <div className="cursor-pointer" onClick={() => onChange(theme === 'dark' ? 'light' : 'dark')}>
        {themeIcons[theme]}
      </div>
    </div>
  );
};

const ThemeSelector = () => {
  const { theme, setTheme } = useContext(ThemeContext);
  const changeTheme = useCallback(
    (value: string) => {
      setTheme(value);
    },
    [setTheme],
  );

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white pt-6 dark:bg-gray-900 sm:pt-0">
      <div className="absolute bottom-0 left-0 m-4">
        <Theme theme={theme} onChange={changeTheme} />
      </div>
    </div>
  );
};

export default ThemeSelector;
