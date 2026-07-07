import { useCallback } from 'react';
import { useResetRecoilState, useSetRecoilState } from 'recoil';
import store from '~/store';

/**
 * Opens one of the two mutually-exclusive right-side panels — artifacts or a
 * subagent run — that share a single slot in `Presentation`. Opening one
 * clears the other's focus atom, so at most one focus atom is ever non-null.
 * This "newest wins" take-over is what lets the shared slot work without any
 * changes to `SidePanelGroup`, and makes the panel precedence order in
 * `Presentation` irrelevant.
 */
export default function useOpenRightPanel() {
  const setArtifactId = useSetRecoilState(store.currentArtifactId);
  const setArtifactVisible = useSetRecoilState(store.artifactsVisibility);
  const resetArtifactId = useResetRecoilState(store.currentArtifactId);
  const setRunId = useSetRecoilState(store.currentSubagentRunId);
  const setRunVisible = useSetRecoilState(store.subagentPanelVisibility);
  const resetRunId = useResetRecoilState(store.currentSubagentRunId);

  const openSubagentRun = useCallback(
    (toolCallId: string) => {
      resetArtifactId();
      setRunId(toolCallId);
      setRunVisible(true);
    },
    [resetArtifactId, setRunId, setRunVisible],
  );

  const closeSubagentRun = useCallback(() => {
    resetRunId();
    setRunVisible(false);
  }, [resetRunId, setRunVisible]);

  const openArtifact = useCallback(
    (artifactId: string) => {
      resetRunId();
      setArtifactId(artifactId);
      setArtifactVisible(true);
    },
    [resetRunId, setArtifactId, setArtifactVisible],
  );

  return { openSubagentRun, closeSubagentRun, openArtifact };
}
