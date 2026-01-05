import type { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import type { AwsCredentialIdentity } from '@aws-sdk/types';
import type { BedrockConverseInput } from 'librechat-data-provider';

/**
 * AWS credentials for Bedrock
 * Extends AWS AwsCredentialIdentity to ensure compatibility
 */
export type BedrockCredentials = Partial<AwsCredentialIdentity>;

/**
 * AWS Bedrock Guardrail configuration
 * @see https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_GuardrailConfiguration.html
 */
export interface GuardrailConfiguration {
  /** The identifier for the guardrail (ID or ARN) */
  guardrailIdentifier: string;
  /** The version of the guardrail (version number or "DRAFT") */
  guardrailVersion: string;
  /** The trace behavior for the guardrail */
  trace?: 'enabled' | 'disabled' | 'enabled_full';
}

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
  /** Guardrail configuration for content filtering */
  guardrailConfig?: GuardrailConfiguration;
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
    guardrailConfig?: GuardrailConfiguration;
  };
  configOptions: Record<string, unknown>;
}
