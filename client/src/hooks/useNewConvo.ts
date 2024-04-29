import { useCallback, useRef } from 'react';
import {
  useGetModelsQuery,
  useGetStartupConfig,
  useGetEndpointsQuery,
} from 'librechat-data-provider/react-query';
import {
  FileSources,
  EModelEndpoint,
  LocalStorageKeys,
  defaultOrderQuery,
} from 'librechat-data-provider';
import {
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
  useRecoilCallback,
  useResetRecoilState,
} from 'recoil';
import type {
  TPreset,
  TSubmission,
  TModelsConfig,
  TConversation,
  TEndpointsConfig,
} from 'librechat-data-provider';
import {
  getEndpointField,
  buildDefaultConvo,
  getDefaultEndpoint,
  getDefaultModelSpec,
  getModelSpecIconURL,
  updateLastSelectedModel,
} from '~/utils';
import { useDeleteFilesMutation, useListAssistantsQuery } from '~/data-provider';
import useOriginNavigate from './useOriginNavigate';
import { mainTextareaId } from '~/common';
import store from '~/store';

const useNewConvo = (index = 0) => {
  const navigate = useOriginNavigate();
  const { data: startupConfig } = useGetStartupConfig();
  const defaultPreset = useRecoilValue(store.defaultPreset);
  const { setConversation } = store.useCreateConversationAtom(index);
  const [files, setFiles] = useRecoilState(store.filesByIndex(index));
  const setSubmission = useSetRecoilState<TSubmission | null>(store.submissionByIndex(index));
  const resetLatestMessage = useResetRecoilState(store.latestMessageFamily(index));
  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();
  const modelsQuery = useGetModelsQuery();
  const timeoutIdRef = useRef<NodeJS.Timeout>();

  const { data: assistants = [] } = useListAssistantsQuery(defaultOrderQuery, {
    select: (res) =>
      res.data.map(({ id, name, metadata, model }) => ({ id, name, metadata, model })),
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
    () =>
      async (
        conversation: TConversation,
        preset: Partial<TPreset> | null = null,
        modelsData?: TModelsConfig,
        buildDefault?: boolean,
        keepLatestMessage?: boolean,
      ) => {
        const modelsConfig = modelsData ?? modelsQuery.data;
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

          const isAssistantEndpoint = defaultEndpoint === EModelEndpoint.assistants;

          if (!conversation.assistant_id && isAssistantEndpoint) {
            conversation.assistant_id =
              localStorage.getItem(`${LocalStorageKeys.ASST_ID_PREFIX}${index}`) ??
              assistants[0]?.id;
          }

          if (
            conversation.assistant_id &&
            isAssistantEndpoint &&
            conversation.conversationId === 'new'
          ) {
            const assistant = assistants.find((asst) => asst.id === conversation.assistant_id);
            conversation.model = assistant?.model;
            updateLastSelectedModel({
              endpoint: EModelEndpoint.assistants,
              model: conversation.model,
            });
          }

          if (conversation.assistant_id && !isAssistantEndpoint) {
            conversation.assistant_id = undefined;
          }

          const models = modelsConfig?.[defaultEndpoint] ?? [];
          conversation = buildDefaultConvo({
            conversation,
            lastConversationSetup: activePreset as TConversation,
            endpoint: defaultEndpoint,
            models,
          });
        }

        setConversation(conversation);
        setSubmission({} as TSubmission);
        if (!keepLatestMessage) {
          resetLatestMessage();
        }

        if (conversation.conversationId === 'new' && !modelsData) {
          const appTitle = localStorage.getItem(LocalStorageKeys.APP_TITLE);
          if (appTitle) {
            document.title = appTitle;
          }
          navigate('new');
        }

        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = setTimeout(() => {
          const textarea = document.getElementById(mainTextareaId);
          if (textarea) {
            textarea.focus();
          }
        }, 150);
      },
    [endpointsConfig, defaultPreset, assistants, modelsQuery.data],
  );

  const newConversation = useCallback(
    ({
      template = {},
      preset: _preset,
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

      let preset = _preset;
      const defaultModelSpec = getDefaultModelSpec(startupConfig?.modelSpecs?.list);
      if (!preset && startupConfig && startupConfig.modelSpecs?.prioritize && defaultModelSpec) {
        preset = {
          ...defaultModelSpec.preset,
          iconURL: getModelSpecIconURL(defaultModelSpec),
          spec: defaultModelSpec.name,
        } as TConversation;
      }

      if (conversation.conversationId === 'new' && !modelsData) {
        const filesToDelete = Array.from(files.values())
          .filter((file) => file.filepath && file.source && !file.embedded && file.temp_file_id)
          .map((file) => ({
            file_id: file.file_id,
            embedded: !!file.embedded,
            filepath: file.filepath as string,
            source: file.source as FileSources, // Ensure that the source is of type FileSources
          }));

        setFiles(new Map());
        localStorage.setItem(LocalStorageKeys.FILES_TO_DELETE, JSON.stringify({}));

        if (filesToDelete.length > 0) {
          mutateAsync({ files: filesToDelete });
        }
      }

      switchToConversation(conversation, preset, modelsData, buildDefault, keepLatestMessage);
    },
    [switchToConversation, files, mutateAsync, setFiles, startupConfig],
  );

  return {
    switchToConversation,
    newConversation,
  };
};

export default useNewConvo;
