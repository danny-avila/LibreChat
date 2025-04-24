import { useEffect, useCallback, useRef } from 'react';
import { useRecoilValue } from 'recoil';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  QueryKeys,
  EModelEndpoint,
  isAgentsEndpoint,
  tQueryParamsSchema,
  isAssistantsEndpoint,
} from 'librechat-data-provider';
import type { TPreset, TEndpointsConfig, TStartupConfig } from 'librechat-data-provider';
import type { ZodAny } from 'zod';
import { getConvoSwitchLogic, getModelSpecIconURL, removeUnavailableTools, logger } from '~/utils';
import useDefaultConvo from '~/hooks/Conversations/useDefaultConvo';
import { useChatContext, useChatFormContext } from '~/Providers';
import useSubmitMessage from '~/hooks/Messages/useSubmitMessage';
import store from '~/store';

const parseQueryValue = (value: string) => {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (!isNaN(Number(value))) {
    return Number(value);
  }
  return value;
};

const processValidSettings = (queryParams: Record<string, string>) => {
  const validSettings = {} as TPreset;

  Object.entries(queryParams).forEach(([key, value]) => {
    try {
      const schema = tQueryParamsSchema.shape[key] as ZodAny | undefined;
      if (schema) {
        const parsedValue = parseQueryValue(value);
        const validValue = schema.parse(parsedValue);
        validSettings[key] = validValue;
      }
    } catch (error) {
      console.warn(`Invalid value for setting ${key}:`, error);
    }
  });

  if (
    validSettings.assistant_id != null &&
    validSettings.assistant_id &&
    !isAssistantsEndpoint(validSettings.endpoint)
  ) {
    validSettings.endpoint = EModelEndpoint.assistants;
  }
  if (
    validSettings.agent_id != null &&
    validSettings.agent_id &&
    !isAgentsEndpoint(validSettings.endpoint)
  ) {
    validSettings.endpoint = EModelEndpoint.agents;
  }

  return validSettings;
};

export default function useQueryParams({
  textAreaRef,
}: {
  textAreaRef: React.RefObject<HTMLTextAreaElement>;
}) {
  const maxAttempts = 50;
  const attemptsRef = useRef(0);
  const processedRef = useRef(false);
  const methods = useChatFormContext();
  const [searchParams] = useSearchParams();
  const getDefaultConversation = useDefaultConvo();
  const modularChat = useRecoilValue(store.modularChat);
  const availableTools = useRecoilValue(store.availableTools);
  const { submitMessage } = useSubmitMessage();

  const queryClient = useQueryClient();
  const { conversation, newConversation } = useChatContext();

  const newQueryConvo = useCallback(
    (_newPreset?: TPreset) => {
      if (!_newPreset) {
        return;
      }
      let newPreset = removeUnavailableTools(_newPreset, availableTools);
      if (newPreset.spec != null && newPreset.spec !== '') {
        const startupConfig = queryClient.getQueryData<TStartupConfig>([QueryKeys.startupConfig]);
        const modelSpecs = startupConfig?.modelSpecs?.list ?? [];
        const spec = modelSpecs.find((s) => s.name === newPreset.spec);
        if (!spec) {
          return;
        }
        const { preset } = spec;
        preset.iconURL = getModelSpecIconURL(spec);
        preset.spec = spec.name;
        newPreset = preset;
      }

      let newEndpoint = newPreset.endpoint ?? '';
      const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);

      if (newEndpoint && endpointsConfig && !endpointsConfig[newEndpoint]) {
        const normalizedNewEndpoint = newEndpoint.toLowerCase();
        for (const [key, value] of Object.entries(endpointsConfig)) {
          if (
            value &&
            value.type === EModelEndpoint.custom &&
            key.toLowerCase() === normalizedNewEndpoint
          ) {
            newEndpoint = key;
            newPreset.endpoint = key;
            newPreset.endpointType = EModelEndpoint.custom;
            break;
          }
        }
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

      let resetParams = {};
      if (newPreset.spec == null) {
        template.spec = null;
        template.iconURL = null;
        template.modelLabel = null;
        resetParams = { spec: null, iconURL: null, modelLabel: null };
        newPreset = { ...newPreset, ...resetParams };
      }

      const isModular = isCurrentModular && isNewModular && shouldSwitch;
      if (isExistingConversation && isModular) {
        template.endpointType = newEndpointType as EModelEndpoint | undefined;

        const currentConvo = getDefaultConversation({
          /* target endpointType is necessary to avoid endpoint mixing */
          conversation: {
            ...(conversation ?? {}),
            endpointType: template.endpointType,
            ...resetParams,
          },
          preset: template,
          cleanOutput: newPreset.spec != null && newPreset.spec !== '',
        });

        /* We don't reset the latest message, only when changing settings mid-converstion */
        logger.log('conversation', 'Switching conversation from query params', currentConvo);
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
      queryClient,
      modularChat,
      conversation,
      availableTools,
      newConversation,
      getDefaultConversation,
    ],
  );

  useEffect(() => {
    const processQueryParams = () => {
      const queryParams: Record<string, string> = {};
      searchParams.forEach((value, key) => {
        queryParams[key] = value;
      });

      // Support both 'prompt' and 'q' as query parameters, with 'prompt' taking precedence
      const decodedPrompt = queryParams.prompt || queryParams.q || '';
      const shouldAutoSubmit = queryParams.submit?.toLowerCase() === 'true';
      delete queryParams.prompt;
      delete queryParams.q;
      delete queryParams.submit;
      const validSettings = processValidSettings(queryParams);

      return { decodedPrompt, validSettings, shouldAutoSubmit };
    };

    const intervalId = setInterval(() => {
      if (processedRef.current || attemptsRef.current >= maxAttempts) {
        clearInterval(intervalId);
        if (attemptsRef.current >= maxAttempts) {
          console.warn('Max attempts reached, failed to process parameters');
        }
        return;
      }

      attemptsRef.current += 1;

      if (!textAreaRef.current) {
        return;
      }
      const startupConfig = queryClient.getQueryData<TStartupConfig>([QueryKeys.startupConfig]);
      if (!startupConfig) {
        return;
      }
      const { decodedPrompt, validSettings, shouldAutoSubmit } = processQueryParams();
      const currentText = methods.getValues('text');

      /** Clean up URL parameters after successful processing */
      const success = () => {
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
        processedRef.current = true;
        console.log('Parameters processed successfully');
        clearInterval(intervalId);
      };

      if (!currentText && decodedPrompt) {
        methods.setValue('text', decodedPrompt, { shouldValidate: true });
        textAreaRef.current.focus();
        textAreaRef.current.setSelectionRange(decodedPrompt.length, decodedPrompt.length);

        // Auto-submit if the submit parameter is true
        if (shouldAutoSubmit) {
          methods.handleSubmit((data) => {
            if (data.text?.trim()) {
              submitMessage(data);
            }
          })();
        }
      }

      if (Object.keys(validSettings).length > 0) {
        newQueryConvo(validSettings);
      }

      success();
    }, 100);

    return () => {
      clearInterval(intervalId);
    };
  }, [searchParams, methods, textAreaRef, newQueryConvo, newConversation, submitMessage]);
}
