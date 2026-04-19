import { useMemo } from 'react';
import { EModelEndpoint, isAgentsEndpoint, isAssistantsEndpoint } from 'librechat-data-provider';
import { useChatContext } from '~/Providers/ChatContext';
import { useMockPermissions } from '~/hooks/Endpoint/mockApi';

/**
 * Hook to check if the current endpoint/model requires permission
 * Returns true if:
 * - API failed (error or null data)
 * - Current endpoint is not in allowed providers
 * - Current model is not in allowed models for the endpoint
 */
export default function useRequiresPermission() {
  const { conversation } = useChatContext();
  const {
    error: permissionsError,
    data: permissionsData,
    providers,
    modelsByProvider,
  } = useMockPermissions();

  const requiresPermission = useMemo(() => {
    const endpointType = conversation?.endpointType;
    const endpointName = conversation?.endpoint;
    const model = conversation?.model;

    /**
     * Determine which key to use for permissions:
     * - For standard endpoints (openAI, google, anthropic, bedrock, etc.), use endpointType
     * - For custom endpoints (e.g., OpenRouter), use the endpoint name from the conversation
     *
     * This ensures that custom providers like 'OpenRouter' are matched against the
     * provider names returned by the external permissions API.
     */
    const endpoint =
      endpointType === EModelEndpoint.custom || !endpointType ? endpointName : endpointType;

    // If API failed or returned null, block everything
    if (permissionsError || !permissionsData) {
      return true;
    }

    // If no permissions data yet, don't block (still loading)
    if (!providers || !modelsByProvider) {
      return false;
    }

    // Skip permission check for agents/assistants
    if (
      !endpoint ||
      isAgentsEndpoint(endpoint) ||
      isAssistantsEndpoint(endpoint) ||
      endpoint === EModelEndpoint.azureAssistants
    ) {
      return false;
    }

    // Check if endpoint is in allowed providers
    const providersSet = new Set(providers);
    if (!providersSet.has(endpoint as EModelEndpoint)) {
      return true; // Endpoint not allowed
    }

    // Check if model is in allowed models for this endpoint
    const allowedModels = modelsByProvider[endpoint];
    if (allowedModels && allowedModels.length > 0 && model) {
      if (!allowedModels.includes(model)) {
        return true; // Model not allowed
      }
    }

    return false; // Has permission
  }, [conversation, permissionsError, permissionsData, providers, modelsByProvider]);

  return { requiresPermission };
}
