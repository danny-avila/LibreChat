import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Provider, createStore, useAtomValue } from 'jotai';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { dataService, mediaSubmissionRequestSchema } from 'librechat-data-provider';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type {
  MediaAsset,
  MediaCatalog,
  MediaThreadDetail,
  MediaTurn,
  MediaSubmissionReceipt,
} from 'librechat-data-provider';
import type { MediaHost } from '../host';
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
    maxProviderOptionBytes: 32768,
    maxProviderOptionDepth: 8,
    maxPresets: 50,
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

const imageAsset = (sequence: number): MediaAsset => ({
  file_id: 'image-' + sequence,
  filename: 'image-' + sequence + '.png',
  filepath: '/images/image-' + sequence + '.png',
  type: 'image/png',
  bytes: 100,
});
const imageTurn = (sequence: number): MediaTurn => {
  const result = turn(sequence);
  return {
    ...result,
    jobs: [
      {
        ...result.jobs[0],
        outputs: [
          {
            kind: 'image',
            outputId: 'output-' + sequence,
            ordinal: 0,
            state: 'ready',
            asset: imageAsset(sequence),
          },
        ],
      },
    ],
  };
};
const imageCatalog = (
  api: MediaCatalog['offerings'][number]['api'] = 'openai.images',
): MediaCatalog => ({
  ...catalog,
  offerings: [
    {
      ...catalog.offerings[0],
      api,
      capabilities: [
        ...catalog.offerings[0].capabilities,
        {
          operation: 'image.edit',
          inputs: { min: 1, max: 4, roles: ['reference'] },
          execution: { kind: 'direct', previews: false },
          controls: { count: { min: 1, max: 2, default: 1 } },
        },
      ],
    },
  ],
});

const header = () => within(screen.getByRole('banner'));
function Harness({
  initialThread,
  embedded = false,
  features,
}: {
  initialThread?: string;
  embedded?: boolean;
  features?: MediaHost['features'];
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
        features,
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
function mount(
  props: { initialThread?: string; embedded?: boolean; features?: MediaHost['features'] } = {},
) {
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
  fireEvent.click(header().getByRole('button', { name: 'com_media_open_gallery' }));
  await screen.findByRole('heading', { name: 'com_media_gallery' });
  expect(prompt).not.toBeVisible();
  const density = within(screen.getByRole('radiogroup', { name: 'com_media_columns' }));
  for (const columns of [2, 3, 4]) {
    const option = density.getByRole('radio', { name: String(columns) });
    fireEvent.click(option);
    expect(option).toHaveAttribute('aria-checked', 'true');
    expect(document.querySelector('[data-media-gallery]')).toHaveAttribute(
      'data-columns',
      String(columns),
    );
  }
  fireEvent.click(header().getByRole('button', { name: 'com_media_back_creation' }));
  expect(prompt).toBeVisible();
  expect(prompt).toHaveValue('A paper boat on a lake');
  fireEvent.click(header().getByRole('button', { name: 'com_media_open_gallery' }));
  view.unmount();
  mediaLibraryFamily.remove('owner');
  mediaDraftFamily.remove('owner:new');
  mount();
  await screen.findByRole('heading', { name: 'com_media_gallery' });
  expect(screen.getByRole('radio', { name: '4' })).toHaveAttribute('aria-checked', 'true');
  await waitFor(() =>
    expect(document.querySelector('[data-media-composer] textarea')).toHaveValue(
      'A paper boat on a lake',
    ),
  );
  fireEvent.click(header().getByRole('button', { name: 'com_media_back_creation' }));
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
  fireEvent.click(header().getByRole('button', { name: 'com_media_open_gallery' }));
  expect(screen.getByRole('button', { name: 'com_media_filter_pending' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByRole('searchbox', { name: 'com_media_search' })).toHaveValue('boats');
  expect(screen.getByRole('radio', { name: '2' })).toHaveAttribute('aria-checked', 'true');
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
  fireEvent.click(header().getByRole('button', { name: 'com_media_open_gallery' }));
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

test.each(['openai.images', 'google.generateContent', 'openrouter.images'] as const)(
  'continues a saved image through consecutive prompt-only edits with %s',
  async (api) => {
    let current: MediaThreadDetail = {
      ...detail,
      turns: { items: [turn(2), imageTurn(1)] },
    };
    const receipts = new Map<string, MediaSubmissionReceipt>();
    jest.mocked(dataService.getMediaCatalog).mockResolvedValue(imageCatalog(api));
    jest.mocked(dataService.getMediaThread).mockImplementation(async () => current);
    jest.spyOn(dataService, 'getMediaSubmission').mockImplementation(async (id) => {
      const receipt = receipts.get(id);
      if (!receipt) throw new Error('Unexpected receipt');
      return receipt;
    });
    const submit = jest.spyOn(dataService, 'submitMedia').mockImplementation(async (body) => {
      const request = mediaSubmissionRequestSchema.parse(body);
      const sequence = current.thread.turnCount + 1;
      const next = imageTurn(sequence);
      next.prompt = request.prompt;
      next.operation = request.operation;
      next.selection = request.selection;
      next.parentTurnId = request.parentTurnId;
      next.inputs = request.inputs;
      next.assets = request.inputs.map((input) => imageAsset(Number(input.file_id.slice(6))));
      next.jobs[0] = {
        ...next.jobs[0],
        operation: request.operation,
        selection: request.selection,
      };
      current = {
        ...current,
        thread: { ...current.thread, version: current.thread.version + 1, turnCount: sequence },
        turns: { items: [next, ...current.turns.items] },
      };
      const receipt: MediaSubmissionReceipt = {
        schemaVersion: 1,
        phase: 'accepted',
        clientRequestId: request.clientRequestId,
        threadId: 'thread',
        turnId: next.turnId,
        jobId: next.jobs[0].jobId,
      };
      receipts.set(request.clientRequestId, receipt);
      return receipt;
    });
    mount({ initialThread: 'thread' });
    const prompt = await screen.findByRole('textbox', { name: 'com_media_prompt' });
    const composer = within(screen.getByRole('region', { name: 'com_media_create' }));
    expect(composer.getByText('com_media_editing_latest')).toBeVisible();
    expect(composer.getByRole('img')).toHaveAttribute('src', imageAsset(1).filepath);

    for (const [index, text] of ['Make the boat red', 'Now make the background gray'].entries()) {
      fireEvent.change(prompt, { target: { value: text } });
      fireEvent.click(screen.getByRole('button', { name: 'com_media_queue' }));
      await waitFor(() => expect(submit).toHaveBeenCalledTimes(index + 1));
      const parent = index === 0 ? 1 : 3;
      expect(submit.mock.calls[index][0]).toMatchObject({
        threadId: 'thread',
        parentTurnId: 'turn-' + parent,
        operation: 'image.edit',
        prompt: text,
        selection,
        inputs: [{ role: 'reference', file_id: 'image-' + parent }],
      });
      await waitFor(() => expect(prompt).toHaveValue(''));
      await waitFor(() =>
        expect(composer.getByRole('img')).toHaveAttribute('src', imageAsset(index + 3).filepath),
      );
    }
    expect(submit.mock.calls[0][0].inputs).toEqual([{ role: 'reference', file_id: 'image-1' }]);
  },
);

test('removing the automatic image starts fresh and preserves that choice and the prompt on reload', async () => {
  jest.mocked(dataService.getMediaCatalog).mockResolvedValue(imageCatalog());
  jest
    .mocked(dataService.getMediaThread)
    .mockResolvedValue({ ...detail, turns: { items: [imageTurn(1)] } });
  const view = mount({ initialThread: 'thread' });
  const prompt = await screen.findByRole('textbox', { name: 'com_media_prompt' });
  fireEvent.change(prompt, { target: { value: 'A different subject' } });
  fireEvent.click(screen.getByRole('button', { name: 'com_media_remove_reference' }));
  expect(screen.queryByText('com_media_editing_latest')).not.toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'com_media_image' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  view.unmount();
  mediaDraftFamily.remove('owner:thread');
  mount({ initialThread: 'thread' });
  expect(await screen.findByRole('textbox', { name: 'com_media_prompt' })).toHaveValue(
    'A different subject',
  );
  expect(screen.queryByText('com_media_editing_latest')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: 'com_media_edit' }));
  expect(screen.getByText('com_media_editing_latest')).toBeVisible();
  fireEvent.click(screen.getByRole('radio', { name: 'com_media_image' }));
  expect(screen.queryByText('com_media_editing_latest')).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'com_media_prompt' })).toHaveValue(
    'A different subject',
  );
});

test('the sidebar offers history while creating and a new creation while browsing', async () => {
  mount({ initialThread: 'thread' });
  await screen.findByText('Result 2');
  const sidebar = () => within(screen.getByRole('complementary', { name: 'Studio sidebar' }));
  expect(sidebar().queryByRole('button', { name: 'com_media_new_thread' })).not.toBeInTheDocument();
  fireEvent.click(sidebar().getByRole('button', { name: 'com_media_open_gallery' }));
  await screen.findByRole('heading', { name: 'com_media_gallery' });
  expect(
    sidebar().queryByRole('button', { name: 'com_media_open_gallery' }),
  ).not.toBeInTheDocument();
  fireEvent.click(sidebar().getByRole('button', { name: 'com_media_new_thread' }));
  await waitFor(() =>
    expect(screen.queryByRole('heading', { name: 'com_media_gallery' })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('heading', { name: 'com_media_welcome' })).toBeVisible();
  expect(sidebar().getByRole('button', { name: 'com_media_open_gallery' })).toBeInTheDocument();
});

test('temporary creations are a header toggle for new work only and mark the draft', async () => {
  mount({ features: { temporary: true } });
  await screen.findByRole('textbox', { name: 'com_media_prompt' });
  const toggle = header().getByRole('button', { name: 'com_media_temporary_creation' });
  expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(screen.queryByText('com_media_temporary_hint')).not.toBeInTheDocument();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('com_media_temporary_hint')).toBeVisible();
  fireEvent.click(header().getByRole('button', { name: 'com_media_open_gallery' }));
  await screen.findByRole('heading', { name: 'com_media_gallery' });
  expect(
    header().queryByRole('button', { name: 'com_media_temporary_creation' }),
  ).not.toBeInTheDocument();
});

test('a pending request the server does not know can be recovered or dismissed', async () => {
  sessionStorage.setItem(
    'librechat:media:owner:pending',
    JSON.stringify([
      {
        kind: 'submission',
        draftKey: 'owner:new',
        draftRevision: 1,
        request: {
          schemaVersion: 1,
          clientRequestId: 'lost',
          operation: 'image.generate',
          prompt: 'A lost boat',
          inputs: [],
          parameters: { count: 1 },
          selection,
        },
      },
    ]),
  );
  jest
    .spyOn(dataService, 'getMediaSubmission')
    .mockRejectedValue({ response: { status: 404, data: { error: { code: 'not_found' } } } });
  mount();
  await screen.findByRole('textbox', { name: 'com_media_prompt' });
  const recovery = () => within(screen.getByRole('region', { name: 'com_media_recovery' }));
  expect(await screen.findByText('com_media_uncertain')).toBeInTheDocument();
  expect(recovery().getByRole('button', { name: 'com_media_recover_request' })).toBeEnabled();
  fireEvent.click(recovery().getByRole('button', { name: 'com_ui_dismiss' }));
  await waitFor(() =>
    expect(screen.queryByRole('region', { name: 'com_media_recovery' })).not.toBeInTheDocument(),
  );
  expect(sessionStorage.getItem('librechat:media:owner:pending')).toBe('[]');
});
