import { EModelEndpoint, isAgentsEndpoint, isAssistantsEndpoint } from 'librechat-data-provider';

const EXCLUDED_ENDPOINTS = new Set([
  EModelEndpoint.azureOpenAI,
  EModelEndpoint.openAI,
  EModelEndpoint.google,
  EModelEndpoint.anthropic,
  EModelEndpoint.custom,
  EModelEndpoint.bedrock,
]);

export function filterMentionEndpoints({
  endpoints,
  includedEndpoints,
  includeAssistants,
  hasAgentAccess,
}: {
  endpoints: Array<EModelEndpoint | string>;
  includedEndpoints: Set<string>;
  includeAssistants: boolean;
  hasAgentAccess: boolean;
}) {
  const hasEndpointAllowList = includedEndpoints.size > 0;

  return endpoints.filter((endpoint) => {
    if (!includeAssistants && isAssistantsEndpoint(endpoint)) {
      return false;
    }

    if (isAgentsEndpoint(endpoint) && !hasAgentAccess) {
      return false;
    }

    // NJ: We want to exclude endpoints from our mentions, only allowing agents & model specs
    if (EXCLUDED_ENDPOINTS.has(endpoint as EModelEndpoint)) {
      return false;
    }

    if (hasEndpointAllowList && !includedEndpoints.has(endpoint)) {
      return false;
    }

    return true;
  });
}
