import logger from '~/config/winston';
import { EModelEndpoint, extractEnvVariable, envVarRegex } from 'librechat-data-provider';
import type {
  TCustomConfig,
  TVertexAISchema,
  TVertexAIConfig,
  TAnthropicEndpoint,
} from 'librechat-data-provider';

/**
 * Default Vertex AI models available through Google Cloud
 * These are the standard Anthropic model names as served by Vertex AI
 */
export const defaultVertexModels = [
  'claude-sonnet-4-20250514',
  'claude-3-7-sonnet-20250219',
  'claude-3-5-sonnet-v2@20241022',
  'claude-3-5-sonnet@20240620',
  'claude-3-5-haiku@20241022',
  'claude-3-opus@20240229',
  'claude-3-haiku@20240307',
];

/**
 * Validates and processes Vertex AI configuration
 * @param vertexConfig - The Vertex AI configuration object
 * @returns Validated configuration with errors if any
 */
export function validateVertexConfig(
  vertexConfig: TVertexAISchema | undefined,
): TVertexAIConfig | null {
  if (!vertexConfig) {
    return null;
  }

  const errors: string[] = [];

  // Extract and validate environment variables
  // projectId is optional - will be auto-detected from service key if not provided
  const projectId = vertexConfig.projectId ? extractEnvVariable(vertexConfig.projectId) : undefined;
  const region = extractEnvVariable(vertexConfig.region || 'us-east5');
  const serviceKeyFile = vertexConfig.serviceKeyFile
    ? extractEnvVariable(vertexConfig.serviceKeyFile)
    : undefined;

  // Check for unresolved environment variables
  if (projectId && envVarRegex.test(projectId)) {
    errors.push(
      `Vertex AI projectId environment variable "${vertexConfig.projectId}" was not found.`,
    );
  }

  if (envVarRegex.test(region)) {
    errors.push(`Vertex AI region environment variable "${vertexConfig.region}" was not found.`);
  }

  if (serviceKeyFile && envVarRegex.test(serviceKeyFile)) {
    errors.push(
      `Vertex AI serviceKeyFile environment variable "${vertexConfig.serviceKeyFile}" was not found.`,
    );
  }

  // Note: projectId is optional - if not provided, it will be auto-detected from the service key file

  const isValid = errors.length === 0;

  return {
    enabled: vertexConfig.enabled ?? false,
    projectId,
    region,
    serviceKeyFile,
    models: vertexConfig.models || defaultVertexModels,
    isValid,
    errors,
  };
}

/**
 * Sets up the Vertex AI configuration from the config (`librechat.yaml`) file.
 * Similar to azureConfigSetup, this processes and validates the Vertex AI configuration.
 * @param config - The loaded custom configuration.
 * @returns The validated Vertex AI configuration or null if not configured.
 */
export function vertexConfigSetup(config: Partial<TCustomConfig>): TVertexAIConfig | null {
  const anthropicConfig = config.endpoints?.[EModelEndpoint.anthropic] as
    | TAnthropicEndpoint
    | undefined;

  if (!anthropicConfig?.vertex) {
    return null;
  }

  const vertexConfig = anthropicConfig.vertex;

  // Skip if not enabled
  if (!vertexConfig.enabled) {
    return null;
  }

  const validatedConfig = validateVertexConfig(vertexConfig);

  if (!validatedConfig) {
    return null;
  }

  if (!validatedConfig.isValid) {
    const errorString = validatedConfig.errors.join('\n');
    const errorMessage = 'Invalid Vertex AI configuration:\n' + errorString;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  logger.info('Vertex AI configuration loaded successfully', {
    projectId: validatedConfig.projectId,
    region: validatedConfig.region,
    models: validatedConfig.models?.length || 0,
  });

  return validatedConfig;
}
