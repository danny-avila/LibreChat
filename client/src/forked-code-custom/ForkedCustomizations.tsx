import React, { useEffect } from 'react';
import { initModelData } from './modelBadges';
import ShortcutsHelp from './ShortcutsHelp';
import KeyboardShortcuts from './KeyboardShortcuts';

/**
 * ForkedCustomizations component
 *
 * This component serves as a central container for all custom UI components and initializations
 * in our forked version of LibreChat. It's designed following best practices for maintainable forks:
 *
 * 1. Isolation: All custom code is contained in separate files rather than modifying upstream code
 * 2. Single integration point: Mounts at the root level in main.jsx with minimal changes to upstream files
 * 3. Clean cleanup: Proper useEffect cleanup to prevent memory leaks
 * 4. Extensibility: Easy to add additional custom components without modifying core files
 *
 * When adding new customizations:
 * - If it's a UI component, add it to the render section below
 * - If it needs initialization, add it to the useEffect hook
 * - If it needs cleanup, add it to the return function in useEffect
 */
const ForkedCustomizations: React.FC = () => {
  useEffect(() => {
    // Initialize model data
    initModelData().catch(err => {
      console.error('Failed to initialize model data:', err);
    });

    // Initialize keyboard shortcuts
    KeyboardShortcuts.initialize();

    // Cleanup on unmount
    return () => {
      KeyboardShortcuts.cleanup();
    };
  }, []);

  return (
    <>
      {/* Keyboard shortcuts help overlay */}
      <ShortcutsHelp />

      {/* Add other custom UI components here */}
    </>
  );
};

export default ForkedCustomizations;