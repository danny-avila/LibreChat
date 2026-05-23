import { HttpsProxyAgent } from 'https-proxy-agent';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import {
  AuthType,
  EModelEndpoint,
  extractEnvVariable,
  bedrockInputParser,
  bedrockOutputParser,
  removeNullishValues,
} from 'librechat-data-provider';
import type {
  BaseInitializeParams,
  InitializeResultBase,
  BedrockCredentials,
  GuardrailConfiguration,
  InferenceProfileConfig,
} from '~/types';
import { checkUserKeyExpiry } from '~/utils';

/**
 * Initializes Bedrock endpoint configuration.
 *
 * This module handles configuration for AWS Bedrock endpoints, including support for
 * HTTP/HTTPS proxies and reverse proxies.
 *
 * Proxy Support:
 * - When the PROXY environment variable is set, creates a custom BedrockRuntimeClient
 *   with an HttpsProxyAgent to route all Bedrock API calls through the specified proxy
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
export async function initializeBedrock({
  req,
  endpoint,
  model_parameters,
  db,
}: BaseInitializeParams): Promise<InitializeResultBase> {
  void endpoint;
  const appConfig = req.config;
  const bedrockConfig = appConfig?.endpoints?.[EModelEndpoint.bedrock] as
    | ({
        guardrailConfig?: GuardrailConfiguration;
        inferenceProfiles?: InferenceProfileConfig;
      } & Record<string, unknown>)
    | undefined;

  const {
    BEDROCK_AWS_SECRET_ACCESS_KEY,
    BEDROCK_AWS_ACCESS_KEY_ID,
    BEDROCK_AWS_SESSION_TOKEN,
    BEDROCK_AWS_PROFILE,
    BEDROCK_REVERSE_PROXY,
    BEDROCK_AWS_DEFAULT_REGION,
    PROXY,
  } = process.env;

  const { key: expiresAt } = req.body;
  const isUserProvided = BEDROCK_AWS_SECRET_ACCESS_KEY === AuthType.USER_PROVIDED;

  const hasAccessKey = BEDROCK_AWS_ACCESS_KEY_ID != null && BEDROCK_AWS_ACCESS_KEY_ID !== '';
  const hasSecretKey =
    BEDROCK_AWS_SECRET_ACCESS_KEY != null && BEDROCK_AWS_SECRET_ACCESS_KEY !== '';

  let credentials: BedrockCredentials | undefined;

  if (isUserProvided) {
    const userKey = await db.getUserKey({
      userId: req.user?.id ?? '',
      name: EModelEndpoint.bedrock,
    });

    if (!userKey) {
      throw new Error('Bedrock credentials not provided. Please provide them again.');
    }

    credentials = JSON.parse(userKey) as BedrockCredentials;

    if (expiresAt) {
      checkUserKeyExpiry(expiresAt, EModelEndpoint.bedrock);
    }
  } else if (hasAccessKey !== hasSecretKey) {
    throw new Error(
      'Both BEDROCK_AWS_ACCESS_KEY_ID and BEDROCK_AWS_SECRET_ACCESS_KEY must be provided together.',
    );
  } else if (hasAccessKey && hasSecretKey) {
    credentials = {
      accessKeyId: BEDROCK_AWS_ACCESS_KEY_ID,
      secretAccessKey: BEDROCK_AWS_SECRET_ACCESS_KEY,
      ...(BEDROCK_AWS_SESSION_TOKEN && { sessionToken: BEDROCK_AWS_SESSION_TOKEN }),
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

  if (bedrockConfig?.guardrailConfig) {
    llmConfig.guardrailConfig = {
      ...bedrockConfig.guardrailConfig,
      guardrailIdentifier: extractEnvVariable(bedrockConfig.guardrailConfig.guardrailIdentifier),
      guardrailVersion: extractEnvVariable(bedrockConfig.guardrailConfig.guardrailVersion),
    };
  }

  const model = model_parameters?.model as string | undefined;
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

  if (PROXY) {
    const proxyAgent = new HttpsProxyAgent(PROXY);
    const credentialProvider =
      !hasCompleteCredentials && BEDROCK_AWS_PROFILE
        ? fromNodeProviderChain({ profile: BEDROCK_AWS_PROFILE })
        : undefined;

    // Create a custom BedrockRuntimeClient with proxy-enabled request handler.
    // ChatBedrockConverse will use this pre-configured client directly instead of
    // creating its own. Credentials are only set if explicitly provided; otherwise
    // the AWS SDK's default credential provider chain is used (instance profiles,
    // AWS profiles, environment variables, etc.)
    const customClient = new BedrockRuntimeClient({
      region: (llmConfig.region as string) ?? BEDROCK_AWS_DEFAULT_REGION,
      ...(hasCompleteCredentials && {
        credentials: credentials as { accessKeyId: string; secretAccessKey: string },
      }),
      ...(!hasCompleteCredentials && credentialProvider && { credentials: credentialProvider }),
      requestHandler: new NodeHttpHandler({
        httpAgent: proxyAgent,
        httpsAgent: proxyAgent,
      }),
      ...(BEDROCK_REVERSE_PROXY && {
        endpoint: `https://${BEDROCK_REVERSE_PROXY}`,
      }),
    });

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
