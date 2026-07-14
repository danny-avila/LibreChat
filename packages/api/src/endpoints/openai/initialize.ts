import { ErrorTypes, EModelEndpoint, mapModelToAzureConfig } from 'librechat-data-provider';
import type {
  BaseInitializeParams,
  EndpointTokenConfig,
  InitializeResultBase,
  OpenAIConfigOptions,
  UserKeyValues,
} from '~/types';
import {
  mergeHeaders,
  resolveHeaders,
  isUserProvided,
  checkUserKeyExpiry,
  getAzureCredentials,
} from '~/utils';
import { createOpenAIIdentifier } from '~/utils/identity';
import { validateEndpointURL } from '~/auth';
import { getOpenAIConfig } from './config';

function getStablePromptIdentity(
  body: Record<string, unknown>,
  modelParameters?: Record<string, unknown>,
): string {
  const agent =
    body.agent && typeof body.agent === 'object'
      ? (body.agent as Record<string, unknown>)
      : undefined;
  const tools = Array.isArray(agent?.tools) ? agent.tools : [];
  return JSON.stringify({
    agentId:
      (typeof body.agent_id === 'string' && body.agent_id) ||
      (typeof agent?.id === 'string' && agent.id) ||
      '',
    instructions:
      (typeof agent?.instructions === 'string' && agent.instructions) ||
      (typeof modelParameters?.promptPrefix === 'string' && modelParameters.promptPrefix) ||
      '',
    tools,
  });
}

function toBillingTokenRates(rates: {
  prompt: number;
  completion: number;
  context: number;
  cacheRead?: number;
  cacheWrite?: number;
}): EndpointTokenConfig[string] {
  return {
    prompt: rates.prompt,
    completion: rates.completion,
    context: rates.context,
    ...(rates.cacheRead != null && { read: rates.cacheRead }),
    ...(rates.cacheWrite != null && { write: rates.cacheWrite }),
  };
}

/**
 * Initializes OpenAI options for agent usage. This function always returns configuration
 * options and never creates a client instance (equivalent to optionsOnly=true behavior).
 *
 * @param params - Configuration parameters
 * @returns Promise resolving to OpenAI configuration options
 * @throws Error if API key is missing or user key has expired
 */
export async function initializeOpenAI({
  req,
  endpoint,
  model_parameters,
  db,
}: BaseInitializeParams): Promise<InitializeResultBase> {
  const appConfig = req.config;
  const openAIConfig = appConfig?.endpoints?.[EModelEndpoint.openAI];
  const allConfig = appConfig?.endpoints?.all;
  const { PROXY, OPENAI_API_KEY, AZURE_API_KEY, OPENAI_REVERSE_PROXY, AZURE_OPENAI_BASEURL } =
    process.env;

  const { key: expiresAt } = req.body;
  const modelName = model_parameters?.model as string | undefined;

  const credentials = {
    [EModelEndpoint.openAI]: OPENAI_API_KEY,
    [EModelEndpoint.azureOpenAI]: AZURE_API_KEY,
  };

  const baseURLOptions = {
    [EModelEndpoint.openAI]: OPENAI_REVERSE_PROXY,
    [EModelEndpoint.azureOpenAI]: AZURE_OPENAI_BASEURL,
  };

  const userProvidesKey = isUserProvided(credentials[endpoint as keyof typeof credentials]);
  const userProvidesURL = isUserProvided(baseURLOptions[endpoint as keyof typeof baseURLOptions]);

  let userValues: UserKeyValues | null = null;
  if (expiresAt && (userProvidesKey || userProvidesURL)) {
    checkUserKeyExpiry(expiresAt, endpoint);
    userValues = await db.getUserKeyValues({ userId: req.user?.id ?? '', name: endpoint });
  }

  let apiKey = userProvidesKey
    ? userValues?.apiKey
    : credentials[endpoint as keyof typeof credentials];
  const baseURL = userProvidesURL
    ? userValues?.baseURL
    : baseURLOptions[endpoint as keyof typeof baseURLOptions];

  const clientOptions: OpenAIConfigOptions = {
    proxy: PROXY ?? undefined,
    reverseProxyUrl: baseURL || undefined,
    baseURLIsUserProvided: userProvidesURL,
    allowedAddresses: appConfig?.endpoints?.allowedAddresses,
    streaming: true,
  };

  /**
   * Custom headers are forwarded only when the destination URL is admin-trusted.
   * When the user supplies the base URL, withhold them — they may carry
   * `${SECRET}` gateway values or user/OpenID token placeholders resolved later
   * by `resolveConfigHeaders`, which must not reach a user-controlled endpoint.
   */
  const trustedURL = !userProvidesURL;
  const globalHeaders = trustedURL ? allConfig?.headers : undefined;
  const openAIHeaders = trustedURL
    ? mergeHeaders(allConfig?.headers, openAIConfig?.headers)
    : undefined;

  const isAzureOpenAI = endpoint === EModelEndpoint.azureOpenAI;
  const azureConfig = isAzureOpenAI && appConfig?.endpoints?.[EModelEndpoint.azureOpenAI];
  let isServerless = false;
  let standardTokenConfig: EndpointTokenConfig | undefined;
  let priorityTokenConfig: EndpointTokenConfig[string] | undefined;
  let selectedAzureDeployment: string | undefined;

  if (isAzureOpenAI && azureConfig) {
    const { modelGroupMap, groupMap } = azureConfig;
    const {
      azureOptions,
      baseURL: configBaseURL,
      headers = {},
      serverless,
      tokenConfig,
    } = mapModelToAzureConfig({
      modelName: modelName || '',
      modelGroupMap,
      groupMap,
      serviceTier: model_parameters?.priorityProcessing === true ? 'priority' : 'default',
    });
    isServerless = serverless === true;
    standardTokenConfig = azureConfig.tokenConfig
      ? Object.fromEntries(
          Object.entries(azureConfig.tokenConfig).map(([model, rates]) => [
            model,
            toBillingTokenRates(rates),
          ]),
        )
      : undefined;
    priorityTokenConfig = tokenConfig ? toBillingTokenRates(tokenConfig) : undefined;
    selectedAzureDeployment = azureOptions.azureOpenAIApiDeploymentName;

    clientOptions.reverseProxyUrl = configBaseURL ?? clientOptions.reverseProxyUrl;
    if (configBaseURL) {
      clientOptions.baseURLIsUserProvided = false;
    }
    clientOptions.headers = resolveHeaders({
      headers: { ...headers, ...(clientOptions.headers ?? {}) },
      user: req.user,
    });
    /** `endpoints.all` headers apply globally, but stay unresolved here — they are
     *  resolved once at request time by `resolveConfigHeaders`. Resolving them now
     *  (in addition) would re-expand already-substituted user values, violating the
     *  env-before-user invariant. Azure-managed headers stay authoritative. */
    if (globalHeaders) {
      clientOptions.headers = mergeHeaders(globalHeaders, clientOptions.headers);
    }

    const groupName = modelGroupMap[modelName || '']?.group;
    if (groupName && groupMap[groupName]) {
      clientOptions.addParams = groupMap[groupName]?.addParams;
      clientOptions.dropParams = groupMap[groupName]?.dropParams;
    }

    apiKey = azureOptions.azureOpenAIApiKey;
    clientOptions.azure = !isServerless ? azureOptions : undefined;

    if (isServerless) {
      clientOptions.defaultQuery = azureOptions.azureOpenAIApiVersion
        ? { 'api-version': azureOptions.azureOpenAIApiVersion }
        : undefined;

      if (!clientOptions.headers) {
        clientOptions.headers = {};
      }
      clientOptions.headers['api-key'] = apiKey;
    }
  } else if (isAzureOpenAI) {
    clientOptions.azure =
      userProvidesKey && userValues?.apiKey ? JSON.parse(userValues.apiKey) : getAzureCredentials();
    apiKey = clientOptions.azure ? clientOptions.azure.azureOpenAIApiKey : undefined;
    /** Env-var Azure path has no per-model headers; still honor global `all` headers. */
    if (globalHeaders) {
      clientOptions.headers = { ...globalHeaders };
    }
  } else {
    /**
     * Attach admin-configured custom headers for the built-in OpenAI endpoint
     * (endpoint over global `all`). Kept unresolved here so request-body
     * placeholders resolve at request time via `resolveConfigHeaders`.
     */
    if (openAIHeaders) {
      clientOptions.headers = openAIHeaders;
    }
  }

  if (clientOptions.baseURLIsUserProvided && clientOptions.reverseProxyUrl) {
    await validateEndpointURL(
      clientOptions.reverseProxyUrl,
      endpoint,
      appConfig?.endpoints?.allowedAddresses,
    );
  }

  if (userProvidesKey && !apiKey) {
    throw new Error(
      JSON.stringify({
        type: ErrorTypes.NO_USER_KEY,
      }),
    );
  }

  if (!apiKey) {
    throw new Error(`${endpoint} API Key not provided.`);
  }

  const isGPT56 = /^gpt-5\.6(?:-|$)/i.test(modelName ?? '');
  const officialOpenAI =
    endpoint === EModelEndpoint.openAI &&
    (!baseURL || /^https:\/\/api\.openai\.com(?:\/|$)/i.test(baseURL));
  const firstPartyAzure = isAzureOpenAI && !isServerless;
  const managedIdentityEnabled = isGPT56 && (officialOpenAI || firstPartyAzure);
  const userId = req.user?.id ?? '';
  const tenantId = req.user?.tenantId;
  const promptCacheEnabled = model_parameters?.promptCache === true;
  const stablePromptIdentity = getStablePromptIdentity(
    req.body as Record<string, unknown>,
    model_parameters,
  );

  const modelOptions = {
    ...(model_parameters ?? {}),
    model: modelName,
    user: userId,
    firstPartyOpenAI: managedIdentityEnabled,
    ...(managedIdentityEnabled && {
      safety_identifier: createOpenAIIdentifier('safety', [tenantId, userId]),
    }),
    ...(managedIdentityEnabled &&
      promptCacheEnabled && {
        promptCacheKey: createOpenAIIdentifier('cache', [
          tenantId,
          userId,
          endpoint,
          modelName,
          stablePromptIdentity,
        ]),
        promptCacheExplicit: officialOpenAI,
      }),
  };

  const finalClientOptions: OpenAIConfigOptions = {
    ...clientOptions,
    modelOptions,
  };

  const options = getOpenAIConfig(apiKey, finalClientOptions, endpoint);

  /** Set useLegacyContent for Azure serverless deployments */
  if (isServerless) {
    (options as InitializeResultBase).useLegacyContent = true;
  }

  const azureRate = modelName?.includes('gpt-4') ? 30 : 17;

  let streamRate: number | undefined;

  if (isAzureOpenAI && azureConfig) {
    streamRate = azureConfig.streamRate ?? azureRate;
  } else if (!isAzureOpenAI && openAIConfig) {
    streamRate = openAIConfig.streamRate;
  }

  if (allConfig?.streamRate) {
    streamRate = allConfig.streamRate;
  }

  if (streamRate) {
    options.llmConfig._lc_stream_delay = streamRate;
  }

  if (standardTokenConfig || (modelName && priorityTokenConfig)) {
    const standardModelRates = modelName ? standardTokenConfig?.[modelName] : undefined;
    options.endpointTokenConfig = {
      ...(standardTokenConfig ?? {}),
      ...(modelName && priorityTokenConfig
        ? { [`${modelName}:priority`]: priorityTokenConfig }
        : {}),
      ...(selectedAzureDeployment && standardModelRates
        ? { [selectedAzureDeployment]: standardModelRates }
        : {}),
      ...(selectedAzureDeployment && priorityTokenConfig
        ? { [`${selectedAzureDeployment}:priority`]: priorityTokenConfig }
        : {}),
    };
  }

  return options;
}
