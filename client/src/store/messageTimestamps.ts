import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';

/**
 * Atom family for storing message timestamps
 * Used to lock timestamps immediately when messages are received via SSE
 * This ensures optimistic timestamps for better UX
 */
export const messageTimestampAtomFamily = atomFamily((messageId: string) => {
  const timestampAtom = atom<string | null>(null);
  timestampAtom.debugLabel = `messageTimestamp-${messageId}`;
  return timestampAtom;
});
