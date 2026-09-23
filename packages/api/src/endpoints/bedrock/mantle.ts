import { Providers } from '@librechat/agents';
import { getToken } from '@aws/bedrock-token-generator';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import type { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@smithy/types';
import type { BedrockConverseInput } from 'librechat-data-provider';
import type { BedrockCredentials, InitializeResultBase } from '~/types';
import { getOpenAIConfig } from '~/endpoints/openai/config';

const mantleModelPattern = /^openai\.(?!gpt-oss)/;

/** AWS region names are lowercase alphanumerics and hyphens (e.g. `us-east-2`).
 *  The request-supplied region is interpolated into the credential-bearing
 *  `baseURL` host, so anything else must be rejected to prevent URL breakout. */
const awsRegionPattern = /^[a-z0-9-]+$/;

/**
 * OpenAI models on Amazon Bedrock (GPT-5.5, Codex, etc.) are served exclusively
 * through the `bedrock-mantle` endpoint's OpenAI-compatible Responses API — they
 * support neither the Converse nor the Invoke API, so they cannot go through
 * `ChatBedrockConverse`. The exception is the open-weight `openai.gpt-oss-*`
 * family, which is Converse-compatible and stays on the default Bedrock path.
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-55.html
 */
export function isBedrockMantleModel(model?: string): boolean {
  return model != null && mantleModelPattern.test(model);
}

/**
 * In-Region `bedrock-mantle` endpoint URL serving the OpenAI-compatible API.
 * When `BEDROCK_REVERSE_PROXY` is configured, it replaces the AWS host — same
 * as the Converse path — so gateway-only deployments keep working and the
 * bearer token never bypasses the gateway; the `/openai/v1` path is preserved.
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/endpoints.html
 */
export function getBedrockMantleBaseURL(region: string, reverseProxy?: string): string {
  const trimmedReverseProxy = reverseProxy?.trim();
  const host = trimmedReverseProxy || `bedrock-mantle.${region}.api.aws`;
  return `https://${host}/openai/v1`;
}

/**
 * Model options that translate directly to the OpenAI-compatible API. Bedrock
 * Converse-specific parameters (`thinking`, `promptCache`, `topK`,
 * `additionalModelRequestFields`, etc.) are intentionally excluded so they
 * never leak into the Responses API request body.
 */
const mantleModelOptionKeys: readonly (keyof BedrockConverseInput)[] = [
  'model',
  'maxTokens',
  'temperature',
  'topP',
  'stop',
  'reasoning_effort',
];

export interface BedrockMantleParams {
  model_parameters?: Partial<BedrockConverseInput>;
  /** Static or user-provided AWS credentials resolved by `initializeBedrock` */
  credentials?: BedrockCredentials;
  /** Pre-issued Bedrock API key (long-term key or user-provided bearer token) */
  bearerToken?: string;
  /** AWS profile name (`BEDROCK_AWS_PROFILE`) for the default credential chain */
  profile?: string;
  /** Fallback region (`BEDROCK_AWS_DEFAULT_REGION`) when the request has none */
  defaultRegion?: string;
  /** Reverse-proxy host (`BEDROCK_REVERSE_PROXY`) replacing the AWS endpoint */
  reverseProxy?: string;
  userId?: string;
}

function resolveTokenCredentials({
  credentials,
  profile,
}: Pick<BedrockMantleParams, 'credentials' | 'profile'>):
  | AwsCredentialIdentity
  | AwsCredentialIdentityProvider {
  if (credentials?.accessKeyId && credentials?.secretAccessKey) {
    return credentials as AwsCredentialIdentity;
  }
  return fromNodeProviderChain(profile ? { profile } : undefined);
}

/**
 * Initializes an OpenAI-compatible client configuration for OpenAI models on
 * Amazon Bedrock (`bedrock-mantle`).
 *
 * Authentication uses a Bedrock API key sent as a plain bearer token — no
 * SigV4 signing of individual requests is involved. When no static key
 * (`BEDROCK_AWS_BEARER_TOKEN` or a user-provided one) is available, a
 * short-term key is minted from the resolved AWS credentials via the official
 * `@aws/bedrock-token-generator`, which AWS recommends over long-term keys for
 * production. Minting is a local SigV4 presign (no network call), and a fresh
 * token per initialization keeps it within both the 12h token cap and the
 * credentials' own expiry.
 *
 * The Responses API is forced on: `bedrock-mantle` does not serve these models
 * over Chat Completions.
 */
export async function initializeBedrockMantle({
  model_parameters,
  credentials,
  bearerToken,
  profile,
  defaultRegion,
  reverseProxy,
  userId,
}: BedrockMantleParams): Promise<InitializeResultBase> {
  const requestRegion =
    typeof model_parameters?.region === 'string' ? model_parameters.region.trim() : undefined;
  const region = (requestRegion !== '' ? requestRegion : undefined) ?? defaultRegion;
  if (!region) {
    throw new Error(
      'An AWS region is required for OpenAI models on Bedrock (bedrock-mantle). Set BEDROCK_AWS_DEFAULT_REGION or select a region.',
    );
  }
  if (!awsRegionPattern.test(region)) {
    throw new Error('Invalid AWS region for OpenAI models on Bedrock (bedrock-mantle).');
  }

  const apiKey =
    bearerToken ??
    (await getToken({
      credentials: resolveTokenCredentials({ credentials, profile }),
      region,
    }));

  /** `useResponsesApi` is part of the model options so reasoning params are
   *  shaped for the Responses API — `bedrock-mantle` does not serve these
   *  models over Chat Completions. */
  const modelOptions: Record<string, unknown> = { useResponsesApi: true };
  if (userId) {
    modelOptions.user = userId;
  }
  for (const key of mantleModelOptionKeys) {
    const value = model_parameters?.[key];
    if (value != null) {
      modelOptions[key] = value;
    }
  }

  const options = getOpenAIConfig(apiKey, {
    reverseProxyUrl: getBedrockMantleBaseURL(region, reverseProxy),
    modelOptions,
    proxy: process.env.PROXY ?? undefined,
    streaming: true,
  });

  return {
    ...options,
    provider: Providers.OPENAI,
  };
}
