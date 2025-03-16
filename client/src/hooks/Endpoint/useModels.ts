import { useCallback } from 'react';
import { EModelEndpoint, LocalStorageKeys } from 'librechat-data-provider';
import { getConvoSwitchLogic } from '~/utils';
import { mainTextareaId } from '~/common';

export const useModelSelection = (
  conversation: any,
  setOption: any,
  index: number,
  getDefaultConversation: any,
  newConversation: any,
  endpointsConfig: any,
  modularChat: boolean,
  assistantsMap: any,
  timeoutIdRef: React.MutableRefObject<NodeJS.Timeout | undefined>,
) => {
  const setAgentId = useCallback(
    (agentId: string) => {
      setOption('agent_id')(agentId);
      localStorage.setItem(`${LocalStorageKeys.AGENT_ID_PREFIX}${index}`, agentId);
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = setTimeout(() => {
        const textarea = document.getElementById(mainTextareaId);
        if (textarea) {
          textarea.focus();
        }
      }, 150);
    },
    [setOption, index, timeoutIdRef],
  );

  const setAssistantId = useCallback(
    (endpoint: string, assistantId: string) => {
      const assistant = assistantsMap[endpoint]?.[assistantId];
      if (assistant) {
        setOption('model')(assistant.model);
        setOption('assistant_id')(assistantId);
        localStorage.setItem(`${LocalStorageKeys.ASST_ID_PREFIX}${index}${endpoint}`, assistantId);
      }
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = setTimeout(() => {
        const textarea = document.getElementById(mainTextareaId);
        if (textarea) {
          textarea.focus();
        }
      }, 150);
    },
    [setOption, index, assistantsMap, timeoutIdRef],
  );

  const setModel = useCallback(
    (model: string) => {
      setOption('model')(model);
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = setTimeout(() => {
        const textarea = document.getElementById(mainTextareaId);
        if (textarea) {
          textarea.focus();
        }
      }, 150);
    },
    [setOption, timeoutIdRef],
  );

  const handleModelSelect = useCallback(
    (ep: EModelEndpoint, selectedModel: string) => {
      if (ep === EModelEndpoint.assistants) {
        if (conversation?.endpoint === ep) {
          setAssistantId(ep, selectedModel);
          return;
        }

        const { template } = getConvoSwitchLogic({
          newEndpoint: ep,
          modularChat: false,
          conversation,
          endpointsConfig,
        });

        const assistant = assistantsMap[ep]?.[selectedModel];

        const currentConvo = getDefaultConversation({
          conversation: {
            ...conversation,
            endpoint: ep,
            assistant_id: selectedModel,
            model: assistant?.model || '',
          },
          preset: {
            ...template,
            endpoint: ep,
            assistant_id: selectedModel,
            model: assistant?.model || '',
          },
        });

        newConversation({
          template: currentConvo,
          preset: currentConvo,
          keepLatestMessage: true,
        });
        return;
      }

      if (ep === EModelEndpoint.agents) {
        if (conversation?.endpoint === ep) {
          setAgentId(selectedModel);
          return;
        }

        const { template } = getConvoSwitchLogic({
          newEndpoint: ep,
          modularChat: false,
          conversation,
          endpointsConfig,
        });

        const currentConvo = getDefaultConversation({
          conversation: { ...conversation, endpoint: ep, agent_id: selectedModel },
          preset: { ...template, endpoint: ep, agent_id: selectedModel },
        });

        newConversation({
          template: currentConvo,
          preset: currentConvo,
          keepLatestMessage: true,
        });
        return;
      }

      const {
        template,
        shouldSwitch,
        isNewModular,
        newEndpointType,
        isCurrentModular,
        isExistingConversation,
      } = getConvoSwitchLogic({
        newEndpoint: ep,
        modularChat,
        conversation,
        endpointsConfig,
      });

      const isModular = isCurrentModular && isNewModular && shouldSwitch;

      if (isExistingConversation && isModular) {
        template.endpointType = newEndpointType;

        const currentConvo = getDefaultConversation({
          conversation: { ...(conversation ?? {}), endpointType: template.endpointType },
          preset: template,
        });

        newConversation({
          template: currentConvo,
          preset: currentConvo,
          keepLatestMessage: true,
          keepAddedConvos: true,
        });
        return;
      }
      newConversation({
        template: { ...(template as any) },
        keepAddedConvos: isModular,
      });

      setModel(selectedModel);
    },
    [
      conversation,
      endpointsConfig,
      modularChat,
      newConversation,
      getDefaultConversation,
      setModel,
      setAgentId,
      setAssistantId,
      assistantsMap,
    ],
  );

  const handleEndpointSelect = useCallback(
    (ep: string, hasModels: boolean, agents: any[], assistants: any[], modelsData: any) => {
      if (hasModels) {
        if (conversation?.endpoint !== ep) {
          const newEndpoint = ep as EModelEndpoint;
          const { template } = getConvoSwitchLogic({
            newEndpoint,
            modularChat: false,
            conversation,
            endpointsConfig,
          });

          let initialModel = '';
          let initialAgentId = '';
          let initialAssistantId = '';

          if (newEndpoint === EModelEndpoint.agents && agents.length > 0) {
            initialAgentId = agents[0].id;
          } else if (newEndpoint === EModelEndpoint.assistants && assistants.length > 0) {
            initialAssistantId = assistants[0].id;
            initialModel = assistantsMap[newEndpoint]?.[initialAssistantId]?.model || '';
          } else if (modelsData && modelsData[newEndpoint] && modelsData[newEndpoint].length > 0) {
            initialModel = modelsData[newEndpoint][0];
          }

          const currentConvo = getDefaultConversation({
            conversation: {
              ...conversation,
              endpoint: newEndpoint,
              model: initialModel,
              agent_id: initialAgentId,
              assistant_id: initialAssistantId,
            },
            preset: {
              ...template,
              endpoint: newEndpoint,
              model: initialModel,
              agent_id: initialAgentId,
              assistant_id: initialAssistantId,
            },
          });

          newConversation({
            template: currentConvo,
            preset: currentConvo,
            keepLatestMessage: true,
          });
        }
        return;
      }

      if (!hasModels) {
        const newEndpoint = ep as EModelEndpoint;
        const { template } = getConvoSwitchLogic({
          newEndpoint,
          modularChat: false,
          conversation,
          endpointsConfig,
        });
        const currentConvo = getDefaultConversation({
          conversation: { ...conversation, endpoint: newEndpoint },
          preset: { ...template, endpoint: newEndpoint },
        });
        newConversation({
          template: currentConvo,
          preset: currentConvo,
          keepLatestMessage: true,
        });
      }
    },
    [
      conversation,
      endpointsConfig,
      newConversation,
      getDefaultConversation,
      assistantsMap,
      modularChat,
    ],
  );

  return {
    handleModelSelect,
    handleEndpointSelect,
    setAgentId,
    setAssistantId,
    setModel,
  };
};

export default useModelSelection;
