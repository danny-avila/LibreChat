import { useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TModelSpec, TConversation, TEndpointsConfig, TPreset } from 'librechat-data-provider';
import type { MentionOption } from '~/common';
import { getConvoSwitchLogic, getModelSpecIconURL, removeUnavailableTools } from '~/utils';
import { useDefaultConvo, useNewConvo } from '~/hooks';
import { useChatContext } from '~/Providers';
import store from '~/store';

export default function useSelectMention({
  modelSpecs,
  endpointsConfig,
  presets,
}: {
  presets?: TPreset[];
  modelSpecs: TModelSpec[];
  endpointsConfig: TEndpointsConfig;
}) {
  const { conversation } = useChatContext();
  const { newConversation } = useNewConvo();
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
      const { endpoint: newEndpoint } = preset;
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

      if (isExistingConversation && isCurrentModular && isNewModular && shouldSwitch) {
        template.endpointType = newEndpointType as EModelEndpoint | undefined;

        const currentConvo = getDefaultConversation({
          /* target endpointType is necessary to avoid endpoint mixing */
          conversation: { ...(conversation ?? {}), endpointType: template.endpointType },
          preset: template,
        });

        /* We don't reset the latest message, only when changing settings mid-converstion */
        newConversation({ template: currentConvo, preset, keepLatestMessage: true });
        return;
      }

      newConversation({ template: { ...(template as Partial<TConversation>) }, preset });
    },
    [conversation, getDefaultConversation, modularChat, newConversation, endpointsConfig],
  );

  const onSelectEndpoint = useCallback(
    (newEndpoint?: EModelEndpoint | string | null, model?: string) => {
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

      if (model) {
        template.model = model;
      }

      if (isExistingConversation && isCurrentModular && isNewModular && shouldSwitch) {
        template.endpointType = newEndpointType;

        const currentConvo = getDefaultConversation({
          /* target endpointType is necessary to avoid endpoint mixing */
          conversation: { ...(conversation ?? {}), endpointType: template.endpointType },
          preset: template,
        });

        /* We don't reset the latest message, only when changing settings mid-converstion */
        newConversation({ template: currentConvo, preset: template, keepLatestMessage: true });
        return;
      }
      newConversation({ template: { ...(template as Partial<TConversation>) }, preset: template });
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

      // const toastTitle = newPreset.title
      //   ? `"${newPreset.title}"`
      //   : localize('com_endpoint_preset_title');

      // showToast({
      //   message: `${toastTitle} ${localize('com_endpoint_preset_selected_title')}`,
      //   showIcon: false,
      //   duration: 750,
      // });

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

      if (isExistingConversation && isCurrentModular && isNewModular && shouldSwitch) {
        template.endpointType = newEndpointType as EModelEndpoint | undefined;

        const currentConvo = getDefaultConversation({
          /* target endpointType is necessary to avoid endpoint mixing */
          conversation: { ...(conversation ?? {}), endpointType: template.endpointType },
          preset: template,
        });

        /* We don't reset the latest message, only when changing settings mid-converstion */
        newConversation({ template: currentConvo, preset: newPreset, keepLatestMessage: true });
        return;
      }

      newConversation({ template: { ...(template as Partial<TConversation>) }, preset: newPreset });
    },
    [
      availableTools,
      conversation,
      getDefaultConversation,
      modularChat,
      newConversation,
      endpointsConfig,
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
        onSelectEndpoint(key, option.label);
      } else if (option.type === 'endpoint') {
        onSelectEndpoint(key);
      }
    },
    [modelSpecs, onSelectEndpoint, onSelectPreset, onSelectSpec, presets],
  );

  return {
    onSelectMention,
  };
}
