import { useCallback } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import {
  respondToElicitation as apiRespondToElicitation,
  ElicitationResponse,
  ElicitationState,
} from 'librechat-data-provider';
import { activeElicitationsState, elicitationDataState } from '~/store';

export function useElicitation(toolCallId?: string) {
  const activeElicitations = useRecoilValue(activeElicitationsState);
  const elicitationData = useRecoilValue(elicitationDataState);
  const setActiveElicitations = useSetRecoilState(activeElicitationsState);
  const setElicitationData = useSetRecoilState(elicitationDataState);

  // Get active elicitation for a specific tool call
  const getElicitationForToolCall = useCallback(
    (tcId?: string) => {
      if (tcId) {
        const activeElicitation = activeElicitations[tcId];
        if (activeElicitation) {
          return elicitationData[activeElicitation.id] || null;
        }
      }

      return null;
    },
    [activeElicitations, elicitationData],
  );

  const respondToElicitation = useCallback(
    async (elicitationId: string, response: ElicitationResponse) => {
      try {
        await apiRespondToElicitation(elicitationId, response);

        // Manually remove the elicitation from state since we don't have an SSE event for responses
        setElicitationData((prev) => {
          const newState = { ...prev };
          delete newState[elicitationId];
          return newState;
        });

        // Remove from active elicitations
        setActiveElicitations((prev) => {
          const newState = { ...prev };
          // Find and remove the elicitation from active state
          Object.keys(newState).forEach((key) => {
            if (newState[key].id === elicitationId) {
              delete newState[key];
            }
          });
          return newState;
        });
      } catch (error) {
        console.error('Failed to respond to elicitation:', error);
        throw error;
      }
    },
    [setElicitationData, setActiveElicitations],
  );

  // Get the current elicitation for this tool call
  const currentElicitation = getElicitationForToolCall(toolCallId) as ElicitationState | null;

  return {
    activeElicitation: currentElicitation,
    hasActiveElicitation: !!currentElicitation,
    respondToElicitation,
    getElicitationForToolCall,
  };
}
