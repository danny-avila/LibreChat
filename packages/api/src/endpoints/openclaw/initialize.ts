import { EModelEndpoint, ErrorTypes, extractEnvVariable, envVarRegex } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import type { TEndpoint } from 'librechat-data-provider';
import type { BaseInitializeParams, InitializeResultBase } from '~/types';
import { isUserProvided, checkUserKeyExpiry } from '~/utils';
import { getCustomEndpointConfig } from '~/app/config';

function buildOpenClawOptions(endpointConfig: Partial<TEndpoint>, appConfig?: AppConfig) {
  const customParams = endpointConfig.customParams as Record<string, unknown> | undefined;
  const options: Record<string, unknown> = {
    modelDisplayLabel: endpointConfig.modelDisplayLabel ?? 'OpenClaw Agent',
    titleConvo: endpointConfig.titleConvo,
    titleModel: endpointConfig.titleModel,
    summaryModel: endpointConfig.summaryModel,
    titleMethod: endpointConfig.titleMethod ?? 'completion',
    contextStrategy: endpointConfig.summarize ? 'summarize' : null,
    headers: endpointConfig.headers,
    streamRate: endpointConfig.streamRate,
    thinkingLevel: customParams?.thinkingLevel ?? 'medium',
    enableSkills: customParams?.enableSkills ?? true,
    sessionMode: customParams?.sessionMode ?? 'auto',
  };

  const allConfig = appConfig?.endpoints?.all;
  if (allConfig) {
    options.streamRate = allConfig.streamRate;
  }

  return options;
}

/**
 * Initializes the OpenClaw endpoint.
 * Returns a minimal InitializeResultBase — the actual gateway connection is
 * managed by OpenClawGatewayManager and the controller.
 */
export async function initializeOpenClaw({
  req,
  endpoint,
  model_parameters,
  db,
}: BaseInitializeParams): Promise<InitializeResultBase> {
  const appConfig = req.config;
  const { key: expiresAt } = req.body;

  const endpointConfig = getCustomEndpointConfig({ endpoint, appConfig });
  if (!endpointConfig) {
    throw new Error(`Config not found for the ${endpoint} endpoint.`);
  }

  const OPENCLAW_API_KEY = extractEnvVariable(endpointConfig.apiKey ?? '');
  const OPENCLAW_BASE_URL = extractEnvVariable(endpointConfig.baseURL ?? '');

  if (OPENCLAW_API_KEY.match(envVarRegex)) {
    throw new Error(`Missing API Key for ${endpoint}.`);
  }

  if (OPENCLAW_BASE_URL.match(envVarRegex)) {
    throw new Error(`Missing Base URL for ${endpoint}.`);
  }

  const userProvidesKey = isUserProvided(OPENCLAW_API_KEY);
  const userProvidesURL = isUserProvided(OPENCLAW_BASE_URL);

  let userValues = null;
  if (expiresAt && (userProvidesKey || userProvidesURL)) {
    checkUserKeyExpiry(expiresAt, endpoint);
    userValues = await db.getUserKeyValues({ userId: req.user?.id ?? '', name: endpoint });
  }

  const apiKey = userProvidesKey ? userValues?.apiKey : OPENCLAW_API_KEY;
  const baseURL = userProvidesURL ? userValues?.baseURL : OPENCLAW_BASE_URL;

  if (userProvidesKey && !apiKey) {
    throw new Error(JSON.stringify({ type: ErrorTypes.NO_USER_KEY }));
  }

  if (userProvidesURL && !baseURL) {
    throw new Error(JSON.stringify({ type: ErrorTypes.NO_BASE_URL }));
  }

  if (!apiKey) {
    throw new Error(`${endpoint} API key not provided.`);
  }

  if (!baseURL) {
    throw new Error(`${endpoint} Base URL not provided.`);
  }

  const openClawOptions = buildOpenClawOptions(endpointConfig, appConfig);

  return {
    llmConfig: {
      ...(model_parameters ?? {}),
      model: (model_parameters?.model as string | undefined) ?? 'agent:main',
    },
    provider: EModelEndpoint.openclaw,
    // Pass gateway config through for the controller to use
    reverseProxyUrl: baseURL,
    apiKey,
    ...openClawOptions,
  } as unknown as InitializeResultBase;
}
