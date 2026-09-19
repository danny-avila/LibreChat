import { Provider, createStore } from 'jotai';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { dataService, QueryKeys, mediaCatalogSchema } from 'librechat-data-provider';
import type { MediaCatalog, MediaThreadDetail, MediaJob } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { clearMediaSessionStorage, mediaDraftFamily } from '../state';
import { MediaHostProvider } from '../host';
import { MediaThreadView } from '../Thread';

jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
jest.mock('librechat-data-provider', () => {
  const actual =
    jest.requireActual<typeof import('librechat-data-provider')>('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService } };
});
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
    client,
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

test('the creation menu holds rename and delete, and rename saves against the thread version', async () => {
  const update = jest
    .spyOn(dataService, 'updateMediaThread')
    .mockResolvedValue({ ...detail.thread, title: 'Harbor study', version: 2 });
  setup(configured);
  expect(screen.queryByRole('button', { name: 'com_media_rename' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'com_media_thread_options' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'com_media_rename' }));
  const dialog = await screen.findByRole('dialog', { name: 'com_media_rename' });
  const field = within(dialog).getByRole('textbox', { name: 'com_media_title' });
  expect(field).toHaveValue('Saved image request');
  fireEvent.change(field, { target: { value: 'Harbor study' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'com_ui_save' }));
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith('thread', { expectedVersion: 1, title: 'Harbor study' }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'com_media_rename' })).not.toBeInTheDocument(),
  );
  update.mockRestore();
});

test('deleting from the creation menu confirms first and reports back to the host', async () => {
  const remove = jest
    .spyOn(dataService, 'deleteMediaThread')
    .mockResolvedValue({ threadId: 'thread', phase: 'retiring' });
  const onDeleted = jest.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <Provider store={createStore()}>
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
          <MediaThreadView detail={detail} send={jest.fn()} onDeleted={onDeleted} />
        </MediaHostProvider>
      </QueryClientProvider>
    </Provider>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'com_media_thread_options' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'com_ui_delete' }));
  const dialog = await screen.findByRole('dialog', { name: 'com_media_delete_title' });
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'com_ui_delete' }));
  await waitFor(() => expect(remove).toHaveBeenCalledWith('thread'));
  await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  remove.mockRestore();
});

test('result actions sit in one row: labeled refine, then icon download, expand, and cover', async () => {
  const update = jest
    .spyOn(dataService, 'updateMediaThread')
    .mockResolvedValue({ ...detail.thread, version: 2 });
  const outputs: MediaJob['outputs'] = [
    { outputId: 'first', kind: 'image', ordinal: 0, state: 'ready', asset },
  ];
  setup(undefined, withJob({ phase: 'succeeded', outputs }));
  const figure = screen.getByRole('figure');
  expect(within(figure).getByRole('button', { name: 'com_media_refine' })).toHaveTextContent(
    'com_media_refine',
  );
  expect(within(figure).getByRole('link', { name: 'com_media_download' })).toHaveAttribute(
    'download',
    asset.filename,
  );
  const expanders = within(figure).getAllByRole('button', { name: 'com_media_expand' });
  expect(expanders).toHaveLength(2);
  expect(expanders[1]).not.toHaveTextContent('com_media_expand');
  fireEvent.click(within(figure).getByRole('button', { name: 'com_media_set_cover' }));
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith('thread', {
      expectedVersion: 1,
      coverFileId: asset.file_id,
    }),
  );
  update.mockRestore();
});

test('turns that share a comparison render one prompt with their results side by side', () => {
  const other = { ...selection, modelId: 'other-model' };
  const second: MediaThreadDetail['turns']['items'][number] = {
    ...detail.turns.items[0],
    turnId: 'turn-b',
    sequence: 2,
    selection: other,
    jobs: [{ ...detail.turns.items[0].jobs[0], jobId: 'job-b', selection: other }],
  };
  setup(undefined, {
    ...detail,
    turns: {
      items: [
        { ...detail.turns.items[0], comparisonId: 'compare-1' },
        { ...second, comparisonId: 'compare-1' },
        { ...second, turnId: 'turn-c', sequence: 3, jobs: [], comparisonId: undefined },
      ],
    },
  });
  const comparison = screen.getByRole('region', { name: 'com_media_comparison' });
  expect(within(comparison).getAllByRole('group', { name: 'com_media_request' })).toHaveLength(1);
  expect(within(comparison).getAllByRole('region', { name: 'com_media_job' })).toHaveLength(2);
  expect(screen.getAllByRole('group', { name: 'com_media_request' })).toHaveLength(2);
});

test('a temporary creation announces its expiry next to the title', () => {
  setup(undefined, {
    ...detail,
    thread: { ...detail.thread, expiresAt: new Date(Date.now() + 86_400_000 * 3).toISOString() },
  });
  const status = screen.getByText(/com_media_temporary_creation/).closest('[role="status"]');
  expect(status).toHaveTextContent('com_media_temporary_expires');
  expect(status).toHaveAttribute('title');
});

test('cancelling a job surfaces a failure inline and clears it once the cancellation is accepted', async () => {
  const queued = withJob({ phase: 'queued', allowedActions: { cancel: true, retry: false } });
  const cancel = jest
    .spyOn(dataService, 'cancelMediaJob')
    .mockRejectedValueOnce(new Error('connection lost'))
    .mockResolvedValueOnce({ ...queued.turns.items[0].jobs[0], phase: 'cancelled' });
  setup(undefined, queued);
  const button = () => screen.getByRole('button', { name: 'com_media_cancel_job' });
  fireEvent.click(button());
  expect(await screen.findByRole('alert')).toHaveTextContent('com_media_error_internal_error');
  expect(cancel).toHaveBeenCalledWith('job');
  fireEvent.click(button());
  await waitFor(() => expect(cancel).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(button()).toBeEnabled();
  cancel.mockRestore();
});

test('refreshes restored job status when cancellation loses the race with dispatch', async () => {
  const queued = withJob({ phase: 'queued', allowedActions: { cancel: true, retry: false } });
  const cancel = jest.spyOn(dataService, 'cancelMediaJob').mockRejectedValueOnce({
    response: { data: { error: { code: 'cancel_unsupported' } } },
  });
  const env = setup(undefined, queued);
  const key = [QueryKeys.mediaThread, 'owner', 'thread'];
  env.client.setQueryData(key, queued);
  fireEvent.click(screen.getByRole('button', { name: 'com_media_cancel_job' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('com_media_error_cancel_unsupported');
  expect(env.client.getQueryState(key)?.isInvalidated).toBe(true);
  env.rerenderDetail(
    withJob({ phase: 'submitting', allowedActions: { cancel: false, retry: false } }),
  );
  expect(screen.queryByRole('button', { name: 'com_media_cancel_job' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'com_media_edit_request' })).toBeEnabled();
  cancel.mockRestore();
});

test('requests provider cancellation and restores its pending status without an unsafe retry', async () => {
  const running = withJob({ phase: 'running', allowedActions: { cancel: true, retry: false } });
  const requested = withJob({
    phase: 'running',
    cancellation: 'requested',
    allowedActions: { cancel: false, retry: false },
  });
  const cancel = jest
    .spyOn(dataService, 'cancelMediaJob')
    .mockResolvedValueOnce(requested.turns.items[0].jobs[0]);
  const env = setup(undefined, running);
  fireEvent.click(screen.getByRole('button', { name: 'com_media_request_cancellation' }));
  await waitFor(() => expect(cancel).toHaveBeenCalledWith('job'));
  env.rerenderDetail(requested);
  expect(screen.getByText('com_media_cancellation_requested')).toHaveAttribute('role', 'status');
  expect(
    screen.queryByRole('button', { name: 'com_media_request_cancellation' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'com_media_retry_job' })).not.toBeInTheDocument();
  cancel.mockRestore();
});

test('distinguishes confirmed provider cancellation from unresolved billing', () => {
  setup(
    undefined,
    withJob({
      phase: 'requires_attention',
      cancellation: 'confirmed',
      error: { code: 'not_ready' },
      allowedActions: { cancel: false, retry: false },
    }),
  );
  expect(screen.getByText('com_media_cancellation_confirmed')).toHaveAttribute('role', 'status');
  expect(screen.getByText('com_media_error_not_ready')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'com_media_request_cancellation' }),
  ).not.toBeInTheDocument();
});
