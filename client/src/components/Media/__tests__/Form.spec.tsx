import React from 'react';
import { Provider, createStore } from 'jotai';
import { dataService } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MediaCatalog, MediaUploadResponse, MediaThreadDetail } from 'librechat-data-provider';
import { clearMediaSessionStorage, emptyDraft, mediaDraftFamily } from '../state';
import { MediaHostProvider } from '../host';
import { MediaThreadView } from '../Thread';
import { MediaForm } from '../Form';

jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
jest.mock('librechat-data-provider', () => {
  const actual =
    jest.requireActual<typeof import('librechat-data-provider')>('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService, uploadMedia: jest.fn() } };
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
    maxNativeRecordingBytes: 10000000,
  },
  offerings: [
    {
      connectionId: 'connection',
      connectionName: 'Connection',
      modelId: 'image-model',
      modelName: 'Image model',
      api: 'openai.images',
      available: true,
      capabilities: [
        {
          operation: 'image.generate',
          inputs: { roles: [], min: 0, max: 0 },
          execution: { kind: 'direct', previews: false },
          controls: {
            count: { min: 1, max: 2, default: 1 },
            quality: { values: ['low', 'high'], default: 'high' },
            resolution: { values: ['1K', '2K'], default: '2K' },
            format: { values: ['png', 'jpeg'] },
            background: { values: ['auto', 'opaque'] },
          },
        },
      ],
    },
  ],
};
function setup(canCreate = true) {
  const store = createStore();
  const send = jest.fn().mockResolvedValue(undefined);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>
      <MediaHostProvider
        value={{
          scope: 'owner',
          canCreate,
          pollIntervalMs: 5000,
          catchUpIntervalMs: 60000,
          enterToSend: false,
          isCurrentSession: () => true,
          openThread: () => {},
        }}
      >
        {children}
      </MediaHostProvider>
    </Provider>
  );
  return { store, send, wrapper };
}
beforeEach(() => {
  clearMediaSessionStorage();
  jest.mocked(dataService.uploadMedia).mockReset();
});

test('uses catalog controls and submits a typed immutable prompt snapshot', async () => {
  const env = setup();
  render(<MediaForm catalog={catalog} send={env.send} busy={false} />, { wrapper: env.wrapper });
  fireEvent.change(screen.getByRole('textbox', { name: 'com_media_prompt' }), {
    target: { value: 'A calm lake' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_media_queue' }));
  await waitFor(() => expect(env.send).toHaveBeenCalledTimes(1));
  expect(env.send.mock.calls[0][0]).toMatchObject({
    kind: 'submission',
    request: {
      operation: 'image.generate',
      prompt: 'A calm lake',
      inputs: [],
      parameters: {
        count: 1,
        quality: 'high',
        resolution: '2K',
        format: 'png',
        background: 'auto',
      },
      selection: { connectionId: 'connection', modelId: 'image-model', catalogVersion: 'catalog' },
    },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'com_media_prompt' }), {
    target: { value: 'A different lake' },
  });
  expect(env.send.mock.calls[0][0].request.prompt).toBe('A calm lake');
});

test.each([false, true])(
  'opens a saved provider without replacing an existing draft (%s)',
  async (hasDraft) => {
    const env = setup();
    const source = {
      connectionId: 'router',
      modelId: 'google/gemini-image',
      catalogVersion: 'catalog',
    };
    const choices: MediaCatalog = {
      ...catalog,
      offerings: [
        ...catalog.offerings,
        {
          ...catalog.offerings[0],
          ...source,
          connectionName: 'OpenRouter',
          modelName: 'Gemini Image',
        },
      ],
    };
    if (hasDraft)
      env.store.set(mediaDraftFamily('owner:saved'), {
        ...emptyDraft(),
        offering: '["connection","image-model"]',
        prompt: 'Keep this draft',
        revision: 3,
      });
    render(
      <MediaForm
        catalog={choices}
        threadId="saved"
        initialSelection={source}
        send={env.send}
        busy={false}
      />,
      { wrapper: env.wrapper },
    );
    if (!hasDraft)
      fireEvent.change(screen.getByRole('textbox', { name: 'com_media_prompt' }), {
        target: { value: 'A quiet lake' },
      });
    fireEvent.click(screen.getByRole('button', { name: 'com_media_queue' }));
    await waitFor(() => expect(env.send).toHaveBeenCalledTimes(1));
    expect(env.send.mock.calls[0][0].request.selection).toEqual(
      hasDraft
        ? { connectionId: 'connection', modelId: 'image-model', catalogVersion: 'catalog' }
        : source,
    );
    if (hasDraft) expect(env.send.mock.calls[0][0].request.prompt).toBe('Keep this draft');
  },
);

test('replaces the old implicit empty default with the saved thread provider', () => {
  const env = setup();
  const selection = { connectionId: 'router', modelId: 'gemini', catalogVersion: 'catalog' };
  env.store.set(mediaDraftFamily('owner:saved'), {
    ...emptyDraft(),
    offering: '["connection","image-model"]',
    revision: 1,
  });
  const choices = {
    ...catalog,
    offerings: [...catalog.offerings, { ...catalog.offerings[0], ...selection }],
  };
  render(
    <MediaForm
      catalog={choices}
      threadId="saved"
      initialSelection={selection}
      send={env.send}
      busy={false}
    />,
    { wrapper: env.wrapper },
  );
  expect(env.store.get(mediaDraftFamily('owner:saved')).offering).toBe('["router","gemini"]');
  expect(env.send).not.toHaveBeenCalled();
});

test('retains a removed model draft and requires explicit model selection', () => {
  const env = setup();
  env.store.set(mediaDraftFamily('owner:new'), {
    ...emptyDraft(),
    prompt: 'Keep this draft',
    offering: '["old","removed"]',
    revision: 4,
  });
  render(<MediaForm catalog={catalog} send={env.send} busy={false} />, { wrapper: env.wrapper });
  expect(screen.queryByRole('button', { name: 'com_media_queue' })).not.toBeInTheDocument();
  expect(env.store.get(mediaDraftFamily('owner:new')).prompt).toBe('Keep this draft');
  fireEvent.click(screen.getByRole('button', { name: 'com_media_choose_model' }));
  expect(screen.getByRole('textbox', { name: 'com_media_prompt' })).toHaveValue('Keep this draft');
});

test('keeps a saved draft but blocks a resolution the refreshed catalog no longer supports', async () => {
  const env = setup();
  env.store.set(mediaDraftFamily('owner:new'), {
    ...emptyDraft(),
    offering: '["connection","image-model"]',
    prompt: 'Keep this draft',
    parameters: { count: 1, resolution: '1K' },
    revision: 3,
  });
  const view = render(<MediaForm catalog={catalog} send={env.send} busy={false} />, {
    wrapper: env.wrapper,
  });
  expect(screen.getByRole('button', { name: 'com_media_queue' })).toBeEnabled();
  const refreshed = {
    ...catalog,
    version: 'refreshed',
    offerings: catalog.offerings.map((offering) => ({
      ...offering,
      capabilities: offering.capabilities.map((capability) => ({
        ...capability,
        controls: { ...capability.controls, resolution: { values: ['2K', '4K'] } },
      })),
    })),
  };
  view.rerender(<MediaForm catalog={refreshed} send={env.send} busy={false} />);
  const resolution = screen.getByRole('combobox', { name: 'com_media_resolution' });
  expect(resolution).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByText('com_media_unsupported_settings')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'com_media_queue' })).toBeDisabled();
  expect(screen.getByRole('textbox', { name: 'com_media_prompt' })).toHaveValue('Keep this draft');
  expect(env.send).not.toHaveBeenCalled();
  fireEvent.click(resolution);
  fireEvent.click(await screen.findByRole('option', { name: '2K' }));
  expect(screen.getByRole('button', { name: 'com_media_queue' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'com_media_queue' }));
  await waitFor(() => expect(env.send).toHaveBeenCalledTimes(1));
  expect(env.send.mock.calls[0][0].request.parameters.resolution).toBe('2K');
});

test('read-only mode exposes the saved draft without a working generation control', () => {
  const env = setup(false);
  env.store.set(mediaDraftFamily('owner:new'), { ...emptyDraft(), prompt: 'A lake' });
  render(<MediaForm catalog={catalog} send={env.send} busy={false} />, { wrapper: env.wrapper });
  expect(screen.getByRole('button', { name: 'com_media_queue' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'com_media_upload' })).toBeDisabled();
  expect(env.send).not.toHaveBeenCalled();
});

test('leaving an editor aborts its upload and cannot append the late file to its draft', async () => {
  let finish: (value: MediaUploadResponse) => void = () => {};
  jest.mocked(dataService.uploadMedia).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const env = setup();
  const view = render(<MediaForm catalog={catalog} send={env.send} busy={false} />, {
    wrapper: env.wrapper,
  });
  const input = view.container.querySelector<HTMLInputElement>('input[type=file]')!;
  fireEvent.change(input, {
    target: { files: [new File(['image'], 'lake.png', { type: 'image/png' })] },
  });
  const signal = jest.mocked(dataService.uploadMedia).mock.calls[0][1];
  view.unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () =>
    finish({
      file: {
        file_id: 'late',
        filename: 'lake.png',
        filepath: '/images/owner/lake.png',
        type: 'image/png',
        bytes: 5,
      },
    }),
  );
  expect(env.store.get(mediaDraftFamily('owner:new')).inputs).toEqual([]);
});

test('refining an existing result preserves its provider and parent instead of the default offering', async () => {
  const env = setup();
  const selection = {
    connectionId: 'source-connection',
    modelId: 'source-model',
    catalogVersion: catalog.version,
  };
  const asset = {
    file_id: 'source-file',
    filepath: '/images/owner/source.png',
    filename: 'source.png',
    type: 'image/png',
    bytes: 24,
  };
  const now = '2026-01-01T00:00:00.000Z';
  const detail: MediaThreadDetail = {
    thread: {
      schemaVersion: 1,
      threadId: 'thread',
      title: 'Earlier work',
      version: 1,
      createdAt: now,
      updatedAt: now,
      pendingJobCount: 0,
      turnCount: 1,
    },
    turns: {
      items: [
        {
          schemaVersion: 1,
          threadId: 'thread',
          turnId: 'parent',
          version: 1,
          kind: 'generation',
          createdAt: now,
          prompt: 'Original prompt',
          inputs: [],
          selection,
          operation: 'image.generate',
          assets: [],
          jobs: [
            {
              schemaVersion: 1,
              jobId: 'job',
              threadId: 'thread',
              turnId: 'parent',
              version: 1,
              phase: 'succeeded',
              executionOwner: 'media',
              operation: 'image.generate',
              selection,
              createdAt: now,
              updatedAt: now,
              allowedActions: { cancel: false, retry: false },
              outputs: [{ kind: 'image', outputId: 'output', ordinal: 0, state: 'ready', asset }],
            },
          ],
        },
      ],
    },
  };
  const choices: MediaCatalog = {
    ...catalog,
    offerings: [
      ...catalog.offerings,
      {
        ...catalog.offerings[0],
        ...selection,
        connectionName: 'Source connection',
        modelName: 'Source model',
        capabilities: [
          {
            operation: 'image.edit',
            inputs: { min: 1, max: 1, roles: ['reference'] },
            execution: { kind: 'direct', previews: false },
            controls: { count: { min: 1, max: 1, default: 1 } },
          },
        ],
      },
    ],
  };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MediaForm catalog={choices} threadId="thread" send={env.send} busy={false} />
      <MediaThreadView detail={detail} send={env.send} onDeleted={() => {}} />
    </QueryClientProvider>,
    { wrapper: env.wrapper },
  );
  expect(env.store.get(mediaDraftFamily('owner:thread')).offering).toBe(
    '["connection","image-model"]',
  );
  fireEvent.click(screen.getByRole('button', { name: 'com_media_refine' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'com_media_prompt' }), {
    target: { value: 'Refine the source' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_media_queue' }));
  await waitFor(() => expect(env.send).toHaveBeenCalledTimes(1));
  expect(env.send.mock.calls[0][0].request).toMatchObject({
    threadId: 'thread',
    parentTurnId: 'parent',
    selection,
    operation: 'image.edit',
    inputs: [{ role: 'reference', file_id: 'source-file' }],
  });
});
