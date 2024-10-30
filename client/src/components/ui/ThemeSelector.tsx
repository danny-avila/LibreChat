import React, { useContext, useCallback, useEffect } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { ThemeContext } from '~/hooks';

const Theme = ({ theme, onChange }: { theme: string; onChange: (value: string) => void }) => {
  const themeIcons = {
    system: <Monitor />,
    dark: <Moon color="white" />,
    light: <Sun />,
  };

  return (
    <div className="flex items-center justify-between">
      <button
        className="cursor-pointer"
        onClick={() => onChange(theme === 'dark' ? 'light' : 'dark')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            onChange(theme === 'dark' ? 'light' : 'dark');
          }
        }}
        role="switch"
        aria-checked={theme === 'dark'}
        tabIndex={0}
      >
        {themeIcons[theme]}
      </button>
    </div>
  );
};

const ThemeSelector = ({ returnThemeOnly }: { returnThemeOnly?: boolean }) => {
  const { theme, setTheme } = useContext(ThemeContext);

  const changeTheme = useCallback(
    (value: string) => {
      setTheme(value);
    },
    [setTheme],
  );

  useEffect(() => {
    if (theme === 'system') {
      const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDarkScheme ? 'dark' : 'light');
    }
  }, [theme, setTheme]);

  if (returnThemeOnly === true) {
    return <Theme theme={theme} onChange={changeTheme} />;
  }

  return (
    <div className="flex flex-col items-center justify-center bg-white pt-6 dark:bg-gray-900 sm:pt-0">
      <div className="absolute bottom-0 left-0 m-4">
        <Theme theme={theme} onChange={changeTheme} />
      </div>
    </div>
  );
};

export default ThemeSelector;
