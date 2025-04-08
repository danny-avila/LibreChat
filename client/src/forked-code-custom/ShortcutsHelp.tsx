import React, { useState, useEffect, useRef } from 'react';
import { isMacOS } from './utils';

/**
 * Keyboard shortcuts help overlay
 * Shows available keyboard shortcuts in a subtle, clean way
 */
const ShortcutsHelp = () => {
  const [isVisible, setIsVisible] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Listen for ⌘+K or Ctrl+K to toggle the help overlay
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsVisible(prev => !prev);
      }

      // Also close when Escape is pressed
      if (e.key === 'Escape' && isVisible) {
        setIsVisible(false);
      }
    };

    // Handle clicks outside the modal
    const handleOutsideClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setIsVisible(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    if (isVisible) {
      // Only add the click event listener when the modal is visible
      document.addEventListener('mousedown', handleOutsideClick);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isVisible]);

  // If not visible, don't render anything
  if (!isVisible) { return null; }

  // Render the shortcuts help overlay
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div
        ref={modalRef}
        className="bg-surface-primary dark:bg-gray-800 text-text-primary rounded-lg shadow-xl max-w-md w-full max-h-[80vh] overflow-y-auto"
      >
        <div className="p-4 border-b border-surface-tertiary flex justify-between items-center">
          <h2 className="text-lg font-semibold">
            {'Keyboard Shortcuts'}
          </h2>
          <button
            className="text-text-secondary hover:text-text-primary transition-colors"
            onClick={() => setIsVisible(false)}
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="p-4">
          <ul className="space-y-3">
            <ShortcutItem
              keys={['⌘', 'Shift', 'O']}
              keysWin={['Ctrl', 'Shift', 'O']}
              description="Create a new chat"
            />
            <ShortcutItem
              keys={['⌘', 'B']}
              keysWin={['Ctrl', 'B']}
              description="Toggle sidebar"
            />
            <ShortcutItem
              keys={['⌘', 'Shift', 'D']}
              keysWin={['Ctrl', 'Shift', 'D']}
              description="Cycle theme (dark/light/system)"
            />
            <ShortcutItem
              keys={['Esc']}
              description="Stop AI generation"
            />
            <ShortcutItem
              keys={['⌘', 'K']}
              keysWin={['Ctrl', 'K']}
              description="Show/hide this help"
            />
          </ul>
        </div>

        <div className="p-4 border-t border-surface-tertiary text-center text-text-secondary text-sm">
          {'Press Esc or click outside to close'}
        </div>
      </div>
    </div>
  );
};

// Helper component to render a shortcut item with consistent styling
interface ShortcutItemProps {
  keys: string[];
  keysWin?: string[];
  description: string;
}

const ShortcutItem: React.FC<ShortcutItemProps> = ({ keys, keysWin, description }) => {
  // Check if user is on macOS
  const mac = isMacOS();
  const shortcutKeys = mac || !keysWin ? keys : keysWin;

  return (
    <li className="flex items-center justify-between">
      <span>{description}</span>
      <div className="flex items-center space-x-1">
        {shortcutKeys.map((key, index) => (
          <React.Fragment key={index}>
            <kbd className="px-2 py-1 bg-surface-secondary dark:bg-gray-700 rounded text-sm">
              {formatKeySymbol(key)}
            </kbd>
            {index < shortcutKeys.length - 1 && <span>+</span>}
          </React.Fragment>
        ))}
      </div>
    </li>
  );
};

/**
 * Format key symbols to display OS-specific keys
 */
const formatKeySymbol = (key: string): React.ReactNode => {
  // Check if the platform is Mac
  const mac = isMacOS();

  switch (key) {
    case '⌘':
      return mac ? '⌘' : 'Ctrl';
    case 'Ctrl':
      return mac ? '⌘' : 'Ctrl';
    case 'Alt':
      return mac ? '⌥' : 'Alt';
    case 'Shift':
      return mac ? '⇧' : 'Shift';
    case 'Enter':
      return mac ? '↵' : 'Enter';
    case 'Esc':
      return 'Esc';
    default:
      return key;
  }
};

export default ShortcutsHelp;