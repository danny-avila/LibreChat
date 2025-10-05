import { EModelEndpoint, getConfigDefaults } from 'librechat-data-provider';
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

  const mcpConfig = config.mcpServers || null;
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
    transactions,
    mcpConfig,
    webSearch,
    fileStrategy,
    registration,
    filteredTools,
    includedTools,
    availableTools,
    imageOutputType,
    interfaceConfig,
    turnstileConfig,
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

  const appConfig = {
    ...defaultConfig,
    fileConfig: config?.fileConfig,
    secureImageLinks: config?.secureImageLinks,
    modelSpecs: processModelSpecs(config?.endpoints, config.modelSpecs, interfaceConfig),
    endpoints: loadedEndpoints,
  };

  return appConfig;
};
