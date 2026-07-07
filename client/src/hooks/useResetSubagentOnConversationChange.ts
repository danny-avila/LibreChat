import { useEffect, useRef } from 'react';
import { useRecoilValue, useResetRecoilState } from 'recoil';
import store from '~/store';

/**
 * Wipes the subagent run registry and the focused-run id whenever the active
 * conversation changes. Inline cards register their run data into
 * `subagentRunsState` even while the panel is closed, so without a top-level
 * guard a run focused in conversation A could leak into conversation B's panel
 * on open. Runs at the top of `Presentation` (even while the panel is closed);
 * the matching cards for the new conversation re-register on mount. Only
 * `currentSubagentRunId` gates the panel, so the wipe leaves it closed on nav.
 *
 * `subagentPanelVisibility` is intentionally NOT reset — it is a sticky user
 * preference, matching `artifactsVisibility`.
 */
export default function useResetSubagentOnConversationChange(): void {
  const conversationId = useRecoilValue(store.conversationIdByIndex(0));
  const resetRuns = useResetRecoilState(store.subagentRunsState);
  const resetCurrentRunId = useResetRecoilState(store.currentSubagentRunId);
  const prevConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevConversationIdRef.current;
    const next = conversationId ?? null;
    prevConversationIdRef.current = next;
    if (prev == null || prev === next) {
      return;
    }
    resetRuns();
    resetCurrentRunId();
  }, [conversationId, resetRuns, resetCurrentRunId]);
}
