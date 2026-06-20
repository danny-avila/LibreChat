import { NodeHttpHandler } from '@smithy/node-http-handler';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import {
  AuthType,
  EModelEndpoint,
  extractEnvVariable,
  bedrockInputParser,
  stripAgentIdSuffix,
  bedrockOutputParser,
  removeNullishValues,
} from 'librechat-data-provider';
import type { BedrockRuntimeClientConfig } from '@aws-sdk/client-bedrock-runtime';
import type {
  GuardrailScope,
  BaseInitializeParams,
  InitializeResultBase,
  BedrockCredentials,
  GuardrailConfiguration,
  InferenceProfileConfig,
  ScopedGuardrailConfiguration,
} from '~/types';
import { getHttpsProxyAgent } from '~/utils/proxy';
import { checkUserKeyExpiry } from '~/utils';

const BEDROCK_CREDENTIALS_ERROR = 'Bedrock credentials not provided. Please provide them again.';

type UserCredentialKey = 'accessKeyId' | 'secretAccessKey' | 'sessionToken' | 'bearerToken';
type UserCredentialValue = string | number | boolean | object | null;
type ParsedBedrockUserCredentials = Partial<Record<UserCredentialKey, UserCredentialValue>> & {
  apiKey?: string;
};

function getBedrockProxyTarget(region?: string, reverseProxy?: string): string | undefined {
  const trimmedReverseProxy = reverseProxy?.trim();
  if (trimmedReverseProxy) return `https://${trimmedReverseProxy}`;

  const trimmedRegion = region?.trim();
  if (!trimmedRegion) return undefined;

  return `https://bedrock-runtime.${trimmedRegion}.amazonaws.com`;
}

function isParsedBedrockUserCredentials(value: unknown): value is ParsedBedrockUserCredentials {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function parseBedrockUserCredentials(userKey: string): ParsedBedrockUserCredentials {
  const storedCredentials = JSON.parse(userKey) as unknown;
  if (!isParsedBedrockUserCredentials(storedCredentials)) {
    throw new Error(BEDROCK_CREDENTIALS_ERROR);
  }

  if (typeof storedCredentials.apiKey !== 'string') {
    return storedCredentials;
  }

  const nestedCredentials = JSON.parse(storedCredentials.apiKey) as unknown;
  if (!isParsedBedrockUserCredentials(nestedCredentials)) {
    throw new Error(BEDROCK_CREDENTIALS_ERROR);
  }

  return nestedCredentials;
}

function getUserCredentialValue(
  credentials: ParsedBedrockUserCredentials,
  key: UserCredentialKey,
): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(credentials, key)) {
    return undefined;
  }

  const value = credentials[key];
  if (value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(BEDROCK_CREDENTIALS_ERROR);
  }

  return value;
}

/**
 * Initializes Bedrock endpoint configuration.
 *
 * This module handles configuration for AWS Bedrock endpoints, including support for
 * HTTP/HTTPS proxies and reverse proxies.
 *
 * Proxy Support:
 * - When proxy env vars are set, creates a custom BedrockRuntimeClient
 *   with an HttpsProxyAgent to route Bedrock API calls through the resolved proxy
 * - The custom client is fully configured with credentials, region, and endpoint,
 *   and is passed directly to ChatBedrockConverse via the 'client' parameter
 *
 * Reverse Proxy Support:
 * - When BEDROCK_REVERSE_PROXY is set, routes Bedrock API calls through a custom endpoint
 * - Works with or without the PROXY setting
 *
 * Without Proxy:
 * - Credentials and endpoint configuration are passed separately to ChatBedrockConverse,
 *   which creates its own BedrockRuntimeClient internally
 *
 * @param params - Configuration parameters
 * @returns Promise resolving to Bedrock configuration options
 * @throws Error if credentials are not provided when required
 */
/**
 * Matches a model id against a pattern. A pattern without `*` is an exact match;
 * `*` is a wildcard for any sequence (anchored full-match), so
 * `*claude-sonnet-4-6*` matches `us.anthropic.claude-sonnet-4-6-v1:0`. All other
 * characters (including `.`) are matched literally.
 */
function modelMatchesPattern(model: string, pattern: string): boolean {
  if (!pattern.includes('*')) {
    return model === pattern;
  }
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(model);
}

/**
 * Determines whether the admin's global guardrail applies to this request.
 * Each `appliesTo` filter is optional; when present, the request must match it.
 * `models` entries support `*` wildcards; `agentIds` are matched exactly.
 * An empty/absent scope applies the guardrail to every Bedrock conversation.
 */
function guardrailConfigApplies(
  scope: GuardrailScope | undefined,
  agentId: string | undefined,
  model: string | undefined,
): boolean {
  if (!scope) {
    return true;
  }
  if (scope.agentIds?.length && (agentId == null || !scope.agentIds.includes(agentId))) {
    return false;
  }
  if (
    scope.models?.length &&
    (model == null || !scope.models.some((pattern) => modelMatchesPattern(model, pattern)))
  ) {
    return false;
  }
  return true;
}

export async function initializeBedrock({
  req,
  endpoint,
  model_parameters,
  agentId,
  db,
}: BaseInitializeParams): Promise<InitializeResultBase> {
  void endpoint;
  const appConfig = req.config;
  const bedrockConfig = appConfig?.endpoints?.[EModelEndpoint.bedrock] as
    | ({
        guardrailConfig?: ScopedGuardrailConfiguration;
        inferenceProfiles?: InferenceProfileConfig;
      } & Record<string, unknown>)
    | undefined;

  const {
    BEDROCK_AWS_SECRET_ACCESS_KEY,
    BEDROCK_AWS_ACCESS_KEY_ID,
    BEDROCK_AWS_SESSION_TOKEN,
    BEDROCK_AWS_PROFILE,
    BEDROCK_AWS_BEARER_TOKEN,
    BEDROCK_REVERSE_PROXY,
    BEDROCK_AWS_DEFAULT_REGION,
  } = process.env;

  const { key: expiresAt } = req.body;
  const userProvidesAccessKeyId = BEDROCK_AWS_ACCESS_KEY_ID === AuthType.USER_PROVIDED;
  const userProvidesSecretAccessKey = BEDROCK_AWS_SECRET_ACCESS_KEY === AuthType.USER_PROVIDED;
  const userProvidesSessionToken = BEDROCK_AWS_SESSION_TOKEN === AuthType.USER_PROVIDED;
  const userProvidesBearerToken = BEDROCK_AWS_BEARER_TOKEN === AuthType.USER_PROVIDED;
  const isUserProvided =
    userProvidesAccessKeyId ||
    userProvidesSecretAccessKey ||
    userProvidesSessionToken ||
    userProvidesBearerToken;
  const staticAccessKeyId = userProvidesAccessKeyId ? undefined : BEDROCK_AWS_ACCESS_KEY_ID;
  const staticSecretAccessKey = userProvidesSecretAccessKey
    ? undefined
    : BEDROCK_AWS_SECRET_ACCESS_KEY;
  const staticSessionToken = userProvidesSessionToken ? undefined : BEDROCK_AWS_SESSION_TOKEN;
  const staticBearerToken = userProvidesBearerToken ? undefined : BEDROCK_AWS_BEARER_TOKEN;

  const hasAccessKey = staticAccessKeyId != null && staticAccessKeyId !== '';
  const hasSecretKey = staticSecretAccessKey != null && staticSecretAccessKey !== '';

  let credentials: BedrockCredentials | undefined;
  let bearerToken: string | undefined;

  if (isUserProvided) {
    const userKey = await db.getUserKey({
      userId: req.user?.id ?? '',
      name: EModelEndpoint.bedrock,
    });

    if (!userKey) {
      throw new Error(BEDROCK_CREDENTIALS_ERROR);
    }

    let userCredentials: ParsedBedrockUserCredentials;
    try {
      userCredentials = parseBedrockUserCredentials(userKey);
    } catch {
      throw new Error(BEDROCK_CREDENTIALS_ERROR);
    }

    const userBearerToken = userProvidesBearerToken
      ? getUserCredentialValue(userCredentials, 'bearerToken')
      : undefined;

    if (userBearerToken) {
      bearerToken = userBearerToken;
    } else {
      const canUseAccessKeys =
        userProvidesAccessKeyId || userProvidesSecretAccessKey || userProvidesSessionToken;
      const accessKeyId = userProvidesAccessKeyId
        ? getUserCredentialValue(userCredentials, 'accessKeyId')
        : staticAccessKeyId;
      const secretAccessKey = userProvidesSecretAccessKey
        ? getUserCredentialValue(userCredentials, 'secretAccessKey')
        : staticSecretAccessKey;
      const sessionToken = userProvidesSessionToken
        ? getUserCredentialValue(userCredentials, 'sessionToken')
        : staticSessionToken;

      if (!canUseAccessKeys || !accessKeyId || !secretAccessKey) {
        throw new Error(BEDROCK_CREDENTIALS_ERROR);
      }

      credentials = {
        accessKeyId,
        secretAccessKey,
        ...(sessionToken && { sessionToken }),
      };
    }

    if (expiresAt) {
      checkUserKeyExpiry(expiresAt, EModelEndpoint.bedrock);
    }
  } else if (staticBearerToken) {
    bearerToken = staticBearerToken;
  } else if (hasAccessKey !== hasSecretKey) {
    throw new Error(
      'Both BEDROCK_AWS_ACCESS_KEY_ID and BEDROCK_AWS_SECRET_ACCESS_KEY must be provided together.',
    );
  } else if (hasAccessKey && hasSecretKey) {
    credentials = {
      accessKeyId: staticAccessKeyId,
      secretAccessKey: staticSecretAccessKey,
      ...(staticSessionToken && { sessionToken: staticSessionToken }),
    };
  }

  const requestOptions: Record<string, unknown> = {
    model: model_parameters?.model as string | undefined,
    region: BEDROCK_AWS_DEFAULT_REGION,
  };

  const configOptions: Record<string, unknown> = {};

  const llmConfig = bedrockOutputParser(
    bedrockInputParser.parse(
      removeNullishValues({
        ...requestOptions,
        ...(model_parameters ?? {}),
      }),
    ),
  ) as InitializeResultBase['llmConfig'] & {
    model?: string;
    region?: string;
    client?: BedrockRuntimeClient;
    credentials?: BedrockCredentials;
    endpointHost?: string;
    profile?: string;
    guardrailConfig?: GuardrailConfiguration;
    applicationInferenceProfile?: string;
  };

  const model = model_parameters?.model as string | undefined;
  const guardrailConfig = bedrockConfig?.guardrailConfig;
  const rawAgentId = agentId ?? (req.body as { agent_id?: string } | undefined)?.agent_id;
  /** Strip the parallel/added-run suffix (`____N`) so the base id matches admin-configured `appliesTo.agentIds`. */
  const scopedAgentId = rawAgentId != null ? stripAgentIdSuffix(rawAgentId) : undefined;
  if (guardrailConfig && guardrailConfigApplies(guardrailConfig.appliesTo, scopedAgentId, model)) {
    llmConfig.guardrailConfig = {
      guardrailIdentifier: extractEnvVariable(guardrailConfig.guardrailIdentifier),
      guardrailVersion: extractEnvVariable(guardrailConfig.guardrailVersion),
      ...(guardrailConfig.trace != null && { trace: guardrailConfig.trace }),
      ...(guardrailConfig.streamProcessingMode != null && {
        streamProcessingMode: guardrailConfig.streamProcessingMode,
      }),
    };
  }

  if (model && bedrockConfig?.inferenceProfiles?.[model]) {
    const applicationInferenceProfile = extractEnvVariable(bedrockConfig.inferenceProfiles[model]);
    llmConfig.applicationInferenceProfile = applicationInferenceProfile;
  }

  /** Only include credentials if they're complete (accessKeyId and secretAccessKey are both set) */
  const hasCompleteCredentials =
    credentials &&
    typeof credentials.accessKeyId === 'string' &&
    credentials.accessKeyId !== '' &&
    typeof credentials.secretAccessKey === 'string' &&
    credentials.secretAccessKey !== '';
  const hasBearerToken = typeof bearerToken === 'string' && bearerToken !== '';

  const bedrockRegion = typeof llmConfig.region === 'string' ? llmConfig.region : undefined;
  const proxyAgent = getHttpsProxyAgent(
    getBedrockProxyTarget(bedrockRegion, BEDROCK_REVERSE_PROXY),
  );
  if (proxyAgent || hasBearerToken) {
    const credentialProvider =
      !hasCompleteCredentials && !hasBearerToken && BEDROCK_AWS_PROFILE
        ? fromNodeProviderChain({ profile: BEDROCK_AWS_PROFILE })
        : undefined;

    // Create a custom BedrockRuntimeClient for proxy routing or Bedrock API keys.
    // ChatBedrockConverse will use this pre-configured client directly instead of
    // creating its own. Credentials are only set if explicitly provided; otherwise
    // the AWS SDK's default credential provider chain is used (instance profiles,
    // AWS profiles, environment variables, etc.)
    const customClientConfig: BedrockRuntimeClientConfig = {
      region: (llmConfig.region as string) ?? BEDROCK_AWS_DEFAULT_REGION,
    };

    if (hasBearerToken && bearerToken) {
      customClientConfig.token = { token: bearerToken };
      customClientConfig.authSchemePreference = ['httpBearerAuth'];
    } else if (hasCompleteCredentials) {
      customClientConfig.credentials = credentials as {
        accessKeyId: string;
        secretAccessKey: string;
      };
    } else if (credentialProvider) {
      customClientConfig.credentials = credentialProvider;
    }

    if (proxyAgent) {
      customClientConfig.requestHandler = new NodeHttpHandler({
        httpAgent: proxyAgent,
        httpsAgent: proxyAgent,
      });
    }

    if (BEDROCK_REVERSE_PROXY) {
      customClientConfig.endpoint = `https://${BEDROCK_REVERSE_PROXY}`;
    }

    const customClient = new BedrockRuntimeClient(customClientConfig);

    llmConfig.client = customClient;
  } else {
    // When not using a proxy, let ChatBedrockConverse create its own client
    // by providing credentials and endpoint separately
    if (credentials) {
      llmConfig.credentials = credentials;
    }

    if (!credentials && BEDROCK_AWS_PROFILE) {
      llmConfig.profile = BEDROCK_AWS_PROFILE;
    }

    if (BEDROCK_REVERSE_PROXY) {
      llmConfig.endpointHost = BEDROCK_REVERSE_PROXY;
    }
  }

  return {
    llmConfig,
    configOptions,
  };
}
