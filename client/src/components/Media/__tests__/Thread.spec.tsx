import { Provider, createStore } from 'jotai';
import { mediaCatalogSchema } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MediaCatalog, MediaThreadDetail, MediaJob } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { clearMediaSessionStorage, mediaDraftFamily } from '../state';
import { MediaHostProvider } from '../host';
import { MediaThreadView } from '../Thread';

jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  PixelCard: ({ progress, noFocus }: { progress: number; noFocus: boolean }) => (
    <div data-testid="pixels" data-fill={progress} tabIndex={noFocus ? -1 : 0} />
  ),
}));

const createdAt = '2026-09-17T12:00:00.000Z';
const selection = { connectionId: 'provider', modelId: 'image-model', catalogVersion: 'catalog' };
const asset = {
  file_id: 'reference',
  filename: 'reference.png',
  filepath: '/images/reference.png',
  type: 'image/png',
  bytes: 100,
};
const detail: MediaThreadDetail = {
  thread: {
    schemaVersion: 1,
    threadId: 'thread',
    title: 'Saved image request',
    version: 1,
    createdAt,
    updatedAt: createdAt,
    pendingJobCount: 0,
    turnCount: 1,
  },
  turns: {
    items: [
      {
        schemaVersion: 1,
        threadId: 'thread',
        turnId: 'turn',
        version: 1,
        kind: 'generation',
        sequence: 1,
        createdAt,
        prompt: 'Keep the original reference',
        selection,
        operation: 'image.edit',
        inputs: [{ file_id: asset.file_id, role: 'reference' }],
        assets: [asset],
        jobs: [
          {
            schemaVersion: 1,
            threadId: 'thread',
            turnId: 'turn',
            jobId: 'job',
            version: 1,
            phase: 'failed',
            executionOwner: 'media',
            operation: 'image.edit',
            selection,
            createdAt,
            updatedAt: createdAt,
            allowedActions: { cancel: false, retry: true },
            outputs: [],
          },
        ],
      },
    ],
  },
};
const catalog = (integrations: MediaCatalog['integrations']): MediaCatalog =>
  mediaCatalogSchema.parse({
    schemaVersion: 1,
    version: 'catalog',
    offerings: [],
    limits: {},
    integrations,
    clientPollIntervalMs: 5000,
    clientCatchUpIntervalMs: 60000,
  });
const configured = catalog([
  {
    connectionId: 'provider',
    connectionName: 'Provider',
    api: 'openai.images',
    available: false,
    unavailableReason: 'credentials_required',
  },
]);

function setup(initialCatalog?: MediaCatalog, initialDetail = detail) {
  const store = createStore();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const send = jest.fn().mockResolvedValue(undefined);
  const compose = jest.fn();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <QueryClientProvider client={client}>
        <MediaHostProvider
          value={{
            scope: 'owner',
            canCreate: true,
            pollIntervalMs: 5000,
            catchUpIntervalMs: 60000,
            enterToSend: false,
            isCurrentSession: () => true,
            openThread: () => {},
          }}
        >
          {children}
        </MediaHostProvider>
      </QueryClientProvider>
    </Provider>
  );
  const tree = (value?: MediaCatalog, snapshot = initialDetail) => (
    <MediaThreadView
      detail={snapshot}
      send={send}
      onDeleted={() => {}}
      onCompose={compose}
      catalog={value}
    />
  );
  const view = render(tree(initialCatalog), { wrapper: Wrapper });
  return {
    store,
    send,
    compose,
    rerender: (value?: MediaCatalog) => view.rerender(tree(value)),
    rerenderDetail: (snapshot: MediaThreadDetail) => view.rerender(tree(initialCatalog, snapshot)),
    container: view.container,
  };
}

beforeEach(() => clearMediaSessionStorage());

test('explains why an excluded provider cannot retry while preserving Edit request and its references', () => {
  const env = setup(catalog([]));
  const retry = screen.getByRole('button', { name: 'com_media_retry_job' });
  expect(retry).toBeDisabled();
  expect(retry).toHaveAccessibleDescription('com_media_selection_unavailable');
  fireEvent.click(retry);
  expect(env.send).not.toHaveBeenCalled();

  const edit = screen.getByRole('button', { name: 'com_media_edit_request' });
  expect(edit).toBeEnabled();
  fireEvent.click(edit);
  expect(env.store.get(mediaDraftFamily('owner:thread'))).toMatchObject({
    prompt: detail.turns.items[0].prompt,
    offering: JSON.stringify([selection.connectionId, selection.modelId]),
    inputs: detail.turns.items[0].inputs,
    assets: [asset],
  });
  expect(env.compose).toHaveBeenCalledTimes(1);
});

test('updates retry availability when a configured connection is excluded and re-enabled', async () => {
  const env = setup(configured);
  const retry = () => screen.getByRole('button', { name: 'com_media_retry_job' });
  expect(retry()).toBeEnabled();
  env.rerender(catalog([]));
  expect(retry()).toBeDisabled();
  env.rerender(configured);
  expect(retry()).toBeEnabled();
  expect(screen.queryByText('com_media_selection_unavailable')).not.toBeInTheDocument();
  fireEvent.click(retry());
  await waitFor(() =>
    expect(env.send).toHaveBeenCalledWith(expect.objectContaining({ kind: 'retry', jobId: 'job' })),
  );
});

test('preserves retry behavior while the catalog has not loaded', async () => {
  const env = setup();
  const retry = screen.getByRole('button', { name: 'com_media_retry_job' });
  expect(retry).toBeEnabled();
  fireEvent.click(retry);
  await waitFor(() => expect(env.send).toHaveBeenCalledTimes(1));
});

function withJob(change: Partial<MediaJob>): MediaThreadDetail {
  return {
    ...detail,
    turns: {
      items: [
        {
          ...detail.turns.items[0],
          assets: [],
          inputs: [],
          jobs: [
            {
              ...detail.turns.items[0].jobs[0],
              ...change,
            },
          ],
        },
      ],
    },
  };
}

test.each(['queued', 'submitting', 'running', 'ingesting', 'reconciling'] as const)(
  'restored %s image jobs show the shared pixels without reporting a provider percentage',
  (phase) => {
    const env = setup(undefined, withJob({ phase, operation: 'image.generate' }));
    expect(env.container.querySelector('[data-media-image-pending]')).toBeInTheDocument();
    const pixels = screen.getByTestId('pixels');
    expect(pixels).toHaveAttribute('tabindex', '-1');
    expect(Number(pixels.dataset.fill)).toBeLessThan(0.9);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
  },
);

test('text and partial images do not hide a pending batch, and its final original replaces the loading pixels', () => {
  const env = setup(undefined, withJob({ phase: 'running', operation: 'image.edit' }));
  const outputs: MediaJob['outputs'] = [
    { outputId: 'text', kind: 'text', ordinal: 0, text: 'A note about the images' },
    {
      outputId: 'first',
      kind: 'image',
      ordinal: 1,
      state: 'ready',
      asset: { ...asset, width: 1024, height: 512 },
    },
  ];
  env.rerenderDetail(withJob({ phase: 'ingesting', outputs }));
  expect(screen.getByText('A note about the images')).toBeInTheDocument();
  expect(env.container.querySelector('[data-media-image-pending]')).toBeInTheDocument();
  expect(screen.getAllByTestId('pixels')).toHaveLength(2);
  expect(screen.getByRole('link', { name: 'com_media_download' })).toHaveAttribute(
    'href',
    asset.filepath,
  );
  fireEvent.load(screen.getByRole('img'));
  expect(screen.getAllByTestId('pixels')).toHaveLength(1);
  env.rerenderDetail(
    withJob({
      phase: 'succeeded',
      outputs: [
        ...outputs,
        {
          outputId: 'second',
          kind: 'image',
          ordinal: 2,
          state: 'ready',
          asset: { ...asset, file_id: 'second', filepath: '/images/second.png' },
        },
      ],
    }),
  );
  expect(env.container.querySelector('[data-media-image-pending]')).not.toBeInTheDocument();
  expect(screen.getByTestId('pixels')).toBeInTheDocument();
  fireEvent.load(screen.getAllByRole('img')[1]);
  expect(screen.queryByTestId('pixels')).not.toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: 'com_media_download' })).toHaveLength(2);
});

test.each(['failed', 'cancelled', 'requires_attention', 'succeeded'] as const)(
  '%s stops the job animation and retains completed outputs',
  (phase) => {
    const outputs: MediaJob['outputs'] = [
      { outputId: 'first', kind: 'image', ordinal: 0, state: 'ready', asset },
    ];
    const env = setup(undefined, withJob({ phase: 'running', outputs }));
    fireEvent.load(screen.getByRole('img'));
    env.rerenderDetail(withJob({ phase, outputs }));
    expect(env.container.querySelector('[data-media-image-pending]')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pixels')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'com_media_download' })).toBeInTheDocument();
  },
);

test('a new retry shows a fresh image animation while video keeps the existing pending panel', () => {
  const env = setup(undefined, withJob({ phase: 'failed' }));
  expect(screen.queryByTestId('pixels')).not.toBeInTheDocument();
  const retry = withJob({
    phase: 'queued',
    jobId: 'retry-job',
    retryOfJobId: 'job',
    createdAt: new Date().toISOString(),
  });
  retry.turns.items[0].jobs.unshift(detail.turns.items[0].jobs[0]);
  env.rerenderDetail(retry);
  expect(env.container.querySelectorAll('[data-media-image-pending]')).toHaveLength(1);
  expect(Number(screen.getByTestId('pixels').dataset.fill)).toBeLessThan(0.2);
  expect(screen.getByText('com_media_retry_attempt')).toBeInTheDocument();
  env.rerenderDetail(withJob({ phase: 'running', operation: 'video.generate' }));
  expect(screen.queryByTestId('pixels')).not.toBeInTheDocument();
  expect(screen.getByText('com_media_generation_hint')).toBeInTheDocument();
});
