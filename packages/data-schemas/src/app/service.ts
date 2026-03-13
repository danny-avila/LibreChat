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

function applyWebSearchEnvFallback(config: DeepPartial<TCustomConfig>) {
  const stripWrappingQuotes = (value?: string) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    if (trimmed === '' || trimmed === 'undefined' || trimmed === 'null') {
      return undefined;
    }

    if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
      const unwrapped = trimmed.slice(1, -1).trim();
      if (unwrapped === '' || unwrapped === 'undefined' || unwrapped === 'null') {
        return undefined;
      }
      return unwrapped;
    }

    return trimmed;
  };

  const searchProvider = stripWrappingQuotes(process.env.SEARCH_PROVIDER);
  const searxngInstanceUrl = stripWrappingQuotes(process.env.SEARXNG_INSTANCE_URL);

  if (!searchProvider && !searxngInstanceUrl) {
    return {
      ...config,
      webSearch: config.webSearch
        ? {
            ...config.webSearch,
            searchProvider: stripWrappingQuotes(config.webSearch.searchProvider),
            scraperProvider: stripWrappingQuotes(config.webSearch.scraperProvider),
            rerankerType: stripWrappingQuotes(config.webSearch.rerankerType),
            searxngInstanceUrl:
              stripWrappingQuotes(config.webSearch.searxngInstanceUrl) ??
              config.webSearch.searxngInstanceUrl,
          }
        : config.webSearch,
    };
  }

  const nextConfig: DeepPartial<TCustomConfig> = {
    ...config,
    interface: {
      ...(config.interface ?? {}),
      webSearch: true,
    },
    webSearch: {
      ...(config.webSearch ?? {}),
      searchProvider: stripWrappingQuotes(config.webSearch?.searchProvider),
      scraperProvider: stripWrappingQuotes(config.webSearch?.scraperProvider),
      rerankerType: stripWrappingQuotes(config.webSearch?.rerankerType),
      searxngInstanceUrl:
        stripWrappingQuotes(config.webSearch?.searxngInstanceUrl) ??
        config.webSearch?.searxngInstanceUrl,
    },
  };

  if (searchProvider) {
    nextConfig.webSearch = {
      ...nextConfig.webSearch,
      searchProvider: searchProvider as TCustomConfig['webSearch']['searchProvider'],
    };
  } else if (searxngInstanceUrl && !nextConfig.webSearch?.searchProvider) {
    nextConfig.webSearch = {
      ...nextConfig.webSearch,
      searchProvider: 'searxng',
    };
  }

  if (
    (searchProvider === 'searxng' || nextConfig.webSearch?.searchProvider === 'searxng') &&
    !nextConfig.webSearch?.searxngInstanceUrl
  ) {
    nextConfig.webSearch = {
      ...nextConfig.webSearch,
      searxngInstanceUrl: '${SEARXNG_INSTANCE_URL}',
    };
  }

  return nextConfig;
}

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
  const normalizedConfig = applyWebSearchEnvFallback(config);
  const configDefaults = getConfigDefaults();

  const ocr = loadOCRConfig(normalizedConfig.ocr);
  const webSearch = loadWebSearchConfig(normalizedConfig.webSearch);
  const memory = loadMemoryConfig(normalizedConfig.memory);
  const filteredTools = normalizedConfig.filteredTools;
  const includedTools = normalizedConfig.includedTools;
  const fileStrategy = (normalizedConfig.fileStrategy ?? configDefaults.fileStrategy) as
    | FileSources.local
    | FileSources.s3
    | FileSources.firebase
    | FileSources.azure_blob;
  const startBalance = process.env.START_BALANCE;
  const balance = normalizedConfig.balance ?? {
    enabled: process.env.CHECK_BALANCE?.toLowerCase().trim() === 'true',
    startBalance: startBalance ? parseInt(startBalance, 10) : undefined,
  };
  const transactions = normalizedConfig.transactions ?? configDefaults.transactions;
  const imageOutputType = normalizedConfig?.imageOutputType ?? configDefaults.imageOutputType;

  process.env.CDN_PROVIDER = fileStrategy;

  const availableTools = systemTools;

  const mcpServersConfig = normalizedConfig.mcpServers || null;
  const mcpSettings = normalizedConfig.mcpSettings || null;
  const actions = normalizedConfig.actions;
  const registration = normalizedConfig.registration ?? configDefaults.registration;
  const interfaceConfig = await loadDefaultInterface({ config: normalizedConfig, configDefaults });
  const turnstileConfig = loadTurnstileConfig(normalizedConfig, configDefaults);
  const speech = normalizedConfig.speech;

  const defaultConfig = {
    ocr,
    paths,
    config: normalizedConfig,
    memory,
    speech,
    balance,
    actions,
    transactions,
    mcpConfig: mcpServersConfig,
    mcpSettings,
    webSearch,
    fileStrategy,
    registration,
    filteredTools,
    includedTools,
    availableTools,
    imageOutputType,
    interfaceConfig,
    turnstileConfig,
    fileStrategies: normalizedConfig.fileStrategies,
  };

  const agentsDefaults = agentsConfigSetup(normalizedConfig);

  if (!Object.keys(normalizedConfig).length) {
    const appConfig = {
      ...defaultConfig,
      endpoints: {
        [EModelEndpoint.agents]: agentsDefaults,
      },
    };
    return appConfig;
  }

  const loadedEndpoints = loadEndpoints(normalizedConfig, agentsDefaults);

  const appConfig: AppConfig = {
    ...defaultConfig,
    fileConfig: normalizedConfig?.fileConfig as AppConfig['fileConfig'],
    secureImageLinks: normalizedConfig?.secureImageLinks,
    modelSpecs: processModelSpecs(
      normalizedConfig?.endpoints,
      normalizedConfig.modelSpecs,
      interfaceConfig,
    ),
    endpoints: loadedEndpoints,
  };

  return appConfig;
};
