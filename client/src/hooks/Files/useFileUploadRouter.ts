import { useCallback } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { Constants, EToolResources } from 'librechat-data-provider';
import store, { ephemeralAgentByConvoId } from '~/store';
import useFileHandling from './useFileHandling';

/**
 * Returns a function that attaches files to a chosen upload destination, enabling the
 * matching ephemeral-agent capability first (file search is left for explicit opt-in to
 * preserve legacy behavior). Shared by the paste, drag, and modal flows.
 */
export default function useFileUploadRouter() {
  const { handleFiles } = useFileHandling();
  const conversation = useRecoilValue(store.conversationByIndex(0)) || undefined;
  const setEphemeralAgent = useSetRecoilState(
    ephemeralAgentByConvoId(conversation?.conversationId ?? Constants.NEW_CONVO),
  );

  return useCallback(
    (files: File[], toolResource?: EToolResources) => {
      if (toolResource && toolResource !== EToolResources.file_search) {
        setEphemeralAgent((prev) => ({
          ...prev,
          [toolResource]: true,
        }));
      }
      handleFiles(files, toolResource);
    },
    [handleFiles, setEphemeralAgent],
  );
}
