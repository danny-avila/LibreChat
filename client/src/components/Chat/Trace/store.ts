import { atom } from 'jotai';

/**
 * The conversation whose trace covers the chat surface, or `null` when the chat
 * shows. Keyed by conversation so a trace never survives into another chat.
 * Memory-only: a reload returns to the conversation.
 */
export const traceViewerConversationAtom = atom<string | null>(null);
