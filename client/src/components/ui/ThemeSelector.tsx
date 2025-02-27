import React, { useContext, useCallback, useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { ThemeContext } from '~/hooks';

declare global {
  interface Window {
    lastThemeChange?: number;
  }
}

const Theme = ({ theme, onChange }: { theme: string; onChange: (value: string) => void }) => {
  const themeIcons = {
    system: <Monitor />,
    dark: <Moon color="white" />,
    light: <Sun />,
  };

  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const label = `Switch to ${nextTheme} theme`;

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        onChange(nextTheme);
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [nextTheme, onChange]);

  return (
    <button
      className="flex items-center gap-2 rounded-lg p-2 transition-colors hover:bg-surface-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2"
      aria-label={label}
      aria-keyshortcuts="Ctrl+Shift+T"
      onClick={(e) => {
        e.preventDefault();
        onChange(nextTheme);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onChange(nextTheme);
        }
      }}
    >
      {themeIcons[theme]}
    </button>
  );
};

const ThemeSelector = ({ returnThemeOnly }: { returnThemeOnly?: boolean }) => {
  const { theme, setTheme } = useContext(ThemeContext);
  const [announcement, setAnnouncement] = useState('');

  const changeTheme = useCallback(
    (value: string) => {
      const now = Date.now();
      if (typeof window.lastThemeChange === 'number' && now - window.lastThemeChange < 500) {
        return;
      }
      window.lastThemeChange = now;

      setTheme(value);
      setAnnouncement(value === 'dark' ? 'Dark theme enabled' : 'Light theme enabled');
    },
    [setTheme],
  );

  useEffect(() => {
    if (theme === 'system') {
      const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDarkScheme ? 'dark' : 'light');
    }
  }, [theme, setTheme]);

  useEffect(() => {
    if (announcement) {
      const timeout = setTimeout(() => setAnnouncement(''), 1000);
      return () => clearTimeout(timeout);
    }
  }, [announcement]);

  if (returnThemeOnly === true) {
    return <Theme theme={theme} onChange={changeTheme} />;
  }

  return (
    <div className="flex flex-col items-center justify-center bg-white pt-6 dark:bg-gray-900 sm:pt-0">
      <div className="absolute bottom-0 left-0 m-4">
        <Theme theme={theme} onChange={changeTheme} />
      </div>
      {announcement && (
        <div aria-live="polite" className="sr-only">
          {announcement}
        </div>
      )}
    </div>
  );
};

export default ThemeSelector;
