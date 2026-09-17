import { Provider, createStore } from 'jotai';
import { mediaCatalogSchema } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MediaCatalog, MediaThreadDetail } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { clearMediaSessionStorage, mediaDraftFamily } from '../state';
import { MediaHostProvider } from '../host';
import { MediaThreadView } from '../Thread';

jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));

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

function setup(initialCatalog?: MediaCatalog) {
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
  const tree = (value?: MediaCatalog) => (
    <MediaThreadView
      detail={detail}
      send={send}
      onDeleted={() => {}}
      onCompose={compose}
      catalog={value}
    />
  );
  const view = render(tree(initialCatalog), { wrapper: Wrapper });
  return { store, send, compose, rerender: (value?: MediaCatalog) => view.rerender(tree(value)) };
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
