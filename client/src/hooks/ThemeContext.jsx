//ThemeContext.js
// source: https://plainenglish.io/blog/light-and-dark-mode-in-react-web-application-with-tailwind-css-89674496b942

import React, { createContext, useState, useEffect } from 'react';

const getInitialTheme = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    const storedPrefs = window.localStorage.getItem('color-theme');
    try {
      return JSON.parse(storedPrefs);
    } catch {
      const userMedia = window.matchMedia('(prefers-color-scheme: dark)');
      if (storedPrefs === 'dark' || userMedia.matches) {
        return { color: 'default', theme: 'dark' };
      }
    }
  }

  return { color: 'default', theme: 'light' };
};

export const ThemeContext = createContext();

export const ThemeProvider = ({ initialTheme, children }) => {
  const [theme, setTheme] = useState(getInitialTheme);

  const rawSetTheme = rawTheme => {
    if (!rawTheme) return;

    const root = window.document.documentElement;
    // { color: 'chatgpt/default', theme: 'dark/light' }

    // Change the classList of root to color, theme
    root.classList.value = '';
    console.log(rawTheme);
    if (rawTheme.color) root.classList.add(rawTheme.color);
    if (rawTheme.theme) root.classList.add(rawTheme.theme);

    // Store the theme in localStorage
    localStorage.setItem('color-theme', JSON.stringify(rawTheme));
  };

  if (initialTheme) {
    rawSetTheme(initialTheme);
  }

  useEffect(() => {
    rawSetTheme(theme);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
};
