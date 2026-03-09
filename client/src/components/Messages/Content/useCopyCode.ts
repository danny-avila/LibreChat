import { useRef, useState, useCallback } from 'react';
import copy from 'copy-to-clipboard';

export default function useCopyCode(codeRef: React.RefObject<HTMLElement | null>) {
  const [isCopied, setIsCopied] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleCopy = useCallback(() => {
    const codeString = codeRef.current?.textContent;
    if (codeString == null) {
      return;
    }

    const wasFocused = document.activeElement === buttonRef.current;
    setIsCopied(true);
    copy(codeString.trim(), { format: 'text/plain' });

    if (wasFocused) {
      requestAnimationFrame(() => buttonRef.current?.focus());
    }

    setTimeout(() => {
      const focused = document.activeElement as HTMLElement | null;
      setIsCopied(false);
      requestAnimationFrame(() => focused?.focus());
    }, 3000);
  }, [codeRef]);

  return { isCopied, buttonRef, handleCopy };
}
