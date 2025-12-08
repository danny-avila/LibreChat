import { Providers } from '@librechat/agents';
import {
  ErrorTypes,
  EModelEndpoint,
  EToolResources,
  paramEndpoints,
  isAgentsEndpoint,
  replaceSpecialVars,
  providerEndpointMap,
} from 'librechat-data-provider';
import type {
  AgentToolResources,
  TEndpointOption,
  TFile,
  Agent,
  TUser,
} from 'librechat-data-provider';
import type { GenericTool, LCToolRegistry, ToolMap } from '@librechat/agents';
import type { Response as ServerResponse } from 'express';
import type { IMongoFile } from '@librechat/data-schemas';
import type { InitializeResultBase, ServerRequest, EndpointDbMethods } from '~/types';
import { getModelMaxTokens, extractLibreChatParams, optionalChainWithEmptyCheck } from '~/utils';
import { filterFilesByEndpointConfig } from '~/files';
import { generateArtifactsPrompt } from '~/prompts';
import { getProviderConfig } from '~/endpoints';
import { primeResources } from './resources';

/**
 * Extended agent type with additional fields needed after initialization
 */
export type InitializedAgent = Agent & {
  tools: GenericTool[];
  attachments: IMongoFile[];
  toolContextMap: Record<string, unknown>;
  maxContextTokens: number;
  useLegacyContent: boolean;
  resendFiles: boolean;
  userMCPAuthMap?: Record<string, Record<string, string>>;
  /** Tool map for ToolNode to use when executing tools (required for PTC) */
  toolMap?: ToolMap;
  /** Tool registry for PTC and tool search (only present when MCP tools with env classification exist) */
  toolRegistry?: LCToolRegistry;
};

/**
 * Parameters for initializing an agent
 * Matches the CJS signature from api/server/services/Endpoints/agents/agent.js
 */
export interface InitializeAgentParams {
  /** Request object */
  req: ServerRequest;
  /** Response object */
  res: ServerResponse;
  /** Agent to initialize */
  agent: Agent;
  /** Conversation ID (optional) */
  conversationId?: string | null;
  /** Request files */
  requestFiles?: IMongoFile[];
  /** Function to load agent tools */
  loadTools?: (params: {
    req: ServerRequest;
    res: ServerResponse;
    provider: string;
    agentId: string;
    tools: string[];
    model: string | null;
    tool_resources: AgentToolResources | undefined;
  }) => Promise<{
    tools: GenericTool[];
    toolContextMap: Record<string, unknown>;
    userMCPAuthMap?: Record<string, Record<string, string>>;
    toolRegistry?: LCToolRegistry;
  } | null>;
  /** Endpoint option (contains model_parameters and endpoint info) */
  endpointOption?: Partial<TEndpointOption>;
  /** Set of allowed providers */
  allowedProviders: Set<string>;
  /** Whether this is the initial agent */
  isInitialAgent?: boolean;
}

/**
 * Database methods required for agent initialization
 * Most methods come from data-schemas via createMethods()
 * getConvoFiles not yet in data-schemas but included here for consistency
 */
export interface InitializeAgentDbMethods extends EndpointDbMethods {
  /** Update usage tracking for multiple files */
  updateFilesUsage: (files: Array<{ file_id: string }>, fileIds?: string[]) => Promise<unknown[]>;
  /** Get files from database */
  getFiles: (filter: unknown, sort: unknown, select: unknown, opts?: unknown) => Promise<unknown[]>;
  /** Get tool files by IDs */
  getToolFilesByIds: (fileIds: string[], toolSet: Set<EToolResources>) => Promise<unknown[]>;
  /** Get conversation file IDs */
  getConvoFiles: (conversationId: string) => Promise<string[] | null>;
}

/**
 * Initializes an agent for use in requests.
 * Handles file processing, tool loading, provider configuration, and context token calculations.
 *
 * This function is exported from @librechat/api and replaces the CJS version from
 * api/server/services/Endpoints/agents/agent.js
 *
 * @param params - Initialization parameters
 * @param deps - Optional dependency injection for testing
 * @returns Promise resolving to initialized agent with tools and configuration
 * @throws Error if agent provider is not allowed or if required dependencies are missing
 */
export async function initializeAgent(
  params: InitializeAgentParams,
  db?: InitializeAgentDbMethods,
): Promise<InitializedAgent> {
  const {
    req,
    res,
    agent,
    loadTools,
    requestFiles = [],
    conversationId,
    endpointOption,
    allowedProviders,
    isInitialAgent = false,
  } = params;

  if (!db) {
    throw new Error('initializeAgent requires db methods to be passed');
  }

  if (
    isAgentsEndpoint(endpointOption?.endpoint) &&
    allowedProviders.size > 0 &&
    !allowedProviders.has(agent.provider)
  ) {
    throw new Error(
      `{ "type": "${ErrorTypes.INVALID_AGENT_PROVIDER}", "info": "${agent.provider}" }`,
    );
  }

  let currentFiles: IMongoFile[] | undefined;

  const _modelOptions = structuredClone(
    Object.assign(
      { model: agent.model },
      agent.model_parameters ?? { model: agent.model },
      isInitialAgent === true ? endpointOption?.model_parameters : {},
    ),
  );

  const { resendFiles, maxContextTokens, modelOptions } = extractLibreChatParams(
    _modelOptions as Record<string, unknown>,
  );

  const provider = agent.provider;
  agent.endpoint = provider;

  if (isInitialAgent && conversationId != null && resendFiles) {
    const fileIds = (await db.getConvoFiles(conversationId)) ?? [];
    const toolResourceSet = new Set<EToolResources>();
    for (const tool of agent.tools ?? []) {
      if (EToolResources[tool as keyof typeof EToolResources]) {
        toolResourceSet.add(EToolResources[tool as keyof typeof EToolResources]);
      }
    }
    const toolFiles = (await db.getToolFilesByIds(fileIds, toolResourceSet)) as IMongoFile[];
    if (requestFiles.length || toolFiles.length) {
      currentFiles = (await db.updateFilesUsage(requestFiles.concat(toolFiles))) as IMongoFile[];
    }
  } else if (isInitialAgent && requestFiles.length) {
    currentFiles = (await db.updateFilesUsage(requestFiles)) as IMongoFile[];
  }

  if (currentFiles && currentFiles.length) {
    let endpointType: EModelEndpoint | undefined;
    if (!paramEndpoints.has(agent.endpoint ?? '')) {
      endpointType = EModelEndpoint.custom;
    }

    currentFiles = filterFilesByEndpointConfig(req, {
      files: currentFiles,
      endpoint: agent.endpoint ?? '',
      endpointType,
    });
  }

  const { attachments: primedAttachments, tool_resources } = await primeResources({
    req: req as never,
    getFiles: db.getFiles as never,
    appConfig: req.config,
    agentId: agent.id,
    attachments: currentFiles
      ? (Promise.resolve(currentFiles) as unknown as Promise<TFile[]>)
      : undefined,
    tool_resources: agent.tool_resources,
    requestFileSet: new Set(requestFiles?.map((file) => file.file_id)),
  });

  const {
    tools: structuredTools,
    toolContextMap,
    userMCPAuthMap,
    toolRegistry,
  } = (await loadTools?.({
    req,
    res,
    provider,
    agentId: agent.id,
    tools: agent.tools ?? [],
    model: agent.model,
    tool_resources,
  })) ?? { tools: [], toolContextMap: {}, userMCPAuthMap: undefined, toolRegistry: undefined };

  const { getOptions, overrideProvider } = getProviderConfig({
    provider,
    appConfig: req.config,
  });
  if (overrideProvider !== agent.provider) {
    agent.provider = overrideProvider;
  }

  const finalModelOptions = {
    ...modelOptions,
    model: agent.model,
  };

  const options: InitializeResultBase = await getOptions({
    req,
    endpoint: provider,
    model_parameters: finalModelOptions,
    db,
  });

  const llmConfig = options.llmConfig as Record<string, unknown>;
  const tokensModel =
    agent.provider === EModelEndpoint.azureOpenAI ? agent.model : (llmConfig?.model as string);
  const maxOutputTokens = optionalChainWithEmptyCheck(
    llmConfig?.maxOutputTokens as number | undefined,
    llmConfig?.maxTokens as number | undefined,
    0,
  );
  const agentMaxContextTokens = optionalChainWithEmptyCheck(
    maxContextTokens,
    getModelMaxTokens(
      tokensModel ?? '',
      providerEndpointMap[provider as keyof typeof providerEndpointMap],
      options.endpointTokenConfig,
    ),
    18000,
  );

  if (
    agent.endpoint === EModelEndpoint.azureOpenAI &&
    (llmConfig?.azureOpenAIApiInstanceName as string | undefined) == null
  ) {
    agent.provider = Providers.OPENAI;
  }

  if (options.provider != null) {
    agent.provider = options.provider;
  }

  let tools: GenericTool[] = options.tools?.length
    ? (options.tools as GenericTool[])
    : structuredTools;
  if (
    (agent.provider === Providers.GOOGLE || agent.provider === Providers.VERTEXAI) &&
    options.tools?.length &&
    structuredTools?.length
  ) {
    throw new Error(`{ "type": "${ErrorTypes.GOOGLE_TOOL_CONFLICT}"}`);
  } else if (
    (agent.provider === Providers.OPENAI ||
      agent.provider === Providers.AZURE ||
      agent.provider === Providers.ANTHROPIC) &&
    options.tools?.length &&
    structuredTools?.length
  ) {
    tools = structuredTools.concat(options.tools as GenericTool[]);
  }

  agent.model_parameters = { ...options.llmConfig } as Agent['model_parameters'];
  if (options.configOptions) {
    (agent.model_parameters as Record<string, unknown>).configuration = options.configOptions;
  }

  if (agent.instructions && agent.instructions !== '') {
    agent.instructions = replaceSpecialVars({
      text: agent.instructions,
      user: req.user ? (req.user as unknown as TUser) : null,
    });
  }

  if (typeof agent.artifacts === 'string' && agent.artifacts !== '') {
    const artifactsPromptResult = generateArtifactsPrompt({
      endpoint: agent.provider,
      artifacts: agent.artifacts as never,
    });
    agent.additional_instructions = artifactsPromptResult ?? undefined;
  }

  const agentMaxContextNum = Number(agentMaxContextTokens) || 18000;
  const maxOutputTokensNum = Number(maxOutputTokens) || 0;

  const finalAttachments: IMongoFile[] = (primedAttachments ?? [])
    .filter((a): a is TFile => a != null)
    .map((a) => a as unknown as IMongoFile);

  const initializedAgent: InitializedAgent = {
    ...agent,
    tools: (tools ?? []) as GenericTool[] & string[],
    attachments: finalAttachments,
    resendFiles,
    userMCPAuthMap,
    toolRegistry,
    toolContextMap: toolContextMap ?? {},
    useLegacyContent: !!options.useLegacyContent,
    maxContextTokens: Math.round((agentMaxContextNum - maxOutputTokensNum) * 0.9),
  };

  return initializedAgent;
}
