import type {
  Agent,
  Assistant,
  TAgentsMap,
  TAssistantsMap,
  TEndpointsConfig,
  TStartupConfig,
} from 'librechat-data-provider';
import {
  EModelEndpoint,
  PermissionTypes,
  Permissions,
  alternateName,
} from 'librechat-data-provider';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import React, { useCallback, useMemo } from 'react';
import type { Endpoint } from '~/common';
import { useGetEndpointsQuery } from '~/data-provider';
import { useHasAccess } from '~/hooks';
import { useChatContext } from '~/Providers';
import { getEndpointField, getIconKey, mapEndpoints } from '~/utils';
import { icons } from './Icons';

export const useEndpoints = ({
  agentsMap,
  assistantsMap,
  endpointsConfig,
  startupConfig,
}: {
  agentsMap?: TAgentsMap;
  assistantsMap?: TAssistantsMap;
  endpointsConfig: TEndpointsConfig;
  startupConfig: TStartupConfig | undefined;
}) => {
  const modelsQuery = useGetModelsQuery();
  const { conversation } = useChatContext();
  const { data: endpoints = [] } = useGetEndpointsQuery({ select: mapEndpoints });
  const { instanceProjectId } = startupConfig ?? {};
  const interfaceConfig = startupConfig?.interface ?? {};
  const includedEndpoints = useMemo(
    () => new Set(startupConfig?.modelSpecs?.addedEndpoints ?? []),
    [startupConfig?.modelSpecs?.addedEndpoints],
  );

  const { endpoint } = conversation ?? {};

  const hasAgentAccess = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });

  const agents = useMemo(
    () =>
      Object.values(agentsMap ?? {}).filter(
        (agent): agent is Agent & { name: string } =>
          agent !== undefined && 'id' in agent && 'name' in agent && agent.name !== null,
      ),
    [agentsMap],
  );

  const assistants: Assistant[] = useMemo(
    () => Object.values(assistantsMap?.[EModelEndpoint.assistants] ?? {}),
    [endpoint, assistantsMap],
  );

  const azureAssistants: Assistant[] = useMemo(
    () => Object.values(assistantsMap?.[EModelEndpoint.azureAssistants] ?? {}),
    [endpoint, assistantsMap],
  );

  const filteredEndpoints = useMemo(() => {
    if (!interfaceConfig.modelSelect) {
      return [];
    }
    const result: EModelEndpoint[] = [];
    for (let i = 0; i < endpoints.length; i++) {
      if (endpoints[i] === EModelEndpoint.agents && !hasAgentAccess) {
        continue;
      }
      if (includedEndpoints.size > 0 && !includedEndpoints.has(endpoints[i])) {
        continue;
      }
      result.push(endpoints[i]);
    }

    return result;
  }, [endpoints, hasAgentAccess, includedEndpoints]);

  const endpointRequiresUserKey = useCallback(
    (ep: string) => {
      return !!getEndpointField(endpointsConfig, ep, 'userProvide');
    },
    [endpointsConfig],
  );

  const mappedEndpoints: Endpoint[] = useMemo(() => {
    console.log('filteredEndpoints', filteredEndpoints);
    return filteredEndpoints.map((ep) => {
      const endpointType = getEndpointField(endpointsConfig, ep, 'type');
      const iconKey = getIconKey({ endpoint: ep, endpointsConfig, endpointType });
      const Icon = icons[iconKey];
      const endpointIconURL = getEndpointField(endpointsConfig, ep, 'iconURL');
      const hasModels =
        (ep === EModelEndpoint.agents && agents?.length > 0) ||
        (ep === EModelEndpoint.assistants && assistants?.length > 0) ||
        (ep !== EModelEndpoint.assistants &&
          ep !== EModelEndpoint.agents &&
          (modelsQuery.data?.[ep]?.length ?? 0) > 0);

      // Base result object with formatted default icon
      const result: Endpoint = {
        value: ep,
        label: alternateName[ep] || ep,
        hasModels,
        icon: Icon
          ? React.createElement(Icon, {
            size: 20,
            className: 'text-text-primary shrink-0 icon-md',
            iconURL: endpointIconURL,
            endpoint: ep,
          })
          : null,
      };

      // Handle agents case
      if (ep === EModelEndpoint.agents && agents.length > 0) {
        result.models = agents.map((agent) => ({
          name: agent.id,
          isGlobal:
            (instanceProjectId != null && agent.projectIds?.includes(instanceProjectId)) ?? false,
        }));
        result.agentNames = agents.reduce((acc, agent) => {
          acc[agent.id] = agent.name || '';
          return acc;
        }, {});
        result.modelIcons = agents.reduce((acc, agent) => {
          acc[agent.id] = agent?.avatar?.filepath;
          return acc;
        }, {});
      }

      // For other endpoints with models from the modelsQuery
      else if (
        ep !== EModelEndpoint.agents &&
        ep !== EModelEndpoint.assistants &&
        (modelsQuery.data?.[ep]?.length ?? 0) > 0
      ) {
        result.models = modelsQuery.data?.[ep]?.filter(model => {
          const allowedProviders = [
            'anthropic',
            'google', 
            'openai',
            'x-ai',
            'deepseek',
            'perplexity',
            'meta-llama',
          ];
          if (!allowedProviders.some(provider => model.startsWith(provider + '/'))) {
            return false;
          }

          const excludedModels = [
            'anthropic/claude-2:beta',
            'anthropic/claude-2',
            'anthropic/claude-2.0:beta',
            'anthropic/claude-2.0',
            'anthropic/claude-2.1:beta',
            'anthropic/claude-2.1',
            'anthropic/claude-3-haiku',
            'anthropic/claude-3-haiku:beta',
            'anthropic/claude-3-sonnet',
            'anthropic/claude-3-sonnet:beta',
            'anthropic/claude-3-opus',
            'anthropic/claude-3-opus:beta',
            'anthropic/claude-3.5-haiku',
            'anthropic/claude-3.5-haiku-20241022',
            'anthropic/claude-3.5-haiku-20241022:beta',
            'anthropic/claude-3.5-haiku:beta',
            'anthropic/claude-3.5-sonnet-20240620',
            'anthropic/claude-3.5-sonnet-20240620:beta',
            'anthropic/claude-3.5-sonnet:beta',
            'anthropic/claude-3.7-sonnet:beta',

            'openai/gpt-3.5-turbo',
            'openai/gpt-3.5-turbo-0125',
            'openai/gpt-3.5-turbo-0613',
            'openai/gpt-3.5-turbo-1106',
            'openai/gpt-3.5-turbo-16k',
            'openai/gpt-3.5-turbo-instruct',
            'openai/gpt-4',
            'openai/gpt-4-0314',
            'openai/gpt-4-32k',
            'openai/gpt-4-32k-0314',
            'openai/gpt-4-turbo',
            'openai/gpt-4-turbo-preview',
            'openai/gpt-4-1106-preview',
            'openai/gpt-4o',
            'openai/gpt-4o-2024-05-13',
            'openai/gpt-4o-2024-08-06',
            'openai/gpt-4o-2024-11-20',
            'openai/gpt-4o-mini',
            'openai/gpt-4o-mini-2024-07-18',
            'openai/o1-mini-2024-09-12',
            'openai/o1-preview-2024-09-12',

            'deepseek/deepseek-chat',
            'deepseek/deepseek-chat:free',
            'deepseek/deepseek-r1-distill-llama-70b',
            'deepseek/deepseek-r1-distill-llama-70b:free',
            'deepseek/deepseek-r1-distill-llama-8b',
            'deepseek/deepseek-r1-distill-qwen-1.5b',
            'deepseek/deepseek-r1-distill-qwen-14b',
            'deepseek/deepseek-r1-distill-qwen-14b:free',
            'deepseek/deepseek-r1-distill-qwen-32b',
            'deepseek/deepseek-r1-distill-qwen-32b:free',
            'deepseek/deepseek-v3-base:free',

            'perplexity/llama-3.1-sonar-large-128k-online',
            'perplexity/llama-3.1-sonar-small-128k-online',
            
            'x-ai/grok-2-1212',
            'x-ai/grok-2-vision-1212',
            'x-ai/grok-beta',
            'x-ai/grok-vision-beta',

            'google/gemini-2.0-flash-001',
            'google/gemini-2.0-flash-lite-001',
            'google/gemini-2.0-flash-thinking-exp-1219:free',
            'google/gemini-flash-1.5',
            'google/gemini-flash-1.5-8b',
            'google/gemini-flash-1.5-8b-exp',
            'google/gemini-pro',
            'google/gemini-pro-1.5',
            'google/gemini-pro-vision',
            'google/gemma-2-27b-it',
            'google/gemma-2-9b-it',
            'google/gemma-2-9b-it:free',
            'google/gemma-3-12b-it',
            'google/gemma-3-12b-it:free',
            'google/gemma-3-1b-it:free',
            'google/gemma-3-27b-it',
            'google/gemma-3-27b-it:free',
            'google/gemma-3-4b-it',
            'google/gemma-3-4b-it:free',
            'google/palm-2-chat-bison',
            'google/palm-2-chat-bison-32k',
            'google/palm-2-codechat-bison',
            'google/palm-2-codechat-bison-32k',

            'meta-llama/llama-2-13b-chat',
            'meta-llama/llama-2-70b-chat',
            'meta-llama/llama-3-70b-instruct',
            'meta-llama/llama-3-8b-instruct',
            'meta-llama/llama-3.1-405b',
            'meta-llama/llama-3.1-405b-instruct',
            'meta-llama/llama-3.1-70b-instruct',
            'meta-llama/llama-3.1-8b-instruct',
            'meta-llama/llama-3.2-11b-vision-instruct',
            'meta-llama/llama-3.2-11b-vision-instruct:free',
            'meta-llama/llama-3.2-1b-instruct',
            'meta-llama/llama-3.2-3b-instruct',
            'meta-llama/llama-3.2-90b-vision-instruct',
            'meta-llama/llama-3.3-70b-instruct',
            'meta-llama/llama-4-maverick',
            'meta-llama/llama-4-scout',
            'meta-llama/llama-guard-2-8b',
            'meta-llama/llama-guard-3-8b'
          ];
          return !excludedModels.includes(model);
        }).map((model) => ({
          name: model,
          isGlobal: false,
        }));
      }

      return result;
    });
  }, [filteredEndpoints, endpointsConfig, modelsQuery.data, agents, assistants]);

  return {
    mappedEndpoints,
    endpointRequiresUserKey,
  };
};

export default useEndpoints;
