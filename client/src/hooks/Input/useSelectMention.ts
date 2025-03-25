import { useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { EModelEndpoint, isAgentsEndpoint, isAssistantsEndpoint } from 'librechat-data-provider';
import type {
  TPreset,
  TModelSpec,
  TConversation,
  TAssistantsMap,
  TEndpointsConfig,
} from 'librechat-data-provider';
import type { MentionOption, ConvoGenerator } from '~/common';
import { getConvoSwitchLogic, getModelSpecIconURL, removeUnavailableTools } from '~/utils';
import { useChatContext } from '~/Providers';
import { useDefaultConvo } from '~/hooks';
import store from '~/store';

export default function useSelectMention({
  presets,
  modelSpecs,
  assistantMap,
  endpointsConfig,
  newConversation,
  returnHandlers,
}: {
  presets?: TPreset[];
  modelSpecs: TModelSpec[];
  assistantMap?: TAssistantsMap;
  newConversation: ConvoGenerator;
  endpointsConfig: TEndpointsConfig;
  returnHandlers?: boolean;
}) {
  const { conversation } = useChatContext();
  const getDefaultConversation = useDefaultConvo();
  const modularChat = useRecoilValue(store.modularChat);
  const availableTools = useRecoilValue(store.availableTools);

  const onSelectSpec = useCallback(
    (spec?: TModelSpec) => {
      if (!spec) {
        return;
      }
      const { preset } = spec;
      preset.iconURL = getModelSpecIconURL(spec);
      preset.spec = spec.name;
      const { endpoint } = preset;
      const newEndpoint = endpoint ?? '';
      if (!newEndpoint) {
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
        newEndpoint,
        modularChat,
        conversation,
        endpointsConfig,
      });

      if (newEndpointType) {
        preset.endpointType = newEndpointType;
      }

      if (
        isAssistantsEndpoint(newEndpoint) &&
        preset.assistant_id != null &&
        !(preset.model ?? '')
      ) {
        preset.model = assistantMap?.[newEndpoint]?.[preset.assistant_id]?.model;
      }

      const isModular = isCurrentModular && isNewModular && shouldSwitch;
      if (isExistingConversation && isModular) {
        template.endpointType = newEndpointType as EModelEndpoint | undefined;

        const currentConvo = getDefaultConversation({
          /* target endpointType is necessary to avoid endpoint mixing */
          conversation: { ...(conversation ?? {}), endpointType: template.endpointType },
          preset: template,
        });

        /* We don't reset the latest message, only when changing settings mid-converstion */
        newConversation({
          template: currentConvo,
          preset,
          keepLatestMessage: true,
          keepAddedConvos: true,
        });
        return;
      }

      newConversation({
        template: { ...(template as Partial<TConversation>) },
        preset,
        keepAddedConvos: isModular,
      });
    },
    [
      conversation,
      getDefaultConversation,
      modularChat,
      newConversation,
      endpointsConfig,
      assistantMap,
    ],
  );

  type Kwargs = {
    model?: string;
    agent_id?: string;
    assistant_id?: string;
    spec?: string | null;
  };

  const onSelectEndpoint = useCallback(
    (_newEndpoint?: EModelEndpoint | string | null, kwargs: Kwargs = {}) => {
      const newEndpoint = _newEndpoint ?? '';
      if (!newEndpoint) {
        return;
      }

      const {
        shouldSwitch,
        isNewModular,
        isCurrentModular,
        isExistingConversation,
        newEndpointType,
        template,
      } = getConvoSwitchLogic({
        newEndpoint,
        modularChat,
        conversation,
        endpointsConfig,
      });

      const model = kwargs.model ?? '';
      if (model) {
        template.model = model;
      }

      const assistant_id = kwargs.assistant_id ?? '';
      if (assistant_id) {
        template.assistant_id = assistant_id;
      }
      const agent_id = kwargs.agent_id ?? '';
      if (agent_id) {
        template.agent_id = agent_id;
      }

      template.spec = null;
      template.iconURL = null;
      template.modelLabel = null;
      if (isExistingConversation && isCurrentModular && isNewModular && shouldSwitch) {
        template.endpointType = newEndpointType;

        const currentConvo = getDefaultConversation({
          /* target endpointType is necessary to avoid endpoint mixing */
          conversation: {
            ...(conversation ?? {}),
            spec: null,
            iconURL: null,
            modelLabel: null,
            endpointType: template.endpointType,
          },
          preset: template,
        });

        /* We don't reset the latest message, only when changing settings mid-converstion */
        newConversation({ template: currentConvo, preset: currentConvo, keepLatestMessage: true });
        return;
      }

      newConversation({
        template: { ...(template as Partial<TConversation>) },
        preset: { ...kwargs, spec: null, iconURL: null, modelLabel: null, endpoint: newEndpoint },
      });
    },
    [conversation, getDefaultConversation, modularChat, newConversation, endpointsConfig],
  );

  const onSelectPreset = useCallback(
    (_newPreset?: TPreset) => {
      if (!_newPreset) {
        return;
      }

      const newPreset = removeUnavailableTools(_newPreset, availableTools);
      const newEndpoint = newPreset.endpoint ?? '';

      const {
        template,
        shouldSwitch,
        isNewModular,
        newEndpointType,
        isCurrentModular,
        isExistingConversation,
      } = getConvoSwitchLogic({
        newEndpoint,
        modularChat,
        conversation,
        endpointsConfig,
      });

      newPreset.spec = null;
      newPreset.iconURL = newPreset.iconURL ?? null;
      newPreset.modelLabel = newPreset.modelLabel ?? null;
      const isModular = isCurrentModular && isNewModular && shouldSwitch;
      if (isExistingConversation && isModular) {
        template.endpointType = newEndpointType as EModelEndpoint | undefined;
        template.spec = null;
        template.iconURL = null;
        template.modelLabel = null;
        const currentConvo = getDefaultConversation({
          /* target endpointType is necessary to avoid endpoint mixing */
          conversation: { ...(conversation ?? {}), endpointType: template.endpointType },
          preset: template,
        });

        /* We don't reset the latest message, only when changing settings mid-converstion */
        newConversation({
          template: currentConvo,
          preset: newPreset,
          keepLatestMessage: true,
          keepAddedConvos: true,
        });
        return;
      }

      newConversation({ preset: newPreset, keepAddedConvos: true });
    },
    [
      modularChat,
      conversation,
      availableTools,
      newConversation,
      endpointsConfig,
      getDefaultConversation,
    ],
  );

  const onSelectMention = useCallback(
    (option: MentionOption) => {
      const key = option.value;
      if (option.type === 'preset') {
        const preset = presets?.find((p) => p.presetId === key);
        onSelectPreset(preset);
      } else if (option.type === 'modelSpec') {
        const modelSpec = modelSpecs.find((spec) => spec.name === key);
        onSelectSpec(modelSpec);
      } else if (option.type === 'model') {
        onSelectEndpoint(key, { model: option.label });
      } else if (option.type === 'endpoint') {
        onSelectEndpoint(key);
      } else if (isAssistantsEndpoint(option.type)) {
        onSelectEndpoint(option.type, {
          assistant_id: key,
          model: assistantMap?.[option.type]?.[key]?.model ?? '',
        });
      } else if (isAgentsEndpoint(option.type)) {
        onSelectEndpoint(option.type, {
          agent_id: key,
        });
      }
    },
    [modelSpecs, onSelectEndpoint, onSelectPreset, onSelectSpec, presets, assistantMap],
  );

  if (returnHandlers) {
    return {
      onSelectSpec,
      onSelectEndpoint,
    };
  }

  return {
    onSelectMention,
  };
}
