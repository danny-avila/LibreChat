import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { dataService } from 'librechat-data-provider';
import { Provider, createStore, useAtomValue } from 'jotai';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { MediaCatalog, MediaThreadDetail, MediaTurn } from 'librechat-data-provider';
import { clearMediaSessionStorage, mediaDraftFamily, mediaLibraryFamily } from '../state';
import SidebarPortal, { sidebarPortalTarget } from '~/components/UnifiedSidebar/portal';
import { MediaHostProvider } from '../host';
import MediaWorkspace from '../Workspace';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: { count?: number }) =>
    values?.count == null ? key : key + ':' + values.count,
}));
jest.mock('librechat-data-provider', () => {
  const actual =
    jest.requireActual<typeof import('librechat-data-provider')>('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService } };
});

const catalog: MediaCatalog = {
  schemaVersion: 1,
  version: 'catalog',
  clientPollIntervalMs: 5000,
  clientCatchUpIntervalMs: 60000,
  limits: {
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
  },
  offerings: [
    {
      connectionId: 'provider',
      connectionName: 'Image provider',
      modelId: 'image-model',
      modelName: 'Image model',
      api: 'openai.images',
      available: true,
      capabilities: [
        {
          operation: 'image.generate',
          inputs: { min: 0, max: 0, roles: [] },
          execution: { kind: 'direct', previews: false },
          controls: { count: { min: 1, max: 2, default: 1 } },
        },
      ],
    },
  ],
};
const selection = { connectionId: 'provider', modelId: 'image-model', catalogVersion: 'catalog' };
const createdAt = '2026-09-17T12:00:00.000Z';
const turn = (sequence: number): MediaTurn => ({
  schemaVersion: 1,
  threadId: 'thread',
  turnId: 'turn-' + sequence,
  version: 1,
  kind: 'generation',
  sequence,
  createdAt,
  prompt: 'Prompt ' + sequence,
  inputs: [],
  assets: [],
  operation: 'image.generate',
  selection,
  jobs: [
    {
      schemaVersion: 1,
      threadId: 'thread',
      turnId: 'turn-' + sequence,
      jobId: 'job-' + sequence,
      version: 1,
      phase: 'succeeded',
      executionOwner: 'media',
      operation: 'image.generate',
      selection,
      createdAt,
      updatedAt: createdAt,
      allowedActions: { cancel: false, retry: false },
      outputs: [
        { kind: 'text', ordinal: 0, outputId: 'output-' + sequence, text: 'Result ' + sequence },
      ],
    },
  ],
});
const detail: MediaThreadDetail = {
  thread: {
    schemaVersion: 1,
    threadId: 'thread',
    title: 'Paper boats',
    version: 1,
    createdAt,
    updatedAt: createdAt,
    pendingJobCount: 0,
    turnCount: 2,
  },
  turns: { items: [turn(2), turn(1)] },
};

function Harness({
  initialThread,
  embedded = false,
}: {
  initialThread?: string;
  embedded?: boolean;
}) {
  const [threadId, setThreadId] = useState(initialThread);
  const target = useAtomValue(sidebarPortalTarget);
  return (
    <MediaHostProvider
      value={{
        scope: 'owner',
        canCreate: true,
        pollIntervalMs: 5000,
        catchUpIntervalMs: 60000,
        enterToSend: false,
        isCurrentSession: () => true,
        openThread: (id) => setThreadId(id || undefined),
      }}
    >
      {!embedded && (
        <aside aria-label="Studio sidebar">
          <SidebarPortal />
        </aside>
      )}
      <MediaWorkspace
        threadId={threadId}
        settingsHost={
          embedded
            ? undefined
            : {
                render: (settings) => target && createPortal(settings, target),
                toggle: null,
              }
        }
      />
    </MediaHostProvider>
  );
}
const clients: QueryClient[] = [];
function mount(props: { initialThread?: string; embedded?: boolean } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, cacheTime: 0 } },
    logger: { log: console.log, warn: console.warn, error: jest.fn() },
  });
  clients.push(client);
  return render(
    <Provider store={createStore()}>
      <QueryClientProvider client={client}>
        <Harness {...props} />
      </QueryClientProvider>
    </Provider>,
  );
}
beforeEach(() => {
  clearMediaSessionStorage();
  jest.spyOn(dataService, 'getMediaCatalog').mockResolvedValue(catalog);
  jest.spyOn(dataService, 'listMediaThreads').mockResolvedValue({ items: [detail.thread] });
  jest.spyOn(dataService, 'getMediaThread').mockResolvedValue(detail);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

test('keeps parameters in the sidebar and restores the prompt and gallery density after browsing and reload', async () => {
  const view = mount();
  const prompt = await screen.findByRole('textbox', { name: 'com_media_prompt' });
  const sidebar = within(screen.getByRole('complementary', { name: 'Studio sidebar' }));
  expect(sidebar.getByRole('combobox', { name: 'com_media_connection' })).toHaveTextContent(
    'Image provider',
  );
  expect(sidebar.queryByRole('textbox', { name: 'com_media_prompt' })).not.toBeInTheDocument();
  fireEvent.change(prompt, { target: { value: 'A paper boat on a lake' } });
  fireEvent.click(screen.getByRole('button', { name: 'com_media_open_gallery' }));
  await screen.findByRole('heading', { name: 'com_media_gallery' });
  expect(prompt).not.toBeVisible();
  for (const columns of [2, 3, 4]) {
    const option = screen.getByRole('button', { name: 'com_media_column_count:' + columns });
    fireEvent.click(option);
    expect(option).toHaveAttribute('aria-pressed', 'true');
  }
  fireEvent.click(screen.getByRole('button', { name: 'com_media_back_creation' }));
  expect(prompt).toBeVisible();
  expect(prompt).toHaveValue('A paper boat on a lake');
  fireEvent.click(screen.getByRole('button', { name: 'com_media_open_gallery' }));
  view.unmount();
  mediaLibraryFamily.remove('owner');
  mediaDraftFamily.remove('owner:new');
  mount();
  await screen.findByRole('heading', { name: 'com_media_gallery' });
  expect(screen.getByRole('button', { name: 'com_media_column_count:4' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await waitFor(() =>
    expect(document.querySelector('[data-media-composer] textarea')).toHaveValue(
      'A paper boat on a lake',
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'com_media_back_creation' }));
  expect(screen.getByRole('textbox', { name: 'com_media_prompt' })).toHaveValue(
    'A paper boat on a lake',
  );
});

test('preserves older saved filters while applying the new gallery defaults', async () => {
  sessionStorage.setItem(
    'librechat:media:owner:library',
    JSON.stringify({ filter: 'pending', search: 'boats' }),
  );
  mount();
  await screen.findByRole('textbox', { name: 'com_media_prompt' });
  fireEvent.click(screen.getByRole('button', { name: 'com_media_open_gallery' }));
  expect(screen.getByRole('button', { name: 'com_media_filter_pending' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByRole('searchbox', { name: 'com_media_search' })).toHaveValue('boats');
  expect(screen.getByRole('button', { name: 'com_media_column_count:2' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('shows a saved thread chronologically and returns to that thread when its gallery card is selected', async () => {
  mount({ initialThread: 'thread' });
  await screen.findByText('Result 2');
  const requests = screen.getAllByRole('group', { name: 'com_media_request' });
  expect(requests.map((request) => within(request).getByText(/^Prompt/).textContent)).toEqual([
    'Prompt 1',
    'Prompt 2',
  ]);
  const prompt = screen.getByRole('textbox', { name: 'com_media_prompt' });
  fireEvent.change(prompt, { target: { value: 'Make the boat blue' } });
  fireEvent.click(screen.getByRole('button', { name: 'com_media_open_gallery' }));
  fireEvent.click(await screen.findByRole('button', { name: 'com_media_open_named' }));
  expect(screen.getByText('Result 2')).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'com_media_prompt' })).toHaveValue(
    'Make the boat blue',
  );
});

test('keeps the composer usable around the embedded settings dialog', async () => {
  mount({ embedded: true });
  const prompt = await screen.findByRole('textbox', { name: 'com_media_prompt' });
  fireEvent.change(prompt, { target: { value: 'A miniature landscape' } });
  fireEvent.click(screen.getByRole('button', { name: 'com_media_settings' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByRole('combobox', { name: 'com_media_connection' })).toBeVisible();
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('textbox', { name: 'com_media_prompt' })).toHaveValue(
    'A miniature landscape',
  );
});

test('recovers a catalog failure without leaving the workspace', async () => {
  jest.mocked(dataService.getMediaCatalog).mockRejectedValueOnce(new Error('Unavailable'));
  mount();
  const sidebar = within(screen.getByRole('complementary', { name: 'Studio sidebar' }));
  await sidebar.findByText('com_media_load_failed');
  fireEvent.click(sidebar.getByRole('button', { name: 'com_ui_retry' }));
  expect(await screen.findByRole('textbox', { name: 'com_media_prompt' })).toBeVisible();
});
