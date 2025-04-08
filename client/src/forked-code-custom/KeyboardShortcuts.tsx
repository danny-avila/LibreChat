/**
 * Keyboard shortcuts for LibreChat
 * Forked implementation to add custom keyboard shortcuts without modifying upstream files
 *
 * NOTE: This implementation uses DOM queries to find elements and trigger clicks,
 * which may be fragile if the UI structure changes. In the long term, consider
 * proposing adding data-shortcut attributes to the upstream repo for better stability.
 */

import { isMacOS, getCmdKey, toggleTheme } from './utils';

// Get the appropriate command key based on OS
const cmdKey = getCmdKey();

// Store reference to event listeners for cleanup
let keydownListener: ((e: KeyboardEvent) => void) | null = null;

/**
 * Initialize keyboard shortcuts
 */
export const initialize = () => {
  if (keydownListener) {
    // Already initialized
    return;
  }

  // Log available shortcuts
  console.log('🔑 Keyboard shortcuts initialized:');
  console.log(`- New Chat: ${cmdKey}+Shift+O`);
  console.log('- Stop Generation: Escape');
  console.log(`- Toggle Sidebar: ${cmdKey}+B`);
  console.log(`- Toggle Theme: ${cmdKey}+Shift+D`);
  console.log(`- Help: ${cmdKey}+K`);

  // Define the keyboard event handler
  keydownListener = (e: KeyboardEvent) => {
    // CMD+SHIFT+O for new chat (Mac) or CTRL+SHIFT+O (Windows/Linux)
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      handleNewChat();
      return;
    }

    // CMD+B (Mac) or CTRL+B (Windows/Linux) to toggle sidebar
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      handleToggleSidebar();
      return;
    }

    // CMD+SHIFT+D (Mac) or CTRL+SHIFT+D (Windows/Linux) to toggle theme
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      handleToggleTheme();
      return;
    }

    // ESC to stop generation
    if (e.key === 'Escape') {
      handleStopGeneration();
      return;
    }

    // Note: The help dialog (CMD+K or CTRL+K) is handled by the ShortcutsHelp component
  };

  // Add event listener
  window.addEventListener('keydown', keydownListener);
};

/**
 * Clean up keyboard shortcuts
 */
export const cleanup = () => {
  if (keydownListener) {
    window.removeEventListener('keydown', keydownListener);
    keydownListener = null;
  }
};

/**
 * Helper function to simulate a click on an element
 * with fallback handling options
 */
const safelyClickElement = (
  element: HTMLElement | null | undefined,
  actionName: string,
  fallbackOptions?: {
    urlPath?: string,
    stateAction?: () => void
  }
) => {
  if (element) {
    try {
      element.click();
      console.log(`${actionName} via keyboard shortcut`);
      return true;
    } catch (error) {
      console.error(`Error clicking ${actionName} element:`, error);
    }
  } else {
    console.warn(`${actionName} element not found in the DOM`);
  }

  // Try fallback options if provided
  if (fallbackOptions?.urlPath) {
    try {
      // Check if we're not already on this path
      if (!window.location.pathname.endsWith(fallbackOptions.urlPath)) {
        window.location.href = fallbackOptions.urlPath;
        console.log(`Navigated to ${fallbackOptions.urlPath} as fallback`);
        return true;
      }
    } catch (error) {
      console.error(`Error using fallback URL for ${actionName}:`, error);
    }
  }

  if (fallbackOptions?.stateAction) {
    try {
      fallbackOptions.stateAction();
      console.log(`Executed state action for ${actionName}`);
      return true;
    } catch (error) {
      console.error(`Error executing state action for ${actionName}:`, error);
    }
  }

  return false;
};

/**
 * Handler for the new chat shortcut
 *
 * This implementation clicks the new chat button in the sidebar
 */
const handleNewChat = () => {
  console.log('⌨️ Keyboard shortcut activated: New Chat (⌘+Shift+O)');

  // Try multiple selectors for robustness
  const newChatButton =
    document.querySelector('[data-testid="nav-new-chat-button"]') ||
    document.querySelector('a[href="/c/new"]') ||
    document.querySelector('a[href="/"]') ||
    document.querySelector('a[aria-label*="new chat" i]') ||
    document.querySelector('button[aria-label*="new chat" i]');

  safelyClickElement(
    newChatButton as HTMLElement,
    'New chat',
    { urlPath: '/c/new' }
  );
};

/**
 * Handler to toggle sidebar visibility
 */
const handleToggleSidebar = () => {
  console.log(`⌨️ Keyboard shortcut activated: Toggle Sidebar (${cmdKey}+B)`);

  // Try multiple possible selectors for the sidebar toggle button
  const sidebarToggle =
    document.querySelector('[aria-label="Toggle sidebar"]') ||
    document.querySelector('.sidebar-button') ||
    document.querySelector('[aria-label="Open sidebar"]') ||
    document.querySelector('[aria-label="Close sidebar"]') ||
    document.querySelector('button[title*="sidebar" i]') ||
    document.querySelector('button.mobile-nav-button');

  // If main toggle not found, try to find mobile menu buttons
  if (!safelyClickElement(sidebarToggle as HTMLElement, 'Sidebar toggle')) {
    const mobileMenuBurger =
      document.querySelector('.mobile-nav-button') ||
      document.querySelector('[aria-label*="menu" i]') ||
      document.querySelector('.menu-icon') ||
      document.querySelector('.hamburger-menu');

    safelyClickElement(mobileMenuBurger as HTMLElement, 'Mobile menu toggle');
  }
};

/**
 * Handler to stop AI generation
 */
const handleStopGeneration = () => {
  console.log('⌨️ Keyboard shortcut activated: Stop Generation (Escape)');

  // Try multiple selectors for the stop button
  const stopButton =
    document.querySelector('[aria-label="Stop generating"]') ||
    document.querySelector('button[title*="stop" i]') ||
    document.querySelector('button[aria-label*="stop" i]') ||
    document.querySelector('button.stop-generating');

  safelyClickElement(stopButton as HTMLElement, 'Stop generation');
};

/**
 * Handler to toggle theme between light, dark, and system
 * Cycles through the themes: dark → light → system → dark
 */
const handleToggleTheme = () => {
  console.log(`⌨️ Keyboard shortcut activated: Toggle Theme (${cmdKey}+Shift+D)`);

  try {
    // Toggle the theme using our utility function that matches the ThemeContext implementation
    const newTheme = toggleTheme();

    // Provide feedback based on the theme that was set
    if (newTheme === 'system') {
      const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      console.log(`Theme changed to system (currently ${systemIsDark ? 'dark' : 'light'} based on OS setting)`);
    } else {
      console.log(`Theme changed to ${newTheme}`);
    }
  } catch (error) {
    console.error('Error toggling theme:', error);
  }
};

export default {
  initialize,
  cleanup,
};