import { atom } from 'jotai';

/** Playback ownership that prevents the message row window from unmounting
 * the controls and audio element for the active read-aloud message. */
export const activeSpeechMessageIdAtom = atom<string | null>(null);
