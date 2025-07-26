import React, { createContext, useState, useEffect } from 'react';
import { useSetAtom } from 'jotai';
import { getInitialTheme, applyFontSize } from '~/utils';
import { fontSizeAtom } from '~/store';

type ProviderValue = {
  theme: string;
  setTheme: React.Dispatch<React.SetStateAction<string>>;
};

export const ThemeContext = createContext<ProviderValue>({
  theme: 'light',
  setTheme: () => {},
});

export const ThemeProvider = ({
  initialTheme,
  children,
}: {
  initialTheme?: string;
  children: React.ReactNode;
}) => {
  const [theme, setTheme] = useState<string>(() => initialTheme ?? getInitialTheme());
  const setFontSize = useSetAtom(fontSizeAtom);

  useEffect(() => {
    const root = document.documentElement;
    const darkMode =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : theme === 'dark';

    root.classList.toggle('dark', darkMode);
    root.classList.toggle('light', !darkMode);
    localStorage.setItem('color-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setTheme(e.matches ? 'dark' : 'light');

    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  useEffect(() => {
    const saved = localStorage.getItem('fontSize') || 'text-base';
    applyFontSize(saved);
    setFontSize(saved);
  }, [setFontSize]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
};
