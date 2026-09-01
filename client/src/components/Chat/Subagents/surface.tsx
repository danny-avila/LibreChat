import { createContext, useCallback, useContext } from 'react';
import { useSetAtom } from 'jotai';
import type { ReactNode } from 'react';
import type { ComposerBindings } from '~/hooks/Input/useComposerBindings';
import type { ActiveSubagentPanel } from './state';
import { activeSubagentPanel } from './state';

/**
 * Everything this feature needs from the application hosting it, and nothing
 * it owns itself. Reading these through the host instead of the app store is
 * what keeps the feature liftable: a second host already exists (the shared
 * conversation view), and a host outside this repository would satisfy the
 * same six members without the feature learning where they come from.
 */
export interface ChatSurface {
  /** Enter submits a composer; without it, Enter inserts a newline. */
  enterToSend: boolean;
  /** Message rows stretch to the container instead of the reading column. */
  maximizeChatSpace: boolean;
  /** The reader wants a jump-to-bottom control on scrollable transcripts. */
  showScrollButton: boolean;
  /** The reader's effective composer shortcut bindings. */
  composerBindings: ComposerBindings;
  /** Take the shell's foreground slot — the host closes whatever else holds it. */
  claimForeground: () => void;
  /** Carry unsent composer words into a conversation the host is about to open. */
  handOffComposerText: (conversationId: string, text: string) => void;
}

const ChatSurfaceContext = createContext<ChatSurface | null>(null);

export function ChatSurfaceProvider({
  value,
  children,
}: {
  value: ChatSurface;
  children: ReactNode;
}) {
  return <ChatSurfaceContext.Provider value={value}>{children}</ChatSurfaceContext.Provider>;
}

export function useChatSurface(): ChatSurface {
  const surface = useContext(ChatSurfaceContext);
  if (surface == null) {
    throw new Error('useChatSurface must be used within a ChatSurfaceProvider');
  }
  return surface;
}

/**
 * Selecting a child for the panel and taking the foreground are one action:
 * the panel and whatever else occupies that slot cannot both be open, so a
 * selection made without the yield leaves the reader looking at the other one.
 */
export function useOpenSubagentPanel(): (selection: ActiveSubagentPanel) => void {
  const { claimForeground } = useChatSurface();
  const setSelection = useSetAtom(activeSubagentPanel);
  return useCallback(
    (selection: ActiveSubagentPanel) => {
      claimForeground();
      setSelection(selection);
    },
    [claimForeground, setSelection],
  );
}
