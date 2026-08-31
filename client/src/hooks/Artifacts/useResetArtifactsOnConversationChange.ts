import { useEffect, useRef } from 'react';
import { useRecoilValue, useResetRecoilState } from 'recoil';
import store from '~/store';

/**
 * Wipes `artifactsState` / `currentArtifactId` whenever the active
 * conversation changes. `useArtifacts` already runs this cleanup, but
 * only while the side panel is mounted — so without a top-level guard,
 * tool-artifact cards that self-heal their entries while the panel is
 * closed would leak into the next conversation's panel on open. The
 * matching cards for the new conversation re-register via their own
 * self-heal subscription after this wipe lands.
 */
export default function useResetArtifactsOnConversationChange(): void {
  const conversationId = useRecoilValue(store.conversationIdByIndex(0));
  const resetArtifacts = useResetRecoilState(store.artifactsState);
  const resetCurrentArtifactId = useResetRecoilState(store.currentArtifactId);
  const prevConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevConversationIdRef.current;
    const next = conversationId ?? null;
    prevConversationIdRef.current = next;
    if (prev == null || prev === next) {
      return;
    }
    resetArtifacts();
    resetCurrentArtifactId();
  }, [conversationId, resetArtifacts, resetCurrentArtifactId]);
}
