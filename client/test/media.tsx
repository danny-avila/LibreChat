import { Provider, createStore } from 'jotai';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mediaLimitsSchema } from 'librechat-data-provider';
import type { MediaCatalog, MediaOffering } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import type { MediaHost } from '~/components/Media/host';
import { MediaHostProvider } from '~/components/Media/host';

export function makeCatalog(overrides: Partial<MediaCatalog> = {}): MediaCatalog {
  return {
    schemaVersion: 1,
    version: 'catalog',
    limits: {
      ...mediaLimitsSchema.parse({}),
      maxPromptChars: 1000,
      maxTitleChars: 200,
      maxInputs: 4,
      maxOutputs: 2,
      pageSize: 24,
      maxPageSize: 100,
      maxAssetRetainers: 100,
      maxNativeParts: 100,
      maxNativePartBytes: 1000000,
      maxNativeRecordingBytes: 4194304,
      maxProviderOptionBytes: 32768,
      maxProviderOptionDepth: 8,
      maxPresets: 50,
    },
    offerings: [],
    ...overrides,
  };
}

export function makeOffering(
  api: MediaOffering['api'],
  capabilities: MediaOffering['capabilities'],
  overrides: Partial<MediaOffering> = {},
): MediaOffering {
  return {
    connectionId: 'connection',
    connectionName: 'Connection',
    modelId: 'image-model',
    modelName: 'Image model',
    api,
    available: true,
    capabilities,
    ...overrides,
  };
}

export function createMediaTestEnvironment(
  host: Partial<MediaHost> = {},
  {
    store = createStore(),
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    }),
  }: { store?: ReturnType<typeof createStore>; client?: QueryClient } = {},
) {
  const value: MediaHost = {
    scope: 'owner',
    canCreate: true,
    pollIntervalMs: 5000,
    catchUpIntervalMs: 60000,
    enterToSend: false,
    isCurrentSession: () => true,
    openThread: () => {},
    ...host,
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <QueryClientProvider client={client}>
        <MediaHostProvider value={value}>{children}</MediaHostProvider>
      </QueryClientProvider>
    </Provider>
  );
  return { store, client, host: value, wrapper };
}

export function renderMedia(
  ui: ReactNode,
  options: Parameters<typeof createMediaTestEnvironment>[0] = {},
) {
  const env = createMediaTestEnvironment(options);
  return { ...env, ...render(ui, { wrapper: env.wrapper }) };
}
