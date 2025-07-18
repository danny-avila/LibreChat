import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { IThemeRGB } from '../types';
import applyTheme from '../utils/applyTheme';

type ThemeContextType = {
  theme: string; // 'light' | 'dark' | 'system'
  setTheme: React.Dispatch<React.SetStateAction<string>>;
  themeRGB?: IThemeRGB;
  themeName?: string;
};

// Export ThemeContext so it can be imported from hooks
export const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  setTheme: () => undefined,
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
 * Get initial theme from localStorage or system preference
 */
const getInitialTheme = (): string => {
  if (typeof window !== 'undefined') {
    const storedTheme = localStorage.getItem('color-theme');
    if (storedTheme) {
      return storedTheme;
    }
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  }
  return 'light';
};

/**
 * ThemeProvider component that handles both dark/light mode switching
 * and dynamic color themes via CSS variables
 */
export function ThemeProvider({ children, themeRGB, themeName, initialTheme }: ThemeProviderProps) {
  const [theme, setTheme] = useState(initialTheme || getInitialTheme);

  // Apply class-based dark mode
  const rawSetTheme = (rawTheme: string) => {
    const root = window.document.documentElement;
    const darkMode = isDark(rawTheme);

    root.classList.remove(darkMode ? 'light' : 'dark');
    root.classList.add(darkMode ? 'dark' : 'light');

    localStorage.setItem('color-theme', rawTheme);
  };

  // Handle system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const changeThemeOnSystemChange = () => {
      if (theme === 'system') {
        rawSetTheme(mediaQuery.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener('change', changeThemeOnSystemChange);
    return () => {
      mediaQuery.removeEventListener('change', changeThemeOnSystemChange);
    };
  }, [theme]);

  // Apply dark/light mode class
  useEffect(() => {
    rawSetTheme(theme);
  }, [theme]);

  // Apply dynamic color theme only if explicitly provided
  useEffect(() => {
    // Only apply custom theme if explicitly provided
    // This preserves the existing CSS variable cascading for default themes
    if (themeRGB) {
      applyTheme(themeRGB);
    }
  }, [themeRGB]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      themeRGB,
      themeName,
    }),
    [theme, themeRGB, themeName],
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
