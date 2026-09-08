import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';

/**
 * How many composer panels are open over the bottom of a conversation's
 * thread — an `ask_user_question` popover, a tool-approval review. They float
 * up from the composer (`bottom-28`) while the scroll-to-bottom control floats
 * up from the thread's edge, so the two meet in the same strip whenever the
 * composer is taller than ~92px, which it always is. The control stands down
 * while the count is above zero. Each panel registers through
 * `useComposerOverlay` for exactly as long as it renders, so the count can
 * never go stale; like `steerOverlayHeightFamily`, the family is never GC'd
 * but holds one number per visited conversation.
 */
export const composerOverlayCountFamily = atomFamily((_conversationId: string) => atom<number>(0));
