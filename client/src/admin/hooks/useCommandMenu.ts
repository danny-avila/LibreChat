import { useState, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';

export function useCommandMenu(): { open: boolean; setOpen: Dispatch<SetStateAction<boolean>> } {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return { open, setOpen };
}
