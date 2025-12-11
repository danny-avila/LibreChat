import React, { createContext, useContext, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAtom } from 'jotai';
import { IThemeRGB } from '../types';
import applyTheme from '../utils/applyTheme';
import { themeModeAtom, themeColorsAtom, themeNameAtom } from '../atoms/themeAtoms';

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
 * ThemeProvider component that handles both dark/light mode switching
 * and dynamic color themes via CSS variables with localStorage persistence
 */
export function ThemeProvider({
  children,
  themeRGB: propThemeRGB,
  themeName: propThemeName,
  initialTheme,
}: ThemeProviderProps) {
  // Use jotai atoms for persistent state
  const [theme, setTheme] = useAtom(themeModeAtom);
  const [storedThemeRGB, setStoredThemeRGB] = useAtom(themeColorsAtom);
  const [storedThemeName, setStoredThemeName] = useAtom(themeNameAtom);

  // Track if props have been initialized
  const propsInitialized = useRef(false);

  // Initialize from props only once on mount
  useEffect(() => {
    if (!propsInitialized.current) {
      propsInitialized.current = true;

      // Set initial theme if provided
      if (initialTheme) {
        setTheme(initialTheme);
      }

      // Set initial theme colors if provided
      if (propThemeRGB) {
        setStoredThemeRGB(propThemeRGB);
      }

      // Set initial theme name if provided
      if (propThemeName) {
        setStoredThemeName(propThemeName);
      }
    }
  }, [initialTheme, propThemeRGB, propThemeName, setTheme, setStoredThemeRGB, setStoredThemeName]);

  // Apply class-based dark mode
  const applyThemeMode = useCallback((rawTheme: string) => {
    const root = window.document.documentElement;
    const darkMode = isDark(rawTheme);

    root.classList.remove(darkMode ? 'light' : 'dark');
    root.classList.add(darkMode ? 'dark' : 'light');
  }, []);

  // Handle system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const changeThemeOnSystemChange = () => {
      if (theme === 'system') {
        applyThemeMode('system');
      }
    };

    mediaQuery.addEventListener('change', changeThemeOnSystemChange);
    return () => {
      mediaQuery.removeEventListener('change', changeThemeOnSystemChange);
    };
  }, [theme, applyThemeMode]);

  // Apply dark/light mode class
  useEffect(() => {
    applyThemeMode(theme);
  }, [theme, applyThemeMode]);

  // Apply dynamic color theme
  useEffect(() => {
    if (storedThemeRGB) {
      applyTheme(storedThemeRGB);
    }
  }, [storedThemeRGB]);

  // Reset theme function
  const resetTheme = useCallback(() => {
    setTheme('system');
    setStoredThemeRGB(undefined);
    setStoredThemeName(undefined);
    // Remove any custom CSS variables
    const root = document.documentElement;
    const customProps = Array.from(root.style).filter((prop) => prop.startsWith('--'));
    customProps.forEach((prop) => root.style.removeProperty(prop));
  }, [setTheme, setStoredThemeRGB, setStoredThemeName]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      themeRGB: storedThemeRGB,
      setThemeRGB: setStoredThemeRGB,
      themeName: storedThemeName,
      setThemeName: setStoredThemeName,
      resetTheme,
    }),
    [
      theme,
      setTheme,
      storedThemeRGB,
      setStoredThemeRGB,
      storedThemeName,
      setStoredThemeName,
      resetTheme,
    ],
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
