import React from 'react';
import { Provider, createStore } from 'jotai';
import { dataService } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  MediaCatalog,
  MediaUploadResponse,
  MediaURLUploadResponse,
  MediaThreadDetail,
} from 'librechat-data-provider';
import { clearMediaSessionStorage, emptyDraft, mediaDraftFamily } from '../state';
import { MediaHostProvider } from '../host';
import { MediaThreadView } from '../Thread';
import { MediaForm } from '../Form';

jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
jest.mock('~/components/Input/SetKeyDialog/SetKeyDialog', () => ({
  __esModule: true,
  default: ({
    keyConfiguration,
    onOpenChange,
  }: {
    keyConfiguration: { keyName: string; label: string; userProvideURL: boolean };
    onOpenChange: (open: boolean) => void;
  }) => (
    <div role="dialog" aria-label={keyConfiguration.label}>
      <span>{keyConfiguration.keyName}</span>
      <span>{keyConfiguration.userProvideURL ? 'URL required' : 'Key only'}</span>
      <button onClick={() => onOpenChange(false)}>{'Close provider settings'}</button>
    </div>
  ),
}));
jest.mock('librechat-data-provider', () => {
  const actual =
    jest.requireActual<typeof import('librechat-data-provider')>('librechat-data-provider');
  return {
    ...actual,
    dataService: { ...actual.dataService, uploadMedia: jest.fn(), uploadMediaURL: jest.fn() },
  };
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
    maxProviderOptionBytes: 32768,
    maxProviderOptionDepth: 8,
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
test.each(['row', 'gear'] as const)(
  'configures a personal-key provider from its %s without replacing the active draft',
  async (target) => {
    const env = setup();
    const choices: MediaCatalog = {
      ...catalog,
      integrations: [
        {
          connectionId: 'connection',
          connectionName: 'Managed',
          api: 'openai.images',
          available: true,
        },
        {
          connectionId: 'native',
          connectionName: 'Native Images',
          api: 'google.generateContent',
          available: false,
          unavailableReason: 'credentials_required',
          userKey: { keyName: 'SharedNative', encoding: 'google', userProvideURL: false },
        },
        {
          connectionId: 'native-video',
          connectionName: 'Native Videos',
          api: 'google.vertex.videos',
          available: false,
          unavailableReason: 'credentials_required',
          userKey: { keyName: 'SharedNative', encoding: 'google', userProvideURL: true },
        },
      ],
    };
    const view = render(<MediaForm catalog={choices} send={env.send} busy={false} />, {
      wrapper: env.wrapper,
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'com_media_prompt' }), {
      target: { value: 'Keep my prompt' },
    });
    const draft = env.store.get(mediaDraftFamily('owner:new'));
    fireEvent.click(screen.getByRole('combobox', { name: 'com_media_connection' }));
    expect(
      screen.queryByRole('button', { name: 'com_endpoint_config_key Managed' }),
    ).not.toBeInTheDocument();
    const provider = await screen.findByRole('option', { name: 'Native Images' });
    expect(provider).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(
      target === 'row'
        ? provider
        : await screen.findByRole('button', { name: 'com_endpoint_config_key Native Images' }),
    );
    expect(await screen.findByRole('dialog', { name: 'Native Images' })).toHaveTextContent(
      'SharedNative',
    );
    expect(screen.getByText('URL required')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close provider settings' }));
    view.rerender(
      <MediaForm catalog={{ ...choices, version: 'refreshed' }} send={env.send} busy={false} />,
    );
    expect(env.store.get(mediaDraftFamily('owner:new'))).toEqual(draft);
    expect(screen.getByRole('textbox', { name: 'com_media_prompt' })).toHaveValue('Keep my prompt');
    expect(env.send).not.toHaveBeenCalled();
  },
);
test('offers provider settings even when the catalog has no available models', async () => {
  const env = setup();
  render(
    <MediaForm
      catalog={{
        ...catalog,
        offerings: [],
        integrations: [
          {
            connectionId: 'native',
            connectionName: 'Native Images',
            api: 'google.generateContent',
            available: false,
            unavailableReason: 'credentials_required',
            userKey: { keyName: 'Native', encoding: 'google', userProvideURL: false },
          },
        ],
      }}
      send={env.send}
      busy={false}
    >
      {({ settings, composer }) => (
        <>
          {settings}
          {composer}
        </>
      )}
    </MediaForm>,
    { wrapper: env.wrapper },
  );
  expect(screen.getAllByRole('combobox', { name: 'com_media_connection' })).toHaveLength(1);
  fireEvent.click(screen.getByRole('combobox', { name: 'com_media_connection' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'com_endpoint_config_key Native Images' }),
  );
  expect(await screen.findByRole('dialog', { name: 'Native Images' })).toBeInTheDocument();
});
beforeEach(() => {
  clearMediaSessionStorage();
  jest.mocked(dataService.uploadMedia).mockReset();
  jest.mocked(dataService.uploadMediaURL).mockReset();
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
  expect(screen.getByRole('button', { name: 'com_media_queue' })).toBeDisabled();
  expect(env.store.get(mediaDraftFamily('owner:new')).prompt).toBe('Keep this draft');
  fireEvent.click(screen.getByRole('button', { name: 'com_media_choose_model' }));
  expect(screen.getByRole('textbox', { name: 'com_media_prompt' })).toHaveValue('Keep this draft');
});

test('keeps an excluded provider draft visible and switches to an available provider without losing references', async () => {
  const env = setup();
  const asset = {
    file_id: 'reference-image',
    filepath: '/images/reference.png',
    filename: 'reference.png',
    type: 'image/png',
    bytes: 10,
  };
  const draft = {
    ...emptyDraft(),
    prompt: 'Keep my edit',
    offering: '["excluded","old-model"]',
    operation: 'image.edit' as const,
    parentTurnId: 'parent-turn',
    inputs: [{ file_id: asset.file_id, role: 'reference' as const }],
    assets: [asset],
    providerOptionsText: '{"preserve":"until changed"}',
    revision: 4,
  };
  env.store.set(mediaDraftFamily('owner:restored'), draft);
  const choices: MediaCatalog = {
    ...catalog,
    integrations: [
      {
        connectionId: 'connection',
        connectionName: 'Connection',
        api: 'openai.images',
        available: true,
      },
    ],
    offerings: [
      catalog.offerings[0],
      {
        ...catalog.offerings[0],
        modelId: 'edit-model',
        capabilities: [
          {
            ...catalog.offerings[0].capabilities[0],
            operation: 'image.edit',
            inputs: { min: 1, max: 4, roles: ['reference'] },
          },
        ],
      },
    ],
  };
  render(
    <MediaForm catalog={choices} threadId="restored" send={env.send} busy={false}>
      {({ settings, composer }) => (
        <>
          <aside>{settings}</aside>
          <main>{composer}</main>
        </>
      )}
    </MediaForm>,
    { wrapper: env.wrapper },
  );
  expect(screen.getByText('com_media_selection_unavailable')).toBeVisible();
  expect(screen.queryByText('com_media_no_models')).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'com_media_prompt' })).toHaveValue('Keep my edit');
  expect(screen.getByRole('img', { name: 'com_media_image_preview' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'com_media_queue' })).toBeDisabled();
  expect(env.store.get(mediaDraftFamily('owner:restored'))).toEqual(draft);
  fireEvent.change(screen.getByRole('textbox', { name: 'com_media_prompt' }), {
    target: { value: 'Updated edit' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_media_choose_model' }));
  const provider = await screen.findByRole('option', { name: 'Connection' });
  expect(screen.queryByRole('option', { name: 'excluded' })).not.toBeInTheDocument();
  fireEvent.click(provider);
  expect(env.store.get(mediaDraftFamily('owner:restored'))).toMatchObject({
    prompt: 'Updated edit',
    offering: '["connection","edit-model"]',
    operation: 'image.edit',
    inputs: draft.inputs,
    assets: draft.assets,
    parentTurnId: 'parent-turn',
  });
  expect(screen.getByRole('textbox', { name: 'com_media_prompt' })).toHaveValue('Updated edit');
  expect(screen.getByRole('img', { name: 'com_media_image_preview' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'com_media_queue' })).toBeEnabled();
  expect(env.send).not.toHaveBeenCalled();
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
  const choices: MediaCatalog = {
    ...catalog,
    offerings: [
      {
        ...catalog.offerings[0],
        capabilities: [
          {
            ...catalog.offerings[0].capabilities[0],
            inputs: { roles: ['reference'], min: 0, max: 4 },
          },
        ],
      },
    ],
  };
  const view = render(<MediaForm catalog={choices} send={env.send} busy={false} />, {
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
    providerTag: 'source-provider',
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
        api: 'openrouter.images',
        routes: [
          {
            providerTag: 'source-provider',
            providerName: 'Source provider',
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
      <MediaForm
        catalog={choices}
        threadId="thread"
        imageContext={{ turnId: 'newer-turn', asset: { ...asset, file_id: 'newer-image' } }}
        send={env.send}
        busy={false}
      />
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
  fireEvent.click(screen.getByRole('button', { name: 'com_media_edit_request' }));
  expect(env.store.get(mediaDraftFamily('owner:thread')).providerTag).toBe('source-provider');
});

test('a completed image becomes the edit target without erasing a prompt typed while it was generating', async () => {
  const env = setup();
  const choices: MediaCatalog = {
    ...catalog,
    offerings: [
      {
        ...catalog.offerings[0],
        capabilities: [
          ...catalog.offerings[0].capabilities,
          {
            ...catalog.offerings[0].capabilities[0],
            operation: 'image.edit',
            inputs: { min: 1, max: 4, roles: ['reference'] },
          },
        ],
      },
    ],
  };
  const props = { catalog: choices, threadId: 'thread', send: env.send, busy: false };
  const view = render(<MediaForm {...props} />, { wrapper: env.wrapper });
  const prompt = screen.getByRole('textbox', { name: 'com_media_prompt' });
  fireEvent.change(prompt, { target: { value: 'Make it red' } });
  const asset = {
    file_id: 'completed',
    filepath: '/images/completed.png',
    filename: 'completed.png',
    type: 'image/png',
    bytes: 10,
  };
  view.rerender(<MediaForm {...props} imageContext={{ turnId: 'parent', asset }} />);
  expect(prompt).toHaveValue('Make it red');
  expect(screen.getByText('com_media_editing_latest')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'com_media_queue' }));
  await waitFor(() => expect(env.send).toHaveBeenCalledTimes(1));
  expect(env.send.mock.calls[0][0].request).toMatchObject({
    operation: 'image.edit',
    parentTurnId: 'parent',
    prompt: 'Make it red',
    inputs: [{ role: 'reference', file_id: 'completed' }],
  });
});

test('a model without editing support cannot silently send a follow-up without its image', () => {
  const env = setup();
  render(
    <MediaForm
      catalog={catalog}
      threadId="thread"
      send={env.send}
      busy={false}
      imageContext={{
        turnId: 'parent',
        asset: {
          file_id: 'image',
          filepath: '/images/image.png',
          filename: 'image.png',
          type: 'image/png',
          bytes: 10,
        },
      }}
    />,
    { wrapper: env.wrapper },
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'com_media_prompt' }), {
    target: { value: 'Make it red' },
  });
  expect(screen.getByText('com_media_edit_model_required')).toBeVisible();
  expect(screen.getByRole('button', { name: 'com_media_queue' })).toBeDisabled();
  expect(env.send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'com_media_remove_reference' }));
  expect(screen.getByRole('button', { name: 'com_media_queue' })).toBeEnabled();
});

test.each([
  ['credentials_required', 'com_media_error_credentials_required'],
  ['not_ready', 'com_media_provider_configuration_required'],
] as const)(
  'keeps provider and model names clean with a separate %s description',
  async (reason, label) => {
    const env = setup();
    const choices: MediaCatalog = {
      ...catalog,
      integrations: [
        {
          connectionId: 'native-seed',
          connectionName: 'Seed native',
          api: 'seed.images',
          available: false,
          unavailableReason: reason,
        },
      ],
      offerings: [
        ...catalog.offerings,
        {
          ...catalog.offerings[0],
          modelId: 'unavailable-image',
          modelName: 'Unavailable image',
          available: false,
          capabilities: [],
          unavailableReason: 'unsupported',
        },
      ],
    };
    render(<MediaForm catalog={choices} send={env.send} busy={false} />, { wrapper: env.wrapper });
    fireEvent.click(screen.getByRole('combobox', { name: 'com_media_connection' }));
    const provider = await screen.findByRole('option', {
      name: 'Seed native',
    });
    expect(provider).toHaveAttribute('aria-disabled', 'true');
    expect(provider).toHaveAccessibleDescription(label);
    fireEvent.click(provider);
    expect(env.store.get(mediaDraftFamily('owner:new')).offering).toBe(
      '["connection","image-model"]',
    );
    fireEvent.keyDown(provider, { key: 'Escape' });
    fireEvent.click(screen.getByRole('combobox', { name: 'com_media_model' }));
    const model = await screen.findByRole('option', { name: 'Unavailable image' });
    expect(model).toHaveAttribute('aria-disabled', 'true');
    expect(model).toHaveAccessibleDescription('com_media_error_unsupported');
  },
);

test('shows configured integrations even when no native model is currently available', async () => {
  const env = setup();
  render(
    <MediaForm
      catalog={{
        ...catalog,
        offerings: [],
        integrations: [
          {
            connectionId: 'minimax',
            connectionName: 'MiniMax',
            api: 'minimax.videos',
            available: false,
            unavailableReason: 'credentials_required',
          },
        ],
      }}
      send={env.send}
      busy={false}
    />,
    { wrapper: env.wrapper },
  );
  fireEvent.click(screen.getByRole('combobox', { name: 'com_media_connection' }));
  expect(await screen.findByRole('option', { name: 'MiniMax' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  expect(screen.queryByRole('button', { name: 'com_media_queue' })).not.toBeInTheDocument();
});

test('uses the chosen OpenRouter provider controls and blocks a stale route without changing the draft', async () => {
  const env = setup();
  const capability = catalog.offerings[0].capabilities[0];
  const choices: MediaCatalog = {
    ...catalog,
    offerings: [
      {
        ...catalog.offerings[0],
        api: 'openrouter.images',
        defaultProviderTag: 'provider-a',
        routes: [
          { providerTag: 'provider-a', providerName: 'Provider A', capabilities: [capability] },
          {
            providerTag: 'provider-b',
            providerName: 'Provider B',
            capabilities: [
              {
                ...capability,
                controls: {
                  count: { min: 1, max: 1, default: 1 },
                  resolution: { values: ['4K'], default: '4K' },
                },
              },
            ],
          },
        ],
      },
    ],
  };
  const view = render(<MediaForm catalog={choices} send={env.send} busy={false} />, {
    wrapper: env.wrapper,
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'com_media_prompt' }), {
    target: { value: 'A small lake' },
  });
  fireEvent.click(screen.getByRole('combobox', { name: 'com_media_provider_route' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Provider B' }));
  expect(screen.getByRole('combobox', { name: 'com_media_resolution' })).toHaveTextContent('4K');
  fireEvent.click(screen.getByRole('button', { name: 'com_media_queue' }));
  await waitFor(() => expect(env.send).toHaveBeenCalledTimes(1));
  expect(env.send.mock.calls[0][0].request).toMatchObject({
    selection: { providerTag: 'provider-b' },
    parameters: { count: 1, resolution: '4K' },
  });
  const refreshed: MediaCatalog = {
    ...choices,
    version: 'new',
    offerings: [{ ...choices.offerings[0], routes: [choices.offerings[0].routes![0]] }],
  };
  view.rerender(<MediaForm catalog={refreshed} send={env.send} busy={false} />);
  expect(screen.getByText('com_media_stale_provider_route')).toBeVisible();
  expect(screen.getByRole('button', { name: 'com_media_queue' })).toBeDisabled();
  expect(env.store.get(mediaDraftFamily('owner:new')).providerTag).toBe('provider-b');
  expect(screen.getByRole('textbox', { name: 'com_media_prompt' })).toHaveValue('A small lake');
  fireEvent.click(screen.getByRole('combobox', { name: 'com_media_provider_route' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Provider A' }));
  expect(screen.getByRole('button', { name: 'com_media_queue' })).toBeEnabled();
});

test('keeps invalid provider JSON drafts and enforces allowed keys, bytes and nesting before submission', async () => {
  const env = setup();
  const base = catalog.offerings[0].capabilities[0];
  const choices: MediaCatalog = {
    ...catalog,
    limits: { ...catalog.limits, maxProviderOptionBytes: 48, maxProviderOptionDepth: 2 },
    offerings: [
      {
        ...catalog.offerings[0],
        capabilities: [
          { ...base, controls: { ...base.controls, providerOptions: ['watermark', 'style'] } },
        ],
      },
    ],
  };
  const view = render(<MediaForm catalog={choices} send={env.send} busy={false} />, {
    wrapper: env.wrapper,
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'com_media_prompt' }), {
    target: { value: 'A small lake' },
  });
  fireEvent.click(screen.getByText('com_media_advanced'));
  const editor = screen.getByRole('textbox', { name: 'com_media_provider_options' });
  for (const value of [
    '{',
    '{"unknown":true}',
    '{"style":{"nested":{"deep":1}}}',
    JSON.stringify({ style: 'a'.repeat(50) }),
  ]) {
    fireEvent.change(editor, { target: { value } });
    expect(editor).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'com_media_queue' })).toBeDisabled();
    expect(env.store.get(mediaDraftFamily('owner:new')).providerOptionsText).toBe(value);
  }
  view.unmount();
  render(<MediaForm catalog={choices} send={env.send} busy={false} />, { wrapper: env.wrapper });
  fireEvent.click(screen.getByText('com_media_advanced'));
  const restored = screen.getByRole('textbox', { name: 'com_media_provider_options' });
  expect(restored).toHaveValue(JSON.stringify({ style: 'a'.repeat(50) }));
  fireEvent.change(restored, { target: { value: '{"watermark":false}' } });
  fireEvent.click(screen.getByRole('button', { name: 'com_media_queue' }));
  await waitFor(() => expect(env.send).toHaveBeenCalledTimes(1));
  expect(env.send.mock.calls[0][0].request.parameters.providerOptions).toEqual({
    watermark: false,
  });
  fireEvent.change(restored, { target: { value: '{}' } });
  fireEvent.click(screen.getByRole('button', { name: 'com_media_queue' }));
  await waitFor(() => expect(env.send).toHaveBeenCalledTimes(2));
  expect(env.send.mock.calls[1][0].request.parameters).not.toHaveProperty('providerOptions');
});

test('requires an explicit quality choice without inventing a paid tier', async () => {
  const env = setup();
  const base = catalog.offerings[0].capabilities[0];
  if (base.operation === 'video.generate') throw new Error('Expected an image capability');
  const choices: MediaCatalog = {
    ...catalog,
    offerings: [
      {
        ...catalog.offerings[0],
        capabilities: [
          {
            ...base,
            controls: {
              ...base.controls,
              quality: { values: ['standard', 'max'], required: true },
            },
          },
        ],
      },
    ],
  };
  render(<MediaForm catalog={choices} send={env.send} busy={false} />, { wrapper: env.wrapper });
  fireEvent.change(screen.getByRole('textbox', { name: 'com_media_prompt' }), {
    target: { value: 'A lake' },
  });
  expect(screen.getByRole('button', { name: 'com_media_queue' })).toBeDisabled();
  fireEvent.click(screen.getByRole('combobox', { name: 'com_media_quality' }));
  fireEvent.click(await screen.findByRole('option', { name: 'standard' }));
  fireEvent.click(screen.getByRole('button', { name: 'com_media_queue' }));
  await waitFor(() => expect(env.send).toHaveBeenCalledTimes(1));
  expect(env.send.mock.calls[0][0].request.parameters.quality).toBe('standard');
});

test('submits image edit controls and clears provider-specific JSON when changing models', async () => {
  const env = setup();
  const base = catalog.offerings[0].capabilities[0];
  if (base.operation === 'video.generate') throw new Error('Expected an image capability');
  const choices: MediaCatalog = {
    ...catalog,
    offerings: [
      {
        ...catalog.offerings[0],
        capabilities: [
          {
            ...base,
            controls: {
              ...base.controls,
              outputCompression: { min: 0, max: 100 },
              strength: { min: 0, max: 1 },
              guidance: { min: 0, max: 10 },
              providerOptions: ['watermark'],
            },
          },
        ],
      },
      { ...catalog.offerings[0], modelId: 'second', modelName: 'Another model' },
    ],
  };
  render(<MediaForm catalog={choices} send={env.send} busy={false} />, { wrapper: env.wrapper });
  fireEvent.change(screen.getByRole('textbox', { name: 'com_media_prompt' }), {
    target: { value: 'A lake' },
  });
  fireEvent.click(screen.getByText('com_media_advanced'));
  for (const [name, value] of [
    ['com_media_output_compression', '80'],
    ['com_media_strength', '0.4'],
    ['com_media_guidance', '3.5'],
  ])
    fireEvent.change(screen.getByRole('spinbutton', { name }), { target: { value } });
  fireEvent.change(screen.getByRole('textbox', { name: 'com_media_provider_options' }), {
    target: { value: '{"watermark":false}' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_media_queue' }));
  await waitFor(() => expect(env.send).toHaveBeenCalledTimes(1));
  expect(env.send.mock.calls[0][0].request.parameters).toMatchObject({
    outputCompression: 80,
    strength: 0.4,
    guidance: 3.5,
    providerOptions: { watermark: false },
  });
  fireEvent.click(screen.getByRole('combobox', { name: 'com_media_model' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Another model' }));
  expect(env.store.get(mediaDraftFamily('owner:new')).providerOptionsText).toBeUndefined();
  expect(env.store.get(mediaDraftFamily('owner:new')).parameters).toEqual({ count: 1 });
  expect(screen.getByRole('textbox', { name: 'com_media_prompt' })).toHaveValue('A lake');
});

test('requires an avatar recording or an explicit voice before enabling generation', () => {
  const env = setup();
  const choices: MediaCatalog = {
    ...catalog,
    offerings: [
      {
        ...catalog.offerings[0],
        api: 'heygen.videos',
        capabilities: [
          {
            operation: 'video.generate',
            workflow: 'avatar',
            inputs: { min: 1, max: 2, roles: ['reference', 'audio'], requiredRoles: ['reference'] },
            execution: { kind: 'remote-job', cancellation: 'unsupported' },
            controls: { count: { min: 1, max: 1, default: 1 }, providerOptions: ['voice_id'] },
          },
        ],
      },
    ],
  };
  env.store.set(mediaDraftFamily('owner:new'), {
    ...emptyDraft(),
    prompt: 'Hello',
    offering: '["connection","image-model"]',
    operation: 'video.generate',
    inputs: [{ role: 'reference', file_id: 'portrait' }],
    revision: 2,
  });
  render(<MediaForm catalog={choices} send={env.send} busy={false} />, { wrapper: env.wrapper });
  expect(screen.getByRole('button', { name: 'com_media_queue' })).toBeDisabled();
  expect(screen.getByText('com_media_avatar_voice_required')).toBeVisible();
  fireEvent.click(screen.getByText('com_media_advanced'));
  fireEvent.change(screen.getByRole('textbox', { name: 'com_media_provider_options' }), {
    target: { value: '{"voice_id":"selected-voice"}' },
  });
  expect(screen.getByRole('button', { name: 'com_media_queue' })).toBeEnabled();
});

test('sends one sizing method and clears conflicting defaults when dimensions change', async () => {
  const env = setup();
  const base = catalog.offerings[0].capabilities[0];
  const choices: MediaCatalog = {
    ...catalog,
    offerings: [
      {
        ...catalog.offerings[0],
        capabilities: [
          {
            ...base,
            controls: {
              ...base.controls,
              size: { values: ['1024x1024'], default: '1024x1024' },
              aspectRatio: { values: ['16:9'], default: '16:9' },
            },
          },
        ],
      },
    ],
  };
  render(<MediaForm catalog={choices} send={env.send} busy={false} />, { wrapper: env.wrapper });
  fireEvent.change(screen.getByRole('textbox', { name: 'com_media_prompt' }), {
    target: { value: 'A lake' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_media_queue' }));
  await waitFor(() => expect(env.send).toHaveBeenCalledTimes(1));
  expect(env.send.mock.calls[0][0].request.parameters).toMatchObject({ resolution: '2K' });
  expect(env.send.mock.calls[0][0].request.parameters).not.toHaveProperty('size');
  fireEvent.click(screen.getByRole('combobox', { name: 'com_media_size' }));
  fireEvent.click(await screen.findByRole('option', { name: '1024x1024' }));
  fireEvent.click(screen.getByRole('button', { name: 'com_media_queue' }));
  await waitFor(() => expect(env.send).toHaveBeenCalledTimes(2));
  expect(env.send.mock.calls[1][0].request.parameters).toMatchObject({ size: '1024x1024' });
  expect(env.send.mock.calls[1][0].request.parameters).not.toHaveProperty('resolution');
  expect(env.send.mock.calls[1][0].request.parameters).not.toHaveProperty('aspectRatio');
  fireEvent.click(screen.getByRole('combobox', { name: 'com_media_resolution' }));
  fireEvent.click(await screen.findByRole('option', { name: '1K' }));
  expect(env.store.get(mediaDraftFamily('owner:new')).parameters.size).toBeUndefined();
});

test('supports fractional controls, automatic frame roles and required video references without a duplicate OpenRouter picker', async () => {
  const env = setup();
  const choices: MediaCatalog = {
    ...catalog,
    offerings: [
      {
        ...catalog.offerings[0],
        api: 'openrouter.videos',
        modelId: 'new/video-upscaler',
        capabilities: [
          {
            operation: 'video.generate',
            workflow: 'upscale',
            inputs: {
              min: 1,
              max: 3,
              roles: ['start_frame', 'video', 'audio'],
              requiredRoles: ['video'],
            },
            execution: { kind: 'remote-job', cancellation: 'unsupported' },
            controls: {
              count: { min: 1, max: 1, default: 1 },
              upscaleFactor: { min: 1, max: 4, default: 2 },
              creativity: { min: 0, max: 1 },
              negativePrompt: true,
            },
          },
        ],
      },
    ],
  };
  const view = render(<MediaForm catalog={choices} send={env.send} busy={false} />, {
    wrapper: env.wrapper,
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'com_media_prompt' }), {
    target: { value: 'Make this clearer' },
  });
  expect(
    screen.queryByRole('combobox', { name: 'com_media_provider_route' }),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('spinbutton', { name: 'com_media_upscale_factor' }), {
    target: { value: '1.5' },
  });
  expect(screen.getByRole('spinbutton', { name: 'com_media_upscale_factor' })).toHaveAttribute(
    'step',
    'any',
  );
  fireEvent.click(screen.getByText('com_media_advanced'));
  fireEvent.change(screen.getByRole('spinbutton', { name: 'com_media_creativity' }), {
    target: { value: '0.3' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'com_media_negative_prompt' }), {
    target: { value: 'grain' },
  });
  const upload = view.container.querySelector<HTMLInputElement>('input[type=file]')!;
  for (const [file_id, type, expectedRole] of [
    ['frame', 'image/png', 'start_frame'],
    ['clip', 'video/mp4', 'video'],
  ] as const) {
    jest.mocked(dataService.uploadMedia).mockResolvedValueOnce({
      file: { file_id, filename: file_id, type, bytes: 10, filepath: `/media/${file_id}` },
    });
    fireEvent.change(upload, { target: { files: [new File(['original'], file_id, { type })] } });
    await waitFor(() =>
      expect(
        env.store
          .get(mediaDraftFamily('owner:new'))
          .inputs.some((input) => input.role === expectedRole),
      ).toBe(true),
    );
    if (expectedRole === 'start_frame')
      expect(screen.getByRole('button', { name: 'com_media_queue' })).toBeDisabled();
  }
  expect(screen.getByLabelText('com_media_video_preview')).toHaveAttribute('controls');
  fireEvent.click(screen.getByRole('button', { name: 'com_media_queue' }));
  await waitFor(() => expect(env.send).toHaveBeenCalledTimes(1));
  expect(env.send.mock.calls[0][0].request.parameters).toEqual({
    count: 1,
    upscaleFactor: 1.5,
    creativity: 0.3,
    negativePrompt: 'grain',
  });
});

const hostedCatalog: MediaCatalog = {
  ...catalog,
  offerings: [
    {
      ...catalog.offerings[0],
      api: 'openrouter.videos',
      capabilities: [
        {
          operation: 'video.generate',
          inputs: {
            min: 1,
            max: 3,
            roles: ['video', 'audio', 'start_frame'],
            hostedRoles: ['audio', 'video'],
            requiredRoles: ['video'],
          },
          execution: { kind: 'remote-job', cancellation: 'unsupported' },
          controls: { count: { min: 1, max: 1, default: 1 } },
        },
      ],
    },
  ],
};
const hostedReference: MediaURLUploadResponse = {
  sourceURL: 'https://media.example.com/reference.mp4',
  file: {
    file_id: 'hosted-clip',
    filename: 'reference.mp4',
    type: 'video/mp4',
    filepath: '/media/archived-reference.mp4',
    bytes: 12,
  },
};

test('a URL-only model opens its reference dialog without any local file input', () => {
  const env = setup();
  const choices: MediaCatalog = {
    ...hostedCatalog,
    offerings: [
      {
        ...hostedCatalog.offerings[0],
        capabilities: [
          {
            ...hostedCatalog.offerings[0].capabilities[0],
            inputs: {
              min: 1,
              max: 1,
              roles: ['video'],
              hostedRoles: ['video'],
              requiredRoles: ['video'],
            },
          },
        ],
      },
    ],
  };
  const view = render(<MediaForm catalog={choices} send={env.send} busy={false} />, {
    wrapper: env.wrapper,
  });
  expect(view.container.querySelector('input[type=file]')).toBeNull();
  expect(
    screen.queryByRole('textbox', { name: 'com_media_reference_url' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'com_media_upload' }));
  expect(screen.getByRole('dialog', { name: 'com_media_upload' })).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'com_media_local_reference' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('combobox', { name: 'com_media_reference_url_role' }),
  ).not.toBeInTheDocument();
});

test('a native model requiring hosted video still accepts local images and audio', async () => {
  const env = setup();
  const choices: MediaCatalog = {
    ...hostedCatalog,
    offerings: [
      {
        ...hostedCatalog.offerings[0],
        api: 'seed.videos',
        capabilities: [
          {
            ...hostedCatalog.offerings[0].capabilities[0],
            inputs: {
              min: 0,
              max: 3,
              roles: ['video', 'audio', 'start_frame'],
              hostedRoles: ['video'],
            },
          },
        ],
      },
    ],
  };
  const view = render(<MediaForm catalog={choices} send={env.send} busy={false} />, {
    wrapper: env.wrapper,
  });
  const input = view.container.querySelector<HTMLInputElement>('input[type=file]')!;
  expect(input).toHaveAttribute('accept', 'image/*,audio/*');
  for (const [type, role] of [
    ['image/png', 'start_frame'],
    ['audio/mpeg', 'audio'],
  ] as const) {
    fireEvent.click(screen.getByRole('button', { name: 'com_media_upload' }));
    const choose = jest.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'com_media_local_reference' }));
    expect(choose).toHaveBeenCalled();
    const file = { ...hostedReference.file, file_id: role, type };
    jest.mocked(dataService.uploadMedia).mockResolvedValueOnce({ file });
    fireEvent.change(input, { target: { files: [new File(['reference'], role, { type })] } });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(env.store.get(mediaDraftFamily('owner:new')).inputs).toContainEqual({
      file_id: role,
      role,
    });
  }
  expect(dataService.uploadMediaURL).not.toHaveBeenCalled();
});

test('an image generation model retains the direct file chooser and switches to its edit capability', async () => {
  const env = setup();
  const choices: MediaCatalog = {
    ...catalog,
    offerings: [
      {
        ...catalog.offerings[0],
        capabilities: [
          catalog.offerings[0].capabilities[0],
          {
            ...catalog.offerings[0].capabilities[0],
            operation: 'image.edit',
            inputs: { min: 1, max: 2, roles: ['reference'] },
          },
        ],
      },
    ],
  };
  const view = render(<MediaForm catalog={choices} send={env.send} busy={false} />, {
    wrapper: env.wrapper,
  });
  const input = view.container.querySelector<HTMLInputElement>('input[type=file]')!;
  expect(input).toHaveAttribute('accept', 'image/*');
  const choose = jest.spyOn(input, 'click');
  fireEvent.click(screen.getByRole('button', { name: 'com_media_upload' }));
  expect(choose).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  jest.mocked(dataService.uploadMedia).mockResolvedValueOnce({
    file: { ...hostedReference.file, type: 'image/png', file_id: 'local-image' },
  });
  fireEvent.change(input, {
    target: { files: [new File(['image'], 'image.png', { type: 'image/png' })] },
  });
  await waitFor(() =>
    expect(env.store.get(mediaDraftFamily('owner:new')).operation).toBe('image.edit'),
  );
  expect(env.store.get(mediaDraftFamily('owner:new')).inputs).toEqual([
    { file_id: 'local-image', role: 'reference' },
  ]);
});

test('switching editors closes and aborts a hosted import, preserves its draft, and ignores its late response', async () => {
  let finish!: (response: MediaURLUploadResponse) => void;
  jest.mocked(dataService.uploadMediaURL).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const env = setup();
  const view = render(<MediaForm catalog={hostedCatalog} send={env.send} busy={false} />, {
    wrapper: env.wrapper,
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'com_media_prompt' }), {
    target: { value: 'Keep my prompt' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_media_upload' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'com_media_reference_url' }), {
    target: { value: hostedReference.sourceURL },
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_media_add_reference_url' }));
  const signal = jest.mocked(dataService.uploadMediaURL).mock.calls[0][1];
  view.rerender(
    <MediaForm catalog={hostedCatalog} threadId="second" send={env.send} busy={false} />,
  );
  expect(signal?.aborted).toBe(true);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await act(async () => finish(hostedReference));
  expect(env.store.get(mediaDraftFamily('owner:new')).inputs).toEqual([]);
  expect(env.store.get(mediaDraftFamily('owner:second')).inputs).toEqual([]);
  view.rerender(<MediaForm catalog={hostedCatalog} send={env.send} busy={false} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'com_media_prompt' })).toHaveValue('Keep my prompt');
  fireEvent.click(screen.getByRole('button', { name: 'com_media_upload' }));
  expect(screen.getByRole('textbox', { name: 'com_media_reference_url' })).toHaveValue(
    hostedReference.sourceURL,
  );
});

test('validates hosted links and rejects local audio/video before making an upload request', () => {
  const env = setup();
  const view = render(<MediaForm catalog={hostedCatalog} send={env.send} busy={false} />, {
    wrapper: env.wrapper,
  });
  expect(
    screen.queryByRole('textbox', { name: 'com_media_reference_url' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'com_media_upload' }));
  const url = screen.getByRole('textbox', { name: 'com_media_reference_url' });
  expect(screen.getByRole('combobox', { name: 'com_media_reference_url_role' })).toHaveTextContent(
    'com_media_role_video',
  );
  const add = screen.getByRole('button', { name: 'com_media_add_reference_url' });
  for (const value of [
    'http://media.example.com/video.mp4',
    'https://user:password@media.example.com/video.mp4',
    'https://media.example.com/video.mp4#fragment',
  ]) {
    fireEvent.change(url, { target: { value } });
    expect(url).toHaveAttribute('aria-invalid', 'true');
    expect(add).toBeDisabled();
  }
  const upload = view.container.querySelector<HTMLInputElement>('input[type=file]')!;
  expect(upload).toHaveAttribute('accept', 'image/*');
  for (const type of ['video/mp4', 'audio/mpeg'])
    fireEvent.change(upload, {
      target: { files: [new File(['original'], 'reference', { type })] },
    });
  expect(screen.getByRole('alert')).toHaveTextContent('com_media_reference_needs_url');
  expect(dataService.uploadMedia).not.toHaveBeenCalled();
  expect(dataService.uploadMediaURL).not.toHaveBeenCalled();
});

test('persists a URL draft, archives it, and submits the source URL with its owned reference', async () => {
  const env = setup();
  const view = render(<MediaForm catalog={hostedCatalog} send={env.send} busy={false} />, {
    wrapper: env.wrapper,
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_media_upload' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'com_media_reference_url' }), {
    target: { value: ` ${hostedReference.sourceURL} ` },
  });
  view.unmount();
  mediaDraftFamily.remove('owner:new');
  const restored = setup();
  render(<MediaForm catalog={hostedCatalog} send={restored.send} busy={false} />, {
    wrapper: restored.wrapper,
  });
  expect(
    screen.queryByRole('textbox', { name: 'com_media_reference_url' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'com_media_upload' }));
  expect(screen.getByRole('textbox', { name: 'com_media_reference_url' })).toHaveValue(
    hostedReference.sourceURL,
  );
  jest.mocked(dataService.uploadMediaURL).mockResolvedValueOnce(hostedReference);
  fireEvent.click(screen.getByRole('button', { name: 'com_media_add_reference_url' }));
  await waitFor(() =>
    expect(restored.store.get(mediaDraftFamily('owner:new')).inputs).toEqual([
      { file_id: 'hosted-clip', role: 'video', sourceURL: hostedReference.sourceURL },
    ]),
  );
  expect(dataService.uploadMediaURL).toHaveBeenCalledWith(
    { url: hostedReference.sourceURL, role: 'video' },
    expect.any(AbortSignal),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(restored.store.get(mediaDraftFamily('owner:new')).referenceURL).toBe('');
  expect(screen.getByLabelText('com_media_video_preview')).toHaveAttribute('controls');
  fireEvent.change(screen.getByRole('textbox', { name: 'com_media_prompt' }), {
    target: { value: 'Upscale this video' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_media_queue' }));
  await waitFor(() => expect(restored.send).toHaveBeenCalledTimes(1));
  expect(restored.send.mock.calls[0][0].request.inputs).toEqual([
    { file_id: 'hosted-clip', role: 'video', sourceURL: hostedReference.sourceURL },
  ]);
});

test('cancels a URL import without accepting a late result and retains the draft for retry', async () => {
  let finish: (response: MediaURLUploadResponse) => void = () => {};
  jest.mocked(dataService.uploadMediaURL).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const env = setup();
  render(<MediaForm catalog={hostedCatalog} send={env.send} busy={false} />, {
    wrapper: env.wrapper,
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_media_upload' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'com_media_reference_url' }), {
    target: { value: hostedReference.sourceURL },
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_media_add_reference_url' }));
  expect(screen.getByText('com_media_reference_loading')).toBeInTheDocument();
  const signal = jest.mocked(dataService.uploadMediaURL).mock.calls[0][1];
  fireEvent.click(screen.getByRole('button', { name: 'com_ui_cancel' }));
  expect(signal?.aborted).toBe(true);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'com_media_upload' }));
  await act(async () => finish(hostedReference));
  expect(env.store.get(mediaDraftFamily('owner:new')).inputs).toEqual([]);
  expect(screen.getByRole('textbox', { name: 'com_media_reference_url' })).toHaveValue(
    hostedReference.sourceURL,
  );
  jest
    .mocked(dataService.uploadMediaURL)
    .mockRejectedValueOnce({ response: { data: { error: { code: 'transfer_failed' } } } });
  fireEvent.click(screen.getByRole('button', { name: 'com_media_add_reference_url' }));
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'com_media_add_reference_url' })).toBeEnabled();
  jest.mocked(dataService.uploadMediaURL).mockResolvedValueOnce(hostedReference);
  fireEvent.click(screen.getByRole('button', { name: 'com_media_add_reference_url' }));
  await waitFor(() => expect(env.store.get(mediaDraftFamily('owner:new')).inputs).toHaveLength(1));
});

test('a locally uploaded video stays blocked when a refreshed model requires a hosted reference', () => {
  const env = setup();
  env.store.set(mediaDraftFamily('owner:new'), {
    ...emptyDraft(),
    operation: 'video.generate',
    prompt: 'Edit this video',
    inputs: [{ file_id: 'local-clip', role: 'video' }],
    assets: [{ ...hostedReference.file, file_id: 'local-clip' }],
  });
  render(<MediaForm catalog={hostedCatalog} send={env.send} busy={false} />, {
    wrapper: env.wrapper,
  });
  expect(screen.getByText('com_media_reference_needs_url')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'com_media_queue' })).toBeDisabled();
});

test.each(['reference_unavailable', 'reference_changed'] as const)(
  'explains the %s URL failure and keeps the reference draft for correction',
  async (code) => {
    const env = setup();
    render(<MediaForm catalog={hostedCatalog} send={env.send} busy={false} />, {
      wrapper: env.wrapper,
    });
    fireEvent.click(screen.getByRole('button', { name: 'com_media_upload' }));
    jest
      .mocked(dataService.uploadMediaURL)
      .mockRejectedValueOnce({ response: { data: { error: { code } } } });
    fireEvent.change(screen.getByRole('textbox', { name: 'com_media_reference_url' }), {
      target: { value: hostedReference.sourceURL },
    });
    fireEvent.click(screen.getByRole('button', { name: 'com_media_add_reference_url' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(`com_media_error_${code}`),
    );
    expect(screen.getByRole('textbox', { name: 'com_media_reference_url' })).toHaveValue(
      hostedReference.sourceURL,
    );
    expect(screen.getByRole('button', { name: 'com_media_add_reference_url' })).toBeEnabled();
    expect(env.store.get(mediaDraftFamily('owner:new')).inputs).toHaveLength(0);
  },
);

test('imports an explicitly selected hosted audio role without satisfying a mandatory video input', async () => {
  const env = setup();
  render(<MediaForm catalog={hostedCatalog} send={env.send} busy={false} />, {
    wrapper: env.wrapper,
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_media_upload' }));
  fireEvent.click(screen.getByRole('combobox', { name: 'com_media_reference_url_role' }));
  fireEvent.click(await screen.findByRole('option', { name: 'com_media_role_audio' }));
  const audio = {
    sourceURL: 'https://media.example.com/reference.mp3',
    file: { ...hostedReference.file, file_id: 'hosted-audio', type: 'audio/mpeg' },
  };
  jest.mocked(dataService.uploadMediaURL).mockResolvedValueOnce(audio);
  fireEvent.change(screen.getByRole('textbox', { name: 'com_media_reference_url' }), {
    target: { value: audio.sourceURL },
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_media_add_reference_url' }));
  await waitFor(() =>
    expect(env.store.get(mediaDraftFamily('owner:new')).inputs).toEqual([
      { file_id: 'hosted-audio', role: 'audio', sourceURL: audio.sourceURL },
    ]),
  );
  expect(screen.getByLabelText('com_media_audio_preview')).toHaveAttribute('controls');
  expect(screen.getByRole('button', { name: 'com_media_queue' })).toBeDisabled();
});

test('refining and editing a saved hosted input preserves its source URL', async () => {
  const env = setup();
  const now = '2026-01-01T00:00:00.000Z';
  const selection = {
    connectionId: 'connection',
    modelId: 'image-model',
    catalogVersion: 'catalog',
  };
  const input = {
    file_id: hostedReference.file.file_id,
    role: 'video' as const,
    sourceURL: hostedReference.sourceURL,
  };
  const detail: MediaThreadDetail = {
    thread: {
      schemaVersion: 1,
      threadId: 'thread',
      title: 'Video work',
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
          inputs: [input],
          selection,
          operation: 'video.generate',
          assets: [hostedReference.file],
          jobs: [
            {
              schemaVersion: 1,
              jobId: 'job',
              threadId: 'thread',
              turnId: 'parent',
              version: 1,
              phase: 'failed',
              executionOwner: 'media',
              operation: 'video.generate',
              selection,
              createdAt: now,
              updatedAt: now,
              allowedActions: { cancel: false, retry: false },
              outputs: [],
            },
          ],
        },
      ],
    },
  };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MediaForm catalog={hostedCatalog} threadId="thread" send={env.send} busy={false} />
      <MediaThreadView
        detail={detail}
        catalog={hostedCatalog}
        send={env.send}
        onDeleted={() => {}}
      />
    </QueryClientProvider>,
    { wrapper: env.wrapper },
  );
  fireEvent.click(screen.getByRole('button', { name: 'com_media_refine' }));
  expect(env.store.get(mediaDraftFamily('owner:thread')).inputs).toEqual([input]);
  fireEvent.click(screen.getByRole('button', { name: 'com_media_edit_request' }));
  expect(env.store.get(mediaDraftFamily('owner:thread')).inputs).toEqual([input]);
  expect(screen.getByRole('button', { name: 'com_media_queue' })).toBeEnabled();
});
