import type { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import type { AwsCredentialIdentity } from '@aws-sdk/types';
import type { BedrockConverseInput } from 'librechat-data-provider';

/**
 * AWS credentials for Bedrock
 * Extends AWS AwsCredentialIdentity to ensure compatibility
 */
export type BedrockCredentials = Partial<AwsCredentialIdentity>;

/**
 * Configuration options for Bedrock LLM
 */
export interface BedrockConfigOptions {
  modelOptions?: Partial<BedrockConverseInput>;
  /** AWS region for Bedrock */
  region?: string;
  /** Optional pre-configured Bedrock client (used with proxy) */
  client?: BedrockRuntimeClient;
  /** AWS credentials */
  credentials?: BedrockCredentials;
  /** Custom endpoint host for reverse proxy */
  endpointHost?: string;
}

/**
 * Return type for Bedrock getOptions function
 */
export interface BedrockLLMConfigResult {
  llmConfig: BedrockConverseInput & {
    region?: string;
    client?: BedrockRuntimeClient;
    credentials?: BedrockCredentials;
    endpointHost?: string;
  };
  configOptions: Record<string, unknown>;
}
