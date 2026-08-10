import { useContext, useCallback, useEffect, useState } from 'react';
import { JSX } from 'react/jsx-runtime';
import { Sun, Moon, Monitor } from 'lucide-react';
import { ThemeContext, isDark } from '../theme';
import { useLocalize } from '../hooks';
import { Button } from './Button';

declare global {
  interface Window {
    lastThemeChange?: number;
  }
}

type ThemeType = 'system' | 'dark' | 'light';

const Theme = ({ theme, onChange }: { theme: string; onChange: (value: string) => void }) => {
  const localize = useLocalize();

  const themeIcons: Record<ThemeType, JSX.Element> = {
    system: <Monitor aria-hidden="true" />,
    dark: <Moon aria-hidden="true" />,
    light: <Sun aria-hidden="true" />,
  };

  const nextTheme = isDark(theme) ? 'light' : 'dark';

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
    <Button
      variant="ghost"
      size="icon"
      className="h-auto w-auto p-2 text-text-primary"
      aria-label={localize('com_ui_toggle_theme')}
      aria-keyshortcuts="Ctrl+Shift+T"
      onClick={(e) => {
        e.preventDefault();
        onChange(nextTheme);
      }}
    >
      {themeIcons[theme as ThemeType]}
    </Button>
  );
};

const ThemeSelector = ({ returnThemeOnly }: { returnThemeOnly?: boolean }): JSX.Element => {
  const { theme, setTheme } = useContext(ThemeContext);
  const [announcement, setAnnouncement] = useState('');
  const localize = useLocalize();

  const changeTheme = useCallback(
    (value: string) => {
      const now = Date.now();
      if (typeof window.lastThemeChange === 'number' && now - window.lastThemeChange < 500) {
        return;
      }
      window.lastThemeChange = now;

      setTheme(value);
      setAnnouncement(
        isDark(value)
          ? localize('com_ui_dark_theme_enabled')
          : localize('com_ui_light_theme_enabled'),
      );
    },
    [setTheme, localize],
  );

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
    <div className="flex flex-col items-center justify-center bg-surface-primary pt-6 sm:pt-0">
      <div className="absolute bottom-0 left-0 m-4">
        <Theme theme={theme} onChange={changeTheme} />
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
    </div>
  );
};

export default ThemeSelector;
