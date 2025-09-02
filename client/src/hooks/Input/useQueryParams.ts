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

/**
 * Parses query parameter values, converting strings to their appropriate types.
 * Handles boolean strings, numbers, and preserves regular strings.
 */
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

/**
 * Processes and validates URL query parameters using schema definitions.
 * Extracts valid settings based on tQueryParamsSchema and handles special endpoint cases
 * for assistants and agents.
 */
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

/**
 * Hook that processes URL query parameters to initialize chat with specified settings and prompt.
 * Handles model switching, prompt auto-filling, and optional auto-submission with race condition protection.
 * Supports immediate or deferred submission based on whether settings need to be applied first.
 */
export default function useQueryParams({
  textAreaRef,
}: {
  textAreaRef: React.RefObject<HTMLTextAreaElement>;
}) {
  const maxAttempts = 50;
  const attemptsRef = useRef(0);
  const MAX_SETTINGS_WAIT_MS = 3000;
  const processedRef = useRef(false);
  const pendingSubmitRef = useRef(false);
  const settingsAppliedRef = useRef(false);
  const submissionHandledRef = useRef(false);
  const promptTextRef = useRef<string | null>(null);
  const validSettingsRef = useRef<TPreset | null>(null);
  const settingsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const methods = useChatFormContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const getDefaultConversation = useDefaultConvo();
  const modularChat = useRecoilValue(store.modularChat);
  const availableTools = useRecoilValue(store.availableTools);
  const { submitMessage } = useSubmitMessage();

  const queryClient = useQueryClient();
  const { conversation, newConversation } = useChatContext();

  /**
   * Applies settings from URL query parameters to create a new conversation.
   * Handles model spec lookup, endpoint normalization, and conversation switching logic.
   * Ensures tools compatibility and preserves existing conversation when appropriate.
   */
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

  /**
   * Checks if all settings from URL parameters have been successfully applied to the conversation.
   * Compares values from validSettings against the current conversation state, handling special properties.
   * Returns true only when all relevant settings match the target values.
   */
  const areSettingsApplied = useCallback(() => {
    if (!validSettingsRef.current || !conversation) {
      return false;
    }

    for (const [key, value] of Object.entries(validSettingsRef.current)) {
      if (['presetOverride', 'iconURL', 'spec', 'modelLabel'].includes(key)) {
        continue;
      }

      if (conversation[key] !== value) {
        return false;
      }
    }

    return true;
  }, [conversation]);

  /**
   * Processes message submission exactly once, preventing duplicate submissions.
   * Sets the prompt text, submits the message, and cleans up URL parameters afterward.
   * Has internal guards to ensure it only executes once regardless of how many times it's called.
   */
  const processSubmission = useCallback(() => {
    if (submissionHandledRef.current || !pendingSubmitRef.current || !promptTextRef.current) {
      return;
    }

    submissionHandledRef.current = true;
    pendingSubmitRef.current = false;

    methods.setValue('text', promptTextRef.current, { shouldValidate: true });

    methods.handleSubmit((data) => {
      if (data.text?.trim()) {
        submitMessage(data);

        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);

        console.log('Message submitted with conversation state:', conversation);
      }
    })();
  }, [methods, submitMessage, conversation]);

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

      if (!shouldAutoSubmit) {
        submissionHandledRef.current = true;
      }

      /** Mark processing as complete and clean up as needed */
      const success = () => {
        const paramString = searchParams.toString();
        const currentParams = new URLSearchParams(paramString);
        currentParams.delete('prompt');
        currentParams.delete('q');
        currentParams.delete('submit');

        setSearchParams(currentParams, { replace: true });
        processedRef.current = true;
        console.log('Parameters processed successfully', paramString);
        clearInterval(intervalId);

        // Only clean URL if there's no pending submission
        if (!pendingSubmitRef.current) {
          const newUrl = window.location.pathname;
          window.history.replaceState({}, '', newUrl);
        }
      };

      // Store settings for later comparison
      if (Object.keys(validSettings).length > 0) {
        validSettingsRef.current = validSettings;
      }

      // Save the prompt text for later use if needed
      if (decodedPrompt) {
        promptTextRef.current = decodedPrompt;
      }

      // Handle auto-submission
      if (shouldAutoSubmit && decodedPrompt) {
        if (Object.keys(validSettings).length > 0) {
          // Settings are changing, defer submission
          pendingSubmitRef.current = true;

          // Set a timeout to handle the case where settings might never fully apply
          settingsTimeoutRef.current = setTimeout(() => {
            if (!submissionHandledRef.current && pendingSubmitRef.current) {
              console.warn(
                'Settings application timeout reached, proceeding with submission anyway',
              );
              processSubmission();
            }
          }, MAX_SETTINGS_WAIT_MS);
        } else {
          methods.setValue('text', decodedPrompt, { shouldValidate: true });
          textAreaRef.current.focus();
          textAreaRef.current.setSelectionRange(decodedPrompt.length, decodedPrompt.length);

          methods.handleSubmit((data) => {
            if (data.text?.trim()) {
              submitMessage(data);
            }
          })();
        }
      } else if (decodedPrompt) {
        methods.setValue('text', decodedPrompt, { shouldValidate: true });
        textAreaRef.current.focus();
        textAreaRef.current.setSelectionRange(decodedPrompt.length, decodedPrompt.length);
      } else {
        submissionHandledRef.current = true;
      }

      if (Object.keys(validSettings).length > 0) {
        newQueryConvo(validSettings);
      }

      success();
    }, 100);

    return () => {
      clearInterval(intervalId);
      if (settingsTimeoutRef.current) {
        clearTimeout(settingsTimeoutRef.current);
      }
    };
  }, [
    searchParams,
    methods,
    textAreaRef,
    newQueryConvo,
    newConversation,
    submitMessage,
    setSearchParams,
    queryClient,
    processSubmission,
  ]);

  useEffect(() => {
    // Only proceed if we've already processed URL parameters but haven't yet handled submission
    if (
      !processedRef.current ||
      submissionHandledRef.current ||
      settingsAppliedRef.current ||
      !validSettingsRef.current ||
      !conversation
    ) {
      return;
    }

    const allSettingsApplied = areSettingsApplied();

    if (allSettingsApplied) {
      settingsAppliedRef.current = true;

      if (pendingSubmitRef.current) {
        if (settingsTimeoutRef.current) {
          clearTimeout(settingsTimeoutRef.current);
          settingsTimeoutRef.current = null;
        }

        console.log('Settings fully applied, processing submission');
        processSubmission();
      }
    }
  }, [conversation, processSubmission, areSettingsApplied]);
}
