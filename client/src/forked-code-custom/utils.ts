/**
 * Utility functions for forked customizations
 */

/**
 * Check if the user is on a macOS device
 * Uses userAgent instead of deprecated platform API
 */
export const isMacOS = (): boolean => {
  const userAgent = navigator.userAgent.toLowerCase();
  return userAgent.includes('mac');
};

/**
 * Get the appropriate command key symbol based on OS
 */
export const getCmdKey = (): string => {
  return isMacOS() ? '⌘' : 'Ctrl';
};

// Add global type for window.lastThemeChange
declare global {
  interface Window {
    lastThemeChange?: number;
  }
}

/**
 * Properly toggle between light and dark themes using the same methods as the ThemeContext
 * This implements the core theme switching logic matching the app's implementation
 *
 * @returns {string} The new theme value ('light' or 'dark')
 */
export const toggleTheme = (): string => {
  // Read the current theme from localStorage
  const storedTheme = localStorage.getItem('color-theme');

  // Determine the next theme: dark -> light -> dark
  let newTheme: string;

  if (storedTheme === 'dark') {
    newTheme = 'light';
  } else {
    // Either 'light', 'system', or null/undefined - always convert to dark
    newTheme = 'dark';
  }

  // Apply the theme (in the same way ThemeContext does)
  const root = document.documentElement;
  const isDarkMode = newTheme === 'dark';

  root.classList.remove(isDarkMode ? 'light' : 'dark');
  root.classList.add(isDarkMode ? 'dark' : 'light');

  // Store the theme setting in localStorage
  localStorage.setItem('color-theme', newTheme);

  // If the app reacts to storage events, dispatch one
  window.dispatchEvent(new Event('storage'));

  // Track the last theme change time (used by the theme selector component)
  window.lastThemeChange = Date.now();

  return newTheme;
};