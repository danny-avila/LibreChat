import { useContext, useCallback, useEffect, useState } from 'react';
import { JSX } from 'react/jsx-runtime';
import { Sun, Moon, Monitor, Contrast } from 'lucide';
import type { IconNode } from './MorphIcon';
import { ThemeContext, isDark, isHighContrast } from '../theme';
import { MorphIcon } from './MorphIcon';
import { useLocalize } from '../hooks';
import { Button } from './Button';

declare global {
  interface Window {
    lastThemeChange?: number;
  }
}

type ThemeType = 'system' | 'dark' | 'light' | 'high-contrast-light' | 'high-contrast-dark';

const themeIcons: Record<ThemeType, IconNode> = {
  system: Monitor,
  dark: Moon,
  light: Sun,
  'high-contrast-light': Contrast,
  'high-contrast-dark': Contrast,
};

const Theme = ({ theme, onChange }: { theme: string; onChange: (value: string) => void }) => {
  const localize = useLocalize();

  const nextScheme = isDark(theme) ? 'light' : 'dark';
  /** The toggle flips the colour scheme without discarding a contrast choice. */
  const nextTheme = isHighContrast(theme) ? `high-contrast-${nextScheme}` : nextScheme;

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
      <MorphIcon icon={themeIcons[theme as ThemeType]} size={24} />
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
      if (isHighContrast(value)) {
        setAnnouncement(
          isDark(value)
            ? localize('com_ui_high_contrast_dark_theme_enabled')
            : localize('com_ui_high_contrast_light_theme_enabled'),
        );
        return;
      }
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
