import { useCallback } from 'react';
import { useGetEndpointsQuery } from 'librechat-data-provider';
import { useSetRecoilState, useResetRecoilState, useRecoilCallback, useRecoilState } from 'recoil';
import type { TConversation, TSubmission, TPreset, TModelsConfig } from 'librechat-data-provider';
import { buildDefaultConvo, getDefaultEndpoint } from '~/utils';
import { useDeleteFilesMutation } from '~/data-provider';
import useOriginNavigate from './useOriginNavigate';
import useSetStorage from './useSetStorage';
import store from '~/store';

const useNewConvo = (index = 0) => {
  const setStorage = useSetStorage();
  const navigate = useOriginNavigate();
  const { setConversation } = store.useCreateConversationAtom(index);
  const [files, setFiles] = useRecoilState(store.filesByIndex(index));
  const setSubmission = useSetRecoilState<TSubmission | null>(store.submissionByIndex(index));
  const resetLatestMessage = useResetRecoilState(store.latestMessageFamily(index));
  const { data: endpointsConfig = {} } = useGetEndpointsQuery();

  const { mutateAsync } = useDeleteFilesMutation({
    onSuccess: () => {
      console.log('Files deleted');
    },
    onError: (error) => {
      console.log('Error deleting files:', error);
    },
  });

  const switchToConversation = useRecoilCallback(
    ({ snapshot }) =>
      async (
        conversation: TConversation,
        preset: TPreset | null = null,
        modelsData?: TModelsConfig,
        buildDefault?: boolean,
      ) => {
        const modelsConfig = modelsData ?? snapshot.getLoadable(store.modelsConfig).contents;
        const { endpoint = null } = conversation;

        if (endpoint === null || buildDefault) {
          const defaultEndpoint = getDefaultEndpoint({
            convoSetup: preset ?? conversation,
            endpointsConfig,
          });

          const models = modelsConfig?.[defaultEndpoint] ?? [];
          conversation = buildDefaultConvo({
            conversation,
            lastConversationSetup: preset as TConversation,
            endpoint: defaultEndpoint,
            models,
          });
        }

        setStorage(conversation);
        setConversation(conversation);
        setSubmission({} as TSubmission);
        resetLatestMessage();

        if (conversation.conversationId === 'new' && !modelsData) {
          navigate('new');
        }
      },
    [endpointsConfig],
  );

  const newConversation = useCallback(
    ({
      template = {},
      preset,
      modelsData,
      buildDefault = true,
    }: {
      template?: Partial<TConversation>;
      preset?: TPreset;
      modelsData?: TModelsConfig;
      buildDefault?: boolean;
    } = {}) => {
      const conversation = {
        conversationId: 'new',
        title: 'New Chat',
        endpoint: null,
        ...template,
        createdAt: '',
        updatedAt: '',
      };

      if (conversation.conversationId === 'new' && !modelsData) {
        const filesToDelete = Array.from(files.values())
          .filter((file) => file.filepath)
          .map((file) => ({
            file_id: file.file_id,
            filepath: file.filepath as string,
          }));

        setFiles(new Map());
        localStorage.setItem('filesToDelete', JSON.stringify({}));

        if (filesToDelete.length > 0) {
          mutateAsync({ files: filesToDelete });
        }
      }

      switchToConversation(conversation, preset, modelsData, buildDefault);
    },
    [switchToConversation, files, mutateAsync, setFiles],
  );

  return {
    switchToConversation,
    newConversation,
  };
};

export default useNewConvo;
