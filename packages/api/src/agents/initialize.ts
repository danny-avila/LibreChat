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
import type { Agent, TFile, AgentToolResources, TUser } from 'librechat-data-provider';
import type { Response as ServerResponse } from 'express';
import type { IMongoFile } from '@librechat/data-schemas';
import type { GenericTool } from '@librechat/agents';
import type { InitializeResultBase, EndpointDbMethods, ServerRequest } from '~/types';
import { getModelMaxTokens, extractLibreChatParams, optionalChainWithEmptyCheck } from '~/utils';
import { filterFilesByEndpointConfig } from '~/files';
import { generateArtifactsPrompt } from '~/prompts';
import { getProviderConfig } from '~/endpoints';
import { primeResources } from './resources';

/**
 * Function type for processing files
 */
export type ProcessFilesFunction = (files: IMongoFile[]) => Promise<IMongoFile[]>;

/**
 * Function type for getting files
 */
export type GetFilesFunction = (
  filter: unknown,
  sortOptions: unknown,
  selectFields: unknown,
  options?: { userId?: string; agentId?: string },
) => Promise<TFile[]>;

/**
 * Function type for getting tool files by IDs
 */
export type GetToolFilesByIdsFunction = (
  fileIds: string[],
  toolResourceSet: Set<EToolResources>,
) => Promise<IMongoFile[]>;

/**
 * Function type for getting conversation files
 */
export type GetConvoFilesFunction = (conversationId: string) => Promise<string[] | null>;

/**
 * Function type for loading agent tools
 */
export type LoadAgentToolsFunction = (params: {
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
} | null>;

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
};

/**
 * Parameters for initializing an agent
 */
export interface InitializeAgentParams {
  /** Request object (ServerRequest to match primeResources interface) */
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
  loadTools?: LoadAgentToolsFunction;
  /** Model parameters (optional, only used for initial agent) */
  model_parameters?: Record<string, unknown>;
  /** Set of allowed providers */
  allowedProviders: Set<string>;
  /** Whether this is the initial agent */
  isInitialAgent?: boolean;
  /** Database methods */
  db: EndpointDbMethods;
  /** Function to process files */
  processFiles: ProcessFilesFunction;
  /** Function to get files */
  getFiles: GetFilesFunction;
  /** Function to get tool files by IDs */
  getToolFilesByIds: GetToolFilesByIdsFunction;
  /** Function to get conversation files */
  getConvoFiles: GetConvoFilesFunction;
}

/**
 * Initializes an agent for use in requests.
 * Handles file processing, tool loading, provider configuration, and context token calculations.
 *
 * @param params - Initialization parameters
 * @returns Promise resolving to initialized agent with tools and configuration
 * @throws Error if agent provider is not allowed or if required dependencies are missing
 */
export async function initializeAgent({
  req,
  res,
  agent,
  loadTools,
  requestFiles = [],
  conversationId,
  model_parameters,
  allowedProviders,
  isInitialAgent = false,
  db,
  processFiles,
  getFiles,
  getToolFilesByIds,
  getConvoFiles,
}: InitializeAgentParams): Promise<InitializedAgent> {
  if (
    isAgentsEndpoint(req.body.endpoint) &&
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
      isInitialAgent === true ? model_parameters : {},
    ),
  );

  const { resendFiles, maxContextTokens, modelOptions } = extractLibreChatParams(
    _modelOptions as Record<string, unknown>,
  );

  const provider = agent.provider;
  agent.endpoint = provider;

  if (isInitialAgent && conversationId != null && resendFiles) {
    const fileIds = (await getConvoFiles(conversationId)) ?? [];
    const toolResourceSet = new Set<EToolResources>();
    for (const tool of agent.tools ?? []) {
      if (EToolResources[tool as keyof typeof EToolResources]) {
        toolResourceSet.add(EToolResources[tool as keyof typeof EToolResources]);
      }
    }
    const toolFiles = await getToolFilesByIds(fileIds, toolResourceSet);
    if (requestFiles.length || toolFiles.length) {
      currentFiles = await processFiles(requestFiles.concat(toolFiles));
    }
  } else if (isInitialAgent && requestFiles.length) {
    currentFiles = await processFiles(requestFiles);
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
    getFiles,
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
  } = (await loadTools?.({
    req,
    res,
    provider,
    agentId: agent.id,
    tools: agent.tools ?? [],
    model: agent.model,
    tool_resources,
  })) ?? { tools: [], toolContextMap: {}, userMCPAuthMap: undefined };

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
    appConfig: req.config,
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
    toolContextMap: toolContextMap ?? {},
    useLegacyContent: !!options.useLegacyContent,
    maxContextTokens: Math.round((agentMaxContextNum - maxOutputTokensNum) * 0.9),
  };

  return initializedAgent;
}
