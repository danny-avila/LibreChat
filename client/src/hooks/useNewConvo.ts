import { useCallback } from 'react';
import { EModelEndpoint, FileSources, defaultOrderQuery } from 'librechat-data-provider';
import { useGetEndpointsQuery } from 'librechat-data-provider/react-query';
import {
  useSetRecoilState,
  useResetRecoilState,
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
} from 'recoil';
import type {
  TConversation,
  TSubmission,
  TPreset,
  TModelsConfig,
  TEndpointsConfig,
} from 'librechat-data-provider';
import { buildDefaultConvo, getDefaultEndpoint, getEndpointField } from '~/utils';
import { useDeleteFilesMutation, useListAssistantsQuery } from '~/data-provider';
import useOriginNavigate from './useOriginNavigate';
import useSetStorage from './useSetStorage';
import store from '~/store';

const useNewConvo = (index = 0) => {
  const setStorage = useSetStorage();
  const navigate = useOriginNavigate();
  const defaultPreset = useRecoilValue(store.defaultPreset);
  const { setConversation } = store.useCreateConversationAtom(index);
  const [files, setFiles] = useRecoilState(store.filesByIndex(index));
  const setSubmission = useSetRecoilState<TSubmission | null>(store.submissionByIndex(index));
  const resetLatestMessage = useResetRecoilState(store.latestMessageFamily(index));
  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();

  const { data: assistants = [] } = useListAssistantsQuery(defaultOrderQuery, {
    select: (res) => res.data.map(({ id, name, metadata }) => ({ id, name, metadata })),
  });

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
        preset: Partial<TPreset> | null = null,
        modelsData?: TModelsConfig,
        buildDefault?: boolean,
        keepLatestMessage?: boolean,
      ) => {
        const modelsConfig = modelsData ?? snapshot.getLoadable(store.modelsConfig).contents;
        const { endpoint = null } = conversation;
        const buildDefaultConversation = endpoint === null || buildDefault;
        const activePreset =
          // use default preset only when it's defined,
          // preset is not provided,
          // endpoint matches or is null (to allow endpoint change),
          // and buildDefaultConversation is true
          defaultPreset &&
          !preset &&
          (defaultPreset.endpoint === endpoint || !endpoint) &&
          buildDefaultConversation
            ? defaultPreset
            : preset;

        if (buildDefaultConversation) {
          const defaultEndpoint = getDefaultEndpoint({
            convoSetup: activePreset ?? conversation,
            endpointsConfig,
          });

          const endpointType = getEndpointField(endpointsConfig, defaultEndpoint, 'type');
          if (!conversation.endpointType && endpointType) {
            conversation.endpointType = endpointType;
          } else if (conversation.endpointType && !endpointType) {
            conversation.endpointType = undefined;
          }

          if (!conversation.assistant_id && defaultEndpoint === EModelEndpoint.assistants) {
            const assistant_id =
              localStorage.getItem(`assistant_id__${index}`) ?? assistants[0]?.id;
            conversation.assistant_id = assistant_id;
          }

          const models = modelsConfig?.[defaultEndpoint] ?? [];
          conversation = buildDefaultConvo({
            conversation,
            lastConversationSetup: activePreset as TConversation,
            endpoint: defaultEndpoint,
            models,
          });
        }

        setStorage(conversation);
        setConversation(conversation);
        setSubmission({} as TSubmission);
        if (!keepLatestMessage) {
          resetLatestMessage();
        }

        if (conversation.conversationId === 'new' && !modelsData) {
          const appTitle = localStorage.getItem('appTitle');
          if (appTitle) {
            document.title = appTitle;
          }
          navigate('new');
        }
      },
    [endpointsConfig, defaultPreset, assistants],
  );

  const newConversation = useCallback(
    ({
      template = {},
      preset,
      modelsData,
      buildDefault = true,
      keepLatestMessage = false,
    }: {
      template?: Partial<TConversation>;
      preset?: Partial<TPreset>;
      modelsData?: TModelsConfig;
      buildDefault?: boolean;
      keepLatestMessage?: boolean;
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
          .filter((file) => file.filepath && file.source)
          .map((file) => ({
            file_id: file.file_id,
            filepath: file.filepath as string,
            source: file.source as FileSources, // Ensure that the source is of type FileSources
          }));

        setFiles(new Map());
        localStorage.setItem('filesToDelete', JSON.stringify({}));

        if (filesToDelete.length > 0) {
          mutateAsync({ files: filesToDelete });
        }
      }

      switchToConversation(conversation, preset, modelsData, buildDefault, keepLatestMessage);
    },
    [switchToConversation, files, mutateAsync, setFiles],
  );

  return {
    switchToConversation,
    newConversation,
  };
};

export default useNewConvo;
