import {
  EModelEndpoint,
  getConfigDefaults,
  summarizationConfigSchema,
} from 'librechat-data-provider';
import type { TCustomConfig, FileSources, DeepPartial } from 'librechat-data-provider';
import type { AppConfig, FunctionTool } from '~/types/app';
import { loadDefaultInterface } from './interface';
import { loadTurnstileConfig } from './turnstile';
import { agentsConfigSetup } from './agents';
import { loadWebSearchConfig } from './web';
import { processModelSpecs } from './specs';
import { loadMemoryConfig } from './memory';
import { loadEndpoints } from './endpoints';
import { loadOCRConfig } from './ocr';
import logger from '~/config/winston';

export function loadSummarizationConfig(
  config: DeepPartial<TCustomConfig>,
): AppConfig['summarization'] {
  const raw = config.summarization;
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  if (
    raw.trigger &&
    typeof raw.trigger === 'object' &&
    (raw.trigger as { type?: unknown }).type === 'token_count'
  ) {
    logger.warn(
      "[AppService] `summarization.trigger.type: 'token_count'` is no longer supported. " +
        "Use 'token_ratio' (0-1), 'remaining_tokens' (positive integer), or " +
        "'messages_to_refine' (positive integer). Your `summarization` config will be " +
        'ignored and summarization will fall back to self-summarize defaults (the ' +
        "agent's own provider/model, fires on every pruning event) until this is " +
        'corrected.',
    );
    return undefined;
  }

  const parsed = summarizationConfigSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn('[AppService] Invalid summarization config', parsed.error.flatten());
    return undefined;
  }

  return {
    ...parsed.data,
    enabled: parsed.data.enabled !== false,
  };
}

export type Paths = {
  root: string;
  uploads: string;
  clientPath: string;
  dist: string;
  publicPath: string;
  fonts: string;
  assets: string;
  imageOutput: string;
  structuredTools: string;
  pluginManifest: string;
};

/**
 * Loads custom config and initializes app-wide variables.
 * @function AppService
 */
export const AppService = async (params?: {
  config: DeepPartial<TCustomConfig>;
  paths?: Paths;
  systemTools?: Record<string, FunctionTool>;
}): Promise<AppConfig> => {
  const { config, paths, systemTools } = params || {};
  if (!config) {
    throw new Error('Config is required');
  }
  const configDefaults = getConfigDefaults();

  const ocr = loadOCRConfig(config.ocr);
  const webSearch = loadWebSearchConfig(config.webSearch);
  const memory = loadMemoryConfig(config.memory);
  const summarization = loadSummarizationConfig(config);
  const filteredTools = config.filteredTools;
  const includedTools = config.includedTools;
  const fileStrategy = (config.fileStrategy ?? configDefaults.fileStrategy) as
    | FileSources.local
    | FileSources.s3
    | FileSources.firebase
    | FileSources.azure_blob;
  const startBalance = process.env.START_BALANCE;
  const balance = config.balance ?? {
    enabled: process.env.CHECK_BALANCE?.toLowerCase().trim() === 'true',
    startBalance: startBalance ? parseInt(startBalance, 10) : undefined,
  };
  const transactions = config.transactions ?? configDefaults.transactions;
  const imageOutputType = config?.imageOutputType ?? configDefaults.imageOutputType;

  process.env.CDN_PROVIDER = fileStrategy;

  const availableTools = systemTools;

  const mcpServersConfig = config.mcpServers || null;
  const mcpSettings = config.mcpSettings || null;
  const actions = config.actions;
  const registration = config.registration ?? configDefaults.registration;
  const interfaceConfig = await loadDefaultInterface({ config, configDefaults });
  const turnstileConfig = loadTurnstileConfig(config, configDefaults);
  const speech = config.speech;

  const defaultConfig = {
    ocr,
    paths,
    config,
    memory,
    speech,
    balance,
    actions,
    webSearch,
    mcpSettings,
    transactions,
    fileStrategy,
    registration,
    filteredTools,
    includedTools,
    summarization,
    availableTools,
    imageOutputType,
    interfaceConfig,
    turnstileConfig,
    mcpConfig: mcpServersConfig,
    fileStrategies: config.fileStrategies,
  };

  const agentsDefaults = agentsConfigSetup(config);

  if (!Object.keys(config).length) {
    const appConfig = {
      ...defaultConfig,
      endpoints: {
        [EModelEndpoint.agents]: agentsDefaults,
      },
    };
    return appConfig;
  }

  const loadedEndpoints = loadEndpoints(config, agentsDefaults);

  const appConfig: AppConfig = {
    ...defaultConfig,
    fileConfig: config?.fileConfig as AppConfig['fileConfig'],
    secureImageLinks: config?.secureImageLinks,
    modelSpecs: processModelSpecs(config?.endpoints, config.modelSpecs, interfaceConfig),
    endpoints: loadedEndpoints,
  };

  return appConfig;
};
