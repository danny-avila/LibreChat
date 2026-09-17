import axios from 'axios';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { dataService, EModelEndpoint, mediaCatalogSchema } from 'librechat-data-provider';
import type { MediaCatalog, MediaUserKey, TEndpointsConfig } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import type { MediaQueryScope } from '~/data-provider/Media/queries';
import { initializeI18n } from '~/locales/i18n';
import ProviderKeys from '../ProviderKeys';

let mockEndpoints: string[] = [];
let mockEndpointsConfig: TEndpointsConfig = {};
let mockMediaHost: MediaQueryScope | undefined;

jest.mock('~/data-provider', () => ({
  ...jest.requireActual('~/data-provider'),
  useGetEndpointsQuery: () => ({ data: mockEndpointsConfig }),
}));

jest.mock('../useProviderKeys', () => ({
  __esModule: true,
  default: () => mockEndpoints,
  useMediaProviderKeyScope: () => mockMediaHost,
}));

jest.mock('librechat-data-provider', () => {
  const actual =
    jest.requireActual<typeof import('librechat-data-provider')>('librechat-data-provider');
  return {
    ...actual,
    dataService: { ...actual.dataService, getMediaCatalog: jest.fn() },
  };
});

jest.mock('~/components/Input/SetKeyDialog', () => ({
  SetKeyDialog: ({ keyConfiguration }: { keyConfiguration?: MediaUserKey & { label: string } }) => (
    <div role="dialog" aria-label="Configure credential">
      {keyConfiguration?.keyName} {keyConfiguration?.userProvideURL ? 'URL required' : 'Key only'}
    </div>
  ),
}));

const catalog = (integrations: MediaCatalog['integrations'] = []): MediaCatalog =>
  mediaCatalogSchema.parse({
    schemaVersion: 1,
    version: 'settings-catalog',
    offerings: [],
    limits: {},
    clientPollIntervalMs: 5000,
    clientCatchUpIntervalMs: 60000,
    integrations,
  });

const integration = (keyName: string, overrides: Partial<MediaUserKey> = {}) => ({
  connectionId: 'images',
  connectionName: 'Personal media',
  api: 'openrouter.images' as const,
  available: false,
  unavailableReason: 'credentials_required' as const,
  userKey: { keyName, encoding: 'apiKey' as const, userProvideURL: false, ...overrides },
});

let queryClient: QueryClient;
function setup() {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<ProviderKeys />, { wrapper: Wrapper });
}

describe('ProviderKeys', () => {
  beforeAll(async () => {
    await initializeI18n();
  });
  beforeEach(() => {
    mockEndpoints = [];
    mockEndpointsConfig = {};
    mockMediaHost = undefined;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
      logger: { log: console.log, warn: console.warn, error: () => {} },
    });
    jest.mocked(dataService.getMediaCatalog).mockReset().mockResolvedValue(catalog());
    jest.spyOn(axios, 'get').mockResolvedValue({ data: { expiresAt: '' } });
  });
  afterEach(() => queryClient.clear());

  const enableMedia = () => {
    mockMediaHost = {
      scope: 'settings-user',
      pollIntervalMs: 5000,
      catchUpIntervalMs: 60000,
      isCurrentSession: () => true,
    };
  };

  it('keeps help hidden until its trigger receives focus', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Provider API keys' }));

    const dialog = screen.getByRole('dialog');
    const helpText = 'Manage API keys for endpoints configured to use a user-provided key.';
    const helpTrigger = screen.getByLabelText(helpText);

    await waitFor(() => expect(dialog).toHaveFocus());
    expect(screen.queryByText(helpText)).not.toBeInTheDocument();

    fireEvent.focus(helpTrigger);
    expect(await screen.findByText(helpText)).toBeVisible();
  });

  it('loads Media only after Manage opens and offers keys even without any discovered models', async () => {
    enableMedia();
    let resolve!: (value: MediaCatalog) => void;
    jest.mocked(dataService.getMediaCatalog).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    setup();
    expect(dataService.getMediaCatalog).not.toHaveBeenCalled();
    expect(axios.get).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Provider API keys' }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(
      screen.queryByText('No providers currently require a personal API key.'),
    ).not.toBeInTheDocument();
    await act(async () =>
      resolve(
        catalog([
          integration('Personal / & ?'),
          {
            ...integration('Personal / & ?', { userProvideURL: true }),
            connectionId: 'videos',
            api: 'openrouter.videos',
          },
          {
            connectionId: 'managed',
            connectionName: 'Managed provider',
            api: 'openai.images',
            available: true,
          },
        ]),
      ),
    );

    expect(await screen.findByText('Personal media')).toBeVisible();
    expect(screen.getAllByText('Personal media')).toHaveLength(1);
    expect(screen.queryByText('Managed provider')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('name=Personal%20%2F%20%26%20%3F'),
        expect.anything(),
      ),
    );
    expect(await screen.findByText('No key set')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: /Personal media$/ }));
    expect(screen.getByRole('dialog', { name: 'Configure credential' })).toHaveTextContent(
      'Personal / & ? URL required',
    );
  });

  it('retries a failed catalog request without reporting an empty provider list', async () => {
    enableMedia();
    jest
      .mocked(dataService.getMediaCatalog)
      .mockRejectedValueOnce(new Error('Service unavailable'))
      .mockResolvedValueOnce(catalog([integration('Recovery')]));
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Provider API keys' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load Media Studio provider settings.',
    );
    expect(
      screen.queryByText('No providers currently require a personal API key.'),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Personal media')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(dataService.getMediaCatalog).toHaveBeenCalledTimes(2);
  });

  it('shows a useful empty state for managed-only Media connections', async () => {
    enableMedia();
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Provider API keys' }));
    expect(
      await screen.findByText('No providers currently require a personal API key.'),
    ).toBeVisible();
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('retains chat keys without fetching Media when the scope is unavailable', async () => {
    mockEndpoints = ['Router'];
    mockEndpointsConfig = { Router: { order: 0, type: EModelEndpoint.custom, userProvide: true } };
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Provider API keys' }));
    expect(await screen.findByText('No key set')).toBeVisible();
    expect(screen.getByText('Router')).toBeVisible();
    expect(dataService.getMediaCatalog).not.toHaveBeenCalled();
  });

  it('blocks conflicting key formats and avoids querying or editing that credential', async () => {
    enableMedia();
    jest
      .mocked(dataService.getMediaCatalog)
      .mockResolvedValue(
        catalog([
          integration('Shared'),
          { ...integration('Shared', { encoding: 'google' }), connectionId: 'google' },
        ]),
      );
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Provider API keys' }));
    expect(await screen.findByText(/These providers require different key formats/)).toBeVisible();
    expect(screen.getByRole('button', { name: /Personal media$/ })).toBeDisabled();
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('merges a shared chat row into the required-URL credential editor', async () => {
    enableMedia();
    mockEndpoints = ['openAI'];
    mockEndpointsConfig = { openAI: { order: 0, userProvide: true, userProvideURL: true } };
    jest
      .mocked(dataService.getMediaCatalog)
      .mockResolvedValue(catalog([integration('openAI', { userProvideURL: true })]));
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Provider API keys' }));
    expect(await screen.findByText('No key set')).toBeVisible();
    expect(screen.getAllByText('OpenAI')).toHaveLength(1);
    expect(screen.queryByText('Personal media')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /OpenAI$/ }));
    expect(screen.getByRole('dialog', { name: 'Configure credential' })).toHaveTextContent(
      'openAI URL required',
    );
  });
});
