import { useEffect } from 'react';

type Modifier = 'mod' | 'shift' | 'alt';

interface ShortcutOptions {
  /** Key to match (case-insensitive). E.g. 'o', 's', 'Escape'. */
  key: string;
  /**
   * Modifiers required for the shortcut to fire.
   * - 'mod': Cmd on macOS, Ctrl elsewhere (matches `metaKey || ctrlKey`).
   * - 'shift' / 'alt': literal modifiers.
   */
  modifiers?: Modifier[];
  /** Disable the shortcut without unmounting the component. */
  disabled?: boolean;
  /** Prevent the browser default when the shortcut fires (default true). */
  preventDefault?: boolean;
  /** Skip when focus is in an input/textarea/contenteditable element (default false). */
  ignoreInInput?: boolean;
}

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
};

/**
 * Register a global keyboard shortcut. Uses the `'mod'` modifier to mean
 * Cmd on macOS / Ctrl elsewhere, matching common conventions.
 *
 * @example
 *   useKeyboardShortcut(
 *     { key: 'o', modifiers: ['mod', 'shift'] },
 *     () => startNewChat(),
 *     [startNewChat],
 *   );
 */
export default function useKeyboardShortcut(
  options: ShortcutOptions,
  handler: (e: KeyboardEvent) => void,
  deps: React.DependencyList = [],
): void {
  const {
    key,
    modifiers = [],
    disabled = false,
    preventDefault = true,
    ignoreInInput = false,
  } = options;

  useEffect(() => {
    if (disabled) {
      return;
    }

    const needsMod = modifiers.includes('mod');
    const needsShift = modifiers.includes('shift');
    const needsAlt = modifiers.includes('alt');

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== key.toLowerCase()) return;
      if (needsShift !== e.shiftKey) return;
      if (needsAlt !== e.altKey) return;
      if (needsMod !== (e.metaKey || e.ctrlKey)) return;
      if (ignoreInInput && isEditableTarget(e.target)) return;

      if (preventDefault) {
        e.preventDefault();
      }
      handler(e);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, disabled, preventDefault, ignoreInInput, ...deps]);
}
