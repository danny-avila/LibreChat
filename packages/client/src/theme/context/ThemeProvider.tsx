import React, { createContext, useContext, useEffect, useMemo, useCallback, useState } from 'react';
import { IThemeRGB } from '../types';
import applyTheme from '../utils/applyTheme';

const THEME_KEY = 'color-theme';
const THEME_COLORS_KEY = 'theme-colors';
const THEME_NAME_KEY = 'theme-name';

type ThemeContextType = {
  theme: string; // 'light' | 'dark' | 'system'
  setTheme: (theme: string) => void;
  themeRGB?: IThemeRGB;
  setThemeRGB: (colors?: IThemeRGB) => void;
  themeName?: string;
  setThemeName: (name?: string) => void;
  resetTheme: () => void;
};

// Export ThemeContext so it can be imported from hooks
export const ThemeContext = createContext<ThemeContextType>({
  theme: 'system',
  setTheme: () => undefined,
  setThemeRGB: () => undefined,
  setThemeName: () => undefined,
  resetTheme: () => undefined,
});

export interface ThemeProviderProps {
  children: React.ReactNode;
  themeRGB?: IThemeRGB;
  themeName?: string;
  initialTheme?: string;
}

/**
 * Check if theme is dark
 */
export const isDark = (theme: string): boolean => {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return theme === 'dark';
};

/**
 * Get initial theme from localStorage or default to 'system'
 */
const getInitialTheme = (): string => {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored && ['light', 'dark', 'system'].includes(stored)) {
      return stored;
    }
  } catch {
    // localStorage not available
  }
  return 'system';
};

/**
 * Get initial theme colors from localStorage
 */
const getInitialThemeColors = (): IThemeRGB | undefined => {
  if (typeof window === 'undefined') return undefined;
  try {
    const stored = localStorage.getItem(THEME_COLORS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // localStorage not available or invalid JSON
  }
  return undefined;
};

/**
 * Get initial theme name from localStorage
 */
const getInitialThemeName = (): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  try {
    return localStorage.getItem(THEME_NAME_KEY) || undefined;
  } catch {
    // localStorage not available
  }
  return undefined;
};

/**
 * ThemeProvider component that handles both dark/light mode switching
 * and dynamic color themes via CSS variables with localStorage persistence
 */
export function ThemeProvider({
  children,
  themeRGB: propThemeRGB,
  themeName: propThemeName,
  initialTheme,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<string>(getInitialTheme);
  const [themeRGB, setThemeRGBState] = useState<IThemeRGB | undefined>(getInitialThemeColors);
  const [themeName, setThemeNameState] = useState<string | undefined>(getInitialThemeName);

  // Track if props have been initialized
  const [initialized, setInitialized] = useState(false);

  const setTheme = useCallback((newTheme: string) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(THEME_KEY, newTheme);
    } catch {
      // localStorage not available
    }
  }, []);

  const setThemeRGB = useCallback((colors?: IThemeRGB) => {
    setThemeRGBState(colors);
    try {
      if (colors) {
        localStorage.setItem(THEME_COLORS_KEY, JSON.stringify(colors));
      } else {
        localStorage.removeItem(THEME_COLORS_KEY);
      }
    } catch {
      // localStorage not available
    }
  }, []);

  const setThemeName = useCallback((name?: string) => {
    setThemeNameState(name);
    try {
      if (name) {
        localStorage.setItem(THEME_NAME_KEY, name);
      } else {
        localStorage.removeItem(THEME_NAME_KEY);
      }
    } catch {
      // localStorage not available
    }
  }, []);

  // Initialize from props only once on mount
  useEffect(() => {
    if (!initialized) {
      setInitialized(true);

      // Set initial theme if provided
      if (initialTheme) {
        setTheme(initialTheme);
      }

      // Set initial theme colors if provided
      if (propThemeRGB) {
        setThemeRGB(propThemeRGB);
      }

      // Set initial theme name if provided
      if (propThemeName) {
        setThemeName(propThemeName);
      }
    }
  }, [initialized, initialTheme, propThemeRGB, propThemeName, setTheme, setThemeRGB, setThemeName]);

  // Apply class-based dark mode
  const applyThemeMode = useCallback((currentTheme: string) => {
    const root = window.document.documentElement;
    const darkMode = isDark(currentTheme);

    root.classList.remove(darkMode ? 'light' : 'dark');
    root.classList.add(darkMode ? 'dark' : 'light');
  }, []);

  // Apply theme mode whenever Browser / System theme changes 
  useEffect(() => {
    applyThemeMode(theme);
  }, [theme, applyThemeMode]);

  // Listen for Browser / System theme changes when theme is 'system'
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      applyThemeMode('system');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, applyThemeMode]);

  // Apply dynamic color theme
  useEffect(() => {
    if (themeRGB) {
      applyTheme(themeRGB);
    }
  }, [themeRGB]);

  // Reset theme function
  const resetTheme = useCallback(() => {
    setTheme('system');
    setThemeRGB(undefined);
    setThemeName(undefined);
    // Remove any custom CSS variables
    const root = document.documentElement;
    const customProps = Array.from(root.style).filter((prop) => prop.startsWith('--'));
    customProps.forEach((prop) => root.style.removeProperty(prop));
  }, [setTheme, setThemeRGB, setThemeName]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      themeRGB,
      setThemeRGB,
      themeName,
      setThemeName,
      resetTheme,
    }),
    [theme, setTheme, themeRGB, setThemeRGB, themeName, setThemeName, resetTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Hook to access the current theme context
 */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export default ThemeProvider;
