import {
  EModelEndpoint,
  isAgentsEndpoint,
  orderEndpointsConfig,
  defaultAgentCapabilities,
} from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import type { AgentCapabilities, TEndpointsConfig } from 'librechat-data-provider';
import type { ServerRequest } from '~/types';
import { loadCustomEndpointsConfig } from '~/endpoints/custom';

type PartialEndpointConfig = Record<string, Record<string, unknown> | false | null>;
type MutableEndpointsConfig = Record<string, Record<string, unknown> | false | null | undefined>;

export interface EndpointsConfigDeps {
  getAppConfig: (params: { role?: string | null; tenantId?: string }) => Promise<AppConfig>;
  loadDefaultEndpointsConfig: (appConfig: AppConfig) => Promise<PartialEndpointConfig>;
}

export function createEndpointsConfigService(deps: EndpointsConfigDeps) {
  const { getAppConfig, loadDefaultEndpointsConfig } = deps;

  async function getEndpointsConfig(req: ServerRequest): Promise<TEndpointsConfig> {
    const appConfig =
      req.config ?? (await getAppConfig({ role: req.user?.role, tenantId: req.user?.tenantId }));
    const defaultEndpointsConfig = await loadDefaultEndpointsConfig(appConfig);
    const customEndpointsConfig = loadCustomEndpointsConfig(appConfig?.endpoints?.custom);

    const mergedConfig: MutableEndpointsConfig = {
      ...defaultEndpointsConfig,
      ...customEndpointsConfig,
    };

    if (appConfig.endpoints?.[EModelEndpoint.azureOpenAI]) {
      mergedConfig[EModelEndpoint.azureOpenAI] = { userProvide: false };
    }

    if (appConfig.endpoints?.[EModelEndpoint.anthropic]?.vertexConfig?.enabled) {
      mergedConfig[EModelEndpoint.anthropic] = { userProvide: false };
    }

    if (appConfig.endpoints?.[EModelEndpoint.azureOpenAI]?.assistants) {
      mergedConfig[EModelEndpoint.azureAssistants] = { userProvide: false };
    }

    if (
      mergedConfig[EModelEndpoint.assistants] &&
      appConfig?.endpoints?.[EModelEndpoint.assistants]
    ) {
      const { disableBuilder, retrievalModels, capabilities, version } =
        appConfig.endpoints[EModelEndpoint.assistants];
      mergedConfig[EModelEndpoint.assistants] = {
        ...mergedConfig[EModelEndpoint.assistants],
        version,
        retrievalModels,
        disableBuilder,
        capabilities,
      };
    }

    if (mergedConfig[EModelEndpoint.agents] && appConfig?.endpoints?.[EModelEndpoint.agents]) {
      const { disableBuilder, capabilities, allowedProviders } =
        appConfig.endpoints[EModelEndpoint.agents];
      mergedConfig[EModelEndpoint.agents] = {
        ...mergedConfig[EModelEndpoint.agents],
        allowedProviders,
        disableBuilder,
        capabilities,
      };
    }

    if (
      mergedConfig[EModelEndpoint.azureAssistants] &&
      appConfig?.endpoints?.[EModelEndpoint.azureAssistants]
    ) {
      const { disableBuilder, retrievalModels, capabilities, version } =
        appConfig.endpoints[EModelEndpoint.azureAssistants];
      mergedConfig[EModelEndpoint.azureAssistants] = {
        ...mergedConfig[EModelEndpoint.azureAssistants],
        version,
        retrievalModels,
        disableBuilder,
        capabilities,
      };
    }

    if (mergedConfig[EModelEndpoint.bedrock] && appConfig?.endpoints?.[EModelEndpoint.bedrock]) {
      const bedrockEndpoint = appConfig.endpoints[EModelEndpoint.bedrock] as Record<
        string,
        unknown
      >;
      mergedConfig[EModelEndpoint.bedrock] = {
        ...mergedConfig[EModelEndpoint.bedrock],
        availableRegions: bedrockEndpoint.availableRegions as string[] | undefined,
      };
    }

    return orderEndpointsConfig(mergedConfig as unknown as TEndpointsConfig);
  }

  async function checkCapability(
    req: ServerRequest,
    capability: AgentCapabilities,
  ): Promise<boolean> {
    const isAgents = isAgentsEndpoint(req.body?.endpointType || req.body?.endpoint);
    const endpointsConfig = await getEndpointsConfig(req);
    const capabilities =
      isAgents || endpointsConfig?.[EModelEndpoint.agents]?.capabilities != null
        ? (endpointsConfig?.[EModelEndpoint.agents]?.capabilities ?? [])
        : defaultAgentCapabilities;
    return capabilities.includes(capability);
  }

  return { getEndpointsConfig, checkCapability };
}
