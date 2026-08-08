import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { JSX } from 'react/jsx-runtime';

import type { IThemeRGB, ThemeDefinition, ThemeMode } from '../types';

import { fromLegacyTheme, resolveTheme, validateThemeDefinition } from '../registry';
import { applyResolvedTheme, clearAppliedTheme } from '../utils/applyTheme';

const THEME_KEY = 'color-theme';
const THEME_COLORS_KEY = 'theme-colors';
const THEME_NAME_KEY = 'theme-name';
const THEME_DEFINITION_KEY = 'theme-definition';
const themeModes = ['light', 'dark', 'system'] as const;

type AppearanceMode = (typeof themeModes)[number];

type ThemeContextType = {
  theme: AppearanceMode;
  setTheme: (theme: string) => void;
  themeRGB?: IThemeRGB;
  setThemeRGB: (colors?: IThemeRGB) => void;
  themeDefinition?: ThemeDefinition;
  setThemeDefinition: (definition?: ThemeDefinition) => void;
  themeName?: string;
  setThemeName: (name?: string) => void;
  resetTheme: () => void;
};

export const ThemeContext: React.Context<ThemeContextType> = createContext<ThemeContextType>({
  theme: 'system',
  setTheme: () => undefined,
  setThemeRGB: () => undefined,
  setThemeDefinition: () => undefined,
  setThemeName: () => undefined,
  resetTheme: () => undefined,
});

export interface ThemeProviderProps {
  children: React.ReactNode;
  themeRGB?: IThemeRGB;
  themeDefinition?: ThemeDefinition;
  themeName?: string;
  initialTheme?: string;
}

export const isDark = (theme: string): boolean => {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return theme === 'dark';
};

const isAppearanceMode = (value: string): value is AppearanceMode =>
  themeModes.includes(value as AppearanceMode);

const isValidThemeColors = (value: unknown): value is IThemeRGB => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  try {
    return validateThemeDefinition(fromLegacyTheme(value as IThemeRGB)).length === 0;
  } catch {
    return false;
  }
};

const isValidThemeDefinition = (value: unknown): value is ThemeDefinition => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const definition = value as ThemeDefinition;
  if (
    definition.version !== 1 ||
    typeof definition.name !== 'string' ||
    typeof definition.modes !== 'object' ||
    definition.modes === null
  ) {
    return false;
  }

  return validateThemeDefinition(definition).length === 0;
};

const readStorage = (key: string): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (key: string, value?: string): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (value === undefined) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, value);
  } catch {
    // Storage is an optional persistence adapter.
  }
};

const getInitialTheme = (): AppearanceMode => {
  const stored = readStorage(THEME_KEY);
  return stored && isAppearanceMode(stored) ? stored : 'system';
};

const getStoredThemeDefinition = (): ThemeDefinition | undefined => {
  const storedDefinition = readStorage(THEME_DEFINITION_KEY);
  if (storedDefinition) {
    try {
      const parsed: unknown = JSON.parse(storedDefinition);
      if (isValidThemeDefinition(parsed)) {
        return parsed;
      }
    } catch {
      // Fall through to the legacy storage adapter.
    }
  }

  const storedColors = readStorage(THEME_COLORS_KEY);
  if (!storedColors) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(storedColors);
    if (isValidThemeColors(parsed)) {
      return fromLegacyTheme(parsed, readStorage(THEME_NAME_KEY) ?? 'custom');
    }
  } catch {
    // Invalid legacy data is ignored.
  }
  return undefined;
};

const getInitialThemeName = (): string | undefined => readStorage(THEME_NAME_KEY) ?? undefined;

export function ThemeProvider({
  children,
  themeRGB: propThemeRGB,
  themeDefinition: propThemeDefinition,
  themeName: propThemeName,
  initialTheme,
}: ThemeProviderProps): JSX.Element {
  const [theme, setThemeState] = useState<AppearanceMode>(() =>
    initialTheme && isAppearanceMode(initialTheme) ? initialTheme : getInitialTheme(),
  );
  const [themeDefinition, setThemeDefinitionState] = useState<ThemeDefinition | undefined>(() => {
    if (propThemeDefinition) {
      return propThemeDefinition;
    }
    if (propThemeRGB) {
      return fromLegacyTheme(propThemeRGB, propThemeName);
    }
    return getStoredThemeDefinition();
  });
  const [themeName, setThemeNameState] = useState<string | undefined>(
    propThemeName ?? themeDefinition?.name ?? getInitialThemeName,
  );

  const setTheme = useCallback((newTheme: string) => {
    if (!isAppearanceMode(newTheme)) {
      return;
    }
    setThemeState(newTheme);
    writeStorage(THEME_KEY, newTheme);
  }, []);

  const setThemeDefinition = useCallback((definition?: ThemeDefinition) => {
    const errors = definition ? validateThemeDefinition(definition) : [];
    if (errors.length > 0) {
      throw new TypeError(errors.join('\n'));
    }
    setThemeDefinitionState(definition);
    writeStorage(THEME_DEFINITION_KEY, definition ? JSON.stringify(definition) : undefined);
    setThemeNameState(definition?.name);
    writeStorage(THEME_NAME_KEY, definition?.name);
  }, []);

  const setThemeRGB = useCallback(
    (colors?: IThemeRGB) => {
      const definition = colors ? fromLegacyTheme(colors, themeName) : undefined;
      setThemeDefinition(definition);
      writeStorage(THEME_COLORS_KEY, colors ? JSON.stringify(colors) : undefined);
    },
    [setThemeDefinition, themeName],
  );

  const setThemeName = useCallback((name?: string) => {
    setThemeNameState(name);
    writeStorage(THEME_NAME_KEY, name);
  }, []);

  const applyThemeMode = useCallback(
    (currentTheme: AppearanceMode) => {
      const root = window.document.documentElement;
      const mode: ThemeMode = isDark(currentTheme) ? 'dark' : 'light';

      root.classList.toggle('dark', mode === 'dark');
      root.classList.toggle('light', mode === 'light');

      if (!themeDefinition) {
        clearAppliedTheme(root);
        return;
      }

      try {
        applyResolvedTheme(resolveTheme(themeDefinition, mode), root);
      } catch (error) {
        clearAppliedTheme(root);
        console.error('Unable to apply theme definition', error);
      }
    },
    [themeDefinition],
  );

  useEffect(() => {
    applyThemeMode(theme);
  }, [applyThemeMode, theme]);

  useEffect(() => {
    if (theme !== 'system') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => applyThemeMode('system');
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [applyThemeMode, theme]);

  const resetTheme = useCallback(() => {
    setTheme('system');
    setThemeDefinition(undefined);
    setThemeName(undefined);
    writeStorage(THEME_COLORS_KEY);
    clearAppliedTheme();
  }, [setTheme, setThemeDefinition, setThemeName]);

  const themeRGB = themeDefinition?.modes.light?.colors;
  const value = useMemo(
    () => ({
      theme,
      setTheme,
      themeRGB,
      setThemeRGB,
      themeDefinition,
      setThemeDefinition,
      themeName,
      setThemeName,
      resetTheme,
    }),
    [
      resetTheme,
      setTheme,
      setThemeDefinition,
      setThemeName,
      setThemeRGB,
      theme,
      themeDefinition,
      themeName,
      themeRGB,
    ],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextType {
  return useContext(ThemeContext);
}

export default ThemeProvider;
