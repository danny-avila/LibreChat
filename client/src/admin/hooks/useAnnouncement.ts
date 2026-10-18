import { useState, useCallback } from 'react';

/**
 * Manages a screen reader announcement string for aria-live regions.
 * Returns the current message and an `announce` setter.
 */
export function useAnnouncement(): {
  readonly message: string;
  readonly announce: (text: string) => void;
} {
  const [message, setMessage] = useState('');
  const announce = useCallback((text: string) => {
    setMessage('');
    const update = () => setMessage(text);
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(update);
    } else {
      setTimeout(update, 0);
    }
  }, []);
  return { message, announce } as const;
}
