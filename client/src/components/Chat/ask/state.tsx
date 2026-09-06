import { createContext, useContext } from 'react';
import { atom } from 'jotai';
import type { ReactNode } from 'react';

/**
 * Action ids the user moved into the chat: the popover is hidden and the
 * composer is released, so the chat card is the question's only surface.
 */
export const collapsedAskActionsAtom = atom<string[]>([]);

/** Currently highlighted option row (keyboard cursor), or nothing. */
export const askAnswerSelectionAtom = atom<number | null>(null);

/** Checked option rows for a multi-select question. */
export const askAnswerCheckedAtom = atom<number[]>([]);

/** Free-form answers keyed by pending action id. */
export const askAnswerTextAtom = atom<Record<string, string>>({});

/** Ordinary composer text keyed by pending action id while the card owns it. */
export const releasedComposerTextAtom = atom<Record<string, string>>({});

/** Submission lifecycle shared by composer and message-content surfaces. */
export type AskAnswerStatus = 'idle' | 'submitting' | 'submitted' | 'expired' | 'error';
export const askSubmitStatusAtom = atom<Record<string, AskAnswerStatus>>({});

const AskAnswerHostContext = createContext(false);

export function AskAnswerHostProvider({
  saveDrafts,
  children,
}: {
  saveDrafts: boolean;
  children?: ReactNode;
}) {
  return (
    <AskAnswerHostContext.Provider value={saveDrafts}>{children}</AskAnswerHostContext.Provider>
  );
}

export function useAskAnswerHost(): boolean {
  return useContext(AskAnswerHostContext);
}
