import { useCallback, useRef } from 'react';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Constants,
  FileSources,
  EModelEndpoint,
  isParamEndpoint,
  LocalStorageKeys,
  isAssistantsEndpoint,
} from 'librechat-data-provider';
import { useRecoilState, useRecoilValue, useSetRecoilState, useRecoilCallback } from 'recoil';
import type {
  TPreset,
  TSubmission,
  TModelsConfig,
  TConversation,
  TEndpointsConfig,
} from 'librechat-data-provider';
import type { AssistantListItem } from '~/common';
import {
  getEndpointField,
  buildDefaultConvo,
  getDefaultEndpoint,
  getModelSpecPreset,
  getDefaultModelSpec,
  updateLastSelectedModel,
} from '~/utils';
import { useDeleteFilesMutation, useGetEndpointsQuery, useGetStartupConfig } from '~/data-provider';
import useAssistantListMap from './Assistants/useAssistantListMap';
import { useResetChatBadges } from './useChatBadges';
import { usePauseGlobalAudio } from './Audio';
import { mainTextareaId } from '~/common';
import { logger } from '~/utils';
import store from '~/store';

const useNewConvo = (index = 0) => {
  const navigate = useNavigate();
  const { data: startupConfig } = useGetStartupConfig();
  const clearAllConversations = store.useClearConvoState();
  const defaultPreset = useRecoilValue(store.defaultPreset);
  const { setConversation } = store.useCreateConversationAtom(index);
  const [files, setFiles] = useRecoilState(store.filesByIndex(index));
  const saveBadgesState = useRecoilValue<boolean>(store.saveBadgesState);
  const clearAllLatestMessages = store.useClearLatestMessages(`useNewConvo ${index}`);
  const setSubmission = useSetRecoilState<TSubmission | null>(store.submissionByIndex(index));
  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();

  const modelsQuery = useGetModelsQuery();
  const timeoutIdRef = useRef<NodeJS.Timeout>();
  const assistantsListMap = useAssistantListMap();
  const { pauseGlobalAudio } = usePauseGlobalAudio(index);
  const saveDrafts = useRecoilValue<boolean>(store.saveDrafts);
  const resetBadges = useResetChatBadges();

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
        keepAddedConvos?: boolean,
        disableFocus?: boolean,
      ) => {
        const modelsConfig = modelsData ?? modelsQuery.data;
        const { endpoint = null } = conversation;
        const buildDefaultConversation = (endpoint === null || buildDefault) ?? false;
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
          let defaultEndpoint = getDefaultEndpoint({
            convoSetup: activePreset ?? conversation,
            endpointsConfig,
          });

          if (!defaultEndpoint) {
            defaultEndpoint = Object.keys(endpointsConfig ?? {})[0] as EModelEndpoint;
          }

          const endpointType = getEndpointField(endpointsConfig, defaultEndpoint, 'type');
          if (!conversation.endpointType && endpointType) {
            conversation.endpointType = endpointType;
          } else if (conversation.endpointType && !endpointType) {
            conversation.endpointType = undefined;
          }

          const isAssistantEndpoint = isAssistantsEndpoint(defaultEndpoint);
          const assistants: AssistantListItem[] = assistantsListMap[defaultEndpoint] ?? [];
          const currentAssistantId = conversation.assistant_id ?? '';
          const currentAssistant = assistantsListMap[defaultEndpoint]?.[currentAssistantId] as
            | AssistantListItem
            | undefined;

          if (currentAssistantId && !currentAssistant) {
            conversation.assistant_id = undefined;
          }

          if (!currentAssistantId && isAssistantEndpoint) {
            conversation.assistant_id =
              localStorage.getItem(
                `${LocalStorageKeys.ASST_ID_PREFIX}${index}${defaultEndpoint}`,
              ) ?? assistants[0]?.id;
          }

          if (
            currentAssistantId &&
            isAssistantEndpoint &&
            conversation.conversationId === Constants.NEW_CONVO
          ) {
            const assistant = assistants.find((asst) => asst.id === currentAssistantId);
            conversation.model = assistant?.model;
            updateLastSelectedModel({
              endpoint: defaultEndpoint,
              model: conversation.model,
            });
          }

          if (currentAssistantId && !isAssistantEndpoint) {
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

        if (!(keepAddedConvos ?? false)) {
          clearAllConversations(true);
        }
        logger.log('conversation', 'Setting conversation from `useNewConvo`', conversation);
        setConversation(conversation);
        setSubmission({} as TSubmission);
        if (!(keepLatestMessage ?? false)) {
          clearAllLatestMessages();
        }

        if (conversation.conversationId === Constants.NEW_CONVO && !modelsData) {
          const appTitle = localStorage.getItem(LocalStorageKeys.APP_TITLE) ?? '';
          if (appTitle) {
            document.title = appTitle;
          }
          navigate(`/c/${Constants.NEW_CONVO}`);
        }

        clearTimeout(timeoutIdRef.current);
        if (disableFocus === true) {
          return;
        }
        timeoutIdRef.current = setTimeout(() => {
          const textarea = document.getElementById(mainTextareaId);
          if (textarea) {
            textarea.focus();
          }
        }, 150);
      },
    [endpointsConfig, defaultPreset, assistantsListMap, modelsQuery.data],
  );

  const newConversation = useCallback(
    function createNewConvo({
      template: _template = {},
      preset: _preset,
      modelsData,
      disableFocus,
      buildDefault = true,
      keepLatestMessage = false,
      keepAddedConvos = false,
    }: {
      template?: Partial<TConversation>;
      preset?: Partial<TPreset>;
      modelsData?: TModelsConfig;
      buildDefault?: boolean;
      disableFocus?: boolean;
      keepLatestMessage?: boolean;
      keepAddedConvos?: boolean;
    } = {}) {
      pauseGlobalAudio();
      if (!saveBadgesState) {
        resetBadges();
      }

      const templateConvoId = _template.conversationId ?? '';
      const paramEndpoint =
        isParamEndpoint(_template.endpoint ?? '', _template.endpointType ?? '') === true ||
        isParamEndpoint(_preset?.endpoint ?? '', _preset?.endpointType ?? '');
      const template =
        paramEndpoint === true && templateConvoId && templateConvoId === Constants.NEW_CONVO
          ? { endpoint: _template.endpoint }
          : _template;

      const conversation = {
        conversationId: Constants.NEW_CONVO as string,
        title: 'New Chat',
        endpoint: null,
        ...template,
        createdAt: '',
        updatedAt: '',
      };

      let preset = _preset;
      const defaultModelSpec = getDefaultModelSpec(startupConfig);
      if (
        !preset &&
        startupConfig &&
        (startupConfig.modelSpecs?.prioritize === true ||
          (startupConfig.interface?.modelSelect ?? true) !== true) &&
        defaultModelSpec
      ) {
        preset = getModelSpecPreset(defaultModelSpec);
      }

      if (conversation.conversationId === 'new' && !modelsData) {
        const filesToDelete = Array.from(files.values())
          .filter(
            (file) =>
              file.filepath != null &&
              file.filepath !== '' &&
              file.source &&
              !(file.embedded ?? false) &&
              file.temp_file_id,
          )
          .map((file) => ({
            file_id: file.file_id,
            embedded: !!(file.embedded ?? false),
            filepath: file.filepath as string,
            source: file.source as FileSources, // Ensure that the source is of type FileSources
          }));

        setFiles(new Map());
        localStorage.setItem(LocalStorageKeys.FILES_TO_DELETE, JSON.stringify({}));

        if (!saveDrafts && filesToDelete.length > 0) {
          mutateAsync({ files: filesToDelete });
        }
      }

      switchToConversation(
        conversation,
        preset,
        modelsData,
        buildDefault,
        keepLatestMessage,
        keepAddedConvos,
        disableFocus,
      );
    },
    [
      pauseGlobalAudio,
      startupConfig,
      saveDrafts,
      switchToConversation,
      files,
      setFiles,
      mutateAsync,
      resetBadges,
    ],
  );

  return {
    switchToConversation,
    newConversation,
  };
};

export default useNewConvo;
