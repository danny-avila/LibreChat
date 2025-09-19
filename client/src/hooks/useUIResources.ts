import { useRecoilState } from 'recoil';
import { useCallback } from 'react';
import type { TAttachment } from 'librechat-data-provider';
import { Tools } from 'librechat-data-provider';
import type { UIResource } from '~/common';
import store from '~/store';

export function useUIResources() {
  const [uiResources, setUIResources] = useRecoilState(store.uiResourcesState);

  const storeUIResourcesFromAttachments = useCallback(
    (attachments?: TAttachment[]) => {
      if (!attachments) return;

      const resources = attachments
        .filter((attachment) => attachment.type === Tools.ui_resources)
        .flatMap((attachment) => attachment[Tools.ui_resources] as UIResource[]);

      if (resources.length === 0) return;

      setUIResources((prevState) => {
        const newState = { ...prevState };
        resources.forEach((resource) => {
          // Use the full URI as the key
          if (resource.uri) {
            newState[resource.uri] = resource;
          }
        });
        return newState;
      });
    },
    [setUIResources],
  );

  const getUIResourceById = useCallback(
    (id: string): UIResource | undefined => {
      return uiResources?.[id];
    },
    [uiResources],
  );

  const clearUIResources = useCallback(() => {
    setUIResources(null);
  }, [setUIResources]);

  return {
    uiResources,
    storeUIResourcesFromAttachments,
    getUIResourceById,
    clearUIResources,
  };
}

export default useUIResources;
