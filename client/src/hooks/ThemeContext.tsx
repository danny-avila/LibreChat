//ThemeContext.js
// source: https://plainenglish.io/blog/light-and-dark-mode-in-react-web-application-with-tailwind-css-89674496b942

import React, { createContext, useState, useEffect } from 'react';

type ProviderValue = {
  theme: string;
  setTheme: React.Dispatch<React.SetStateAction<string>>;
};

const defaultContextValue: ProviderValue = {
  theme: 'light',
  setTheme: () => {},
};

export const ThemeContext = createContext<ProviderValue>(defaultContextValue);

interface ThemeProviderProps {
  initialTheme?: string;
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ initialTheme, children }) => {
  const getInitialTheme = () => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const storedPrefs = window.localStorage.getItem('color-theme');
      if (typeof storedPrefs === 'string') {
        return storedPrefs;
      }
      const userMedia = window.matchMedia('(prefers-color-scheme: dark)');
      if (userMedia.matches) {
        return 'dark';
      }
    }
    return 'light'; // light theme as the default;
  };

  const [theme, setTheme] = useState<string>(initialTheme || getInitialTheme());

  const rawSetTheme = (rawTheme: string) => {
    const root = window.document.documentElement;
    let isDark = rawTheme === 'dark';

    if (rawTheme === 'system') {
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    root.classList.remove(isDark ? 'light' : 'dark');
    root.classList.add(isDark ? 'dark' : 'light');

    localStorage.setItem('color-theme', rawTheme);
  };

  useEffect(() => {
    rawSetTheme(theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
