import { useEffect } from 'react';
import { useSetAtom } from 'jotai';
import { composerOverlayCountFamily } from '~/store/overlay';

/**
 * Registers a composer panel as open for `conversationId` while `open` holds,
 * so the thread's scroll-to-bottom control stands down instead of landing on
 * the panel's footer. Call it before the panel's early return; the effect's
 * cleanup unregisters on close, unmount, and conversation change alike.
 */
export default function useComposerOverlay(conversationId: string, open: boolean): void {
  const setCount = useSetAtom(composerOverlayCountFamily(conversationId));

  useEffect(() => {
    if (!open) {
      return;
    }
    setCount((count) => count + 1);
    return () => setCount((count) => count - 1);
  }, [open, setCount]);
}
