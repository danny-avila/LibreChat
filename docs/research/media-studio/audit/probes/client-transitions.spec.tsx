/** Audit diagnostics: these assertions document the current defects, not desired behavior. */
import React from 'react';
import { Provider, createStore } from 'jotai';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { dataService } from 'librechat-data-provider';
import type { MediaCatalog, MediaSubmissionReceipt } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { MediaHostProvider } from '~/components/Media/host';
import { clearMediaSessionStorage } from '~/components/Media/state';
import { useMediaCommands } from '~/components/Media/commands';
import { MediaForm } from '~/components/Media/Form';

jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
jest.mock('librechat-data-provider', () => {
  const actual =
    jest.requireActual<typeof import('librechat-data-provider')>('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService } };
});
jest.mock('~/components/Input/SetKeyDialog/SetKeyDialog', () => ({
  __esModule: true,
  default: () => null,
}));

const capability = {
  operation: 'image.generate' as const,
  inputs: { min: 0, max: 0, roles: [] },
  execution: { kind: 'direct' as const, previews: false },
  controls: { count: { min: 1, max: 1, default: 1 } },
};
const catalog: MediaCatalog = {
  schemaVersion: 1,
  version: 'audit',
  clientPollIntervalMs: 60_000,
  clientCatchUpIntervalMs: 60_000,
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
    maxPresets: 50,
  },
  offerings: ['model-a', 'model-b'].map((modelId) => ({
    connectionId: 'audit',
    connectionName: 'Audit connection',
    modelId,
    modelName: modelId,
    api: 'openai.images',
    available: true,
    capabilities: [capability],
  })),
};

const clients: QueryClient[] = [];
function mount(compare = false) {
  const store = createStore();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  });
  clients.push(client);
  function Harness() {
    const localize = useLocalize();
    const commands = useMediaCommands([]);
    return (
      <>
        <MediaForm catalog={catalog} send={commands.send} busy={commands.sending.size > 0} />
        {commands.pending.length > 0 && (
          <button
            disabled={commands.sending.size > 0}
            onClick={() => void commands.send(commands.pending[0])}
          >
            {localize('com_media_recover_request')}
          </button>
        )}
      </>
    );
  }
  return render(
    <Provider store={store}>
      <QueryClientProvider client={client}>
        <MediaHostProvider
          value={{
            scope: 'audit-owner',
            canCreate: true,
            pollIntervalMs: 60_000,
            catchUpIntervalMs: 60_000,
            enterToSend: false,
            isCurrentSession: () => true,
            openThread: () => {},
            features: { compare },
          }}
        >
          <Harness />
        </MediaHostProvider>
      </QueryClientProvider>
    </Provider>,
  );
}

function lostFirstResponse() {
  const accepted = new Map<string, MediaSubmissionReceipt>();
  const submit = jest.spyOn(dataService, 'submitMedia').mockImplementation(async (request) => {
    let receipt = accepted.get(request.clientRequestId);
    if (!receipt) {
      receipt = {
        schemaVersion: 1,
        phase: 'accepted',
        clientRequestId: request.clientRequestId,
        threadId: 'thread-' + accepted.size,
        turnId: 'turn-' + accepted.size,
        jobId: 'job-' + accepted.size,
      };
      accepted.set(request.clientRequestId, receipt);
      if (accepted.size === 1) throw new Error('Injected lost HTTP response after acceptance');
    }
    return receipt;
  });
  jest
    .spyOn(dataService, 'getMediaSubmission')
    .mockRejectedValue(new Error('Injected lookup outage'));
  return { accepted, submit };
}

beforeEach(() => clearMediaSessionStorage());
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  jest.restoreAllMocks();
});

test('diagnostic: ordinary Queue after a lost response creates a second billable identity from the unchanged draft', async () => {
  const backend = lostFirstResponse();
  mount();
  const prompt = await screen.findByRole('textbox', { name: 'com_media_prompt' });
  fireEvent.change(prompt, { target: { value: 'Audit lake' } });
  fireEvent.click(screen.getByRole('button', { name: 'com_media_queue' }));
  await waitFor(() => expect(backend.accepted.size).toBe(1));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'com_media_queue' })).toBeEnabled(),
  );
  expect(prompt).toHaveValue('Audit lake');
  fireEvent.click(screen.getByRole('button', { name: 'com_media_queue' }));
  await waitFor(() => expect(backend.accepted.size).toBe(2));
  const [first, second] = backend.submit.mock.calls.map(([request]) => request);
  expect(first.clientRequestId).not.toBe(second.clientRequestId);
  expect({ ...first, clientRequestId: '' }).toEqual({ ...second, clientRequestId: '' });
  console.info(
    JSON.stringify({
      scenario: 'ordinary queue after uncertain acceptance',
      unchangedDraft: true,
      uniqueAcceptedJobs: backend.accepted.size,
      expectedWhenRecovering: 1,
    }),
  );
});

test('diagnostic: recovering a comparison after its first lost response never dispatches its second model', async () => {
  const backend = lostFirstResponse();
  mount(true);
  fireEvent.click(await screen.findByRole('button', { name: 'com_media_compare_add' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'com_media_prompt' }), {
    target: { value: 'Compare audit lake' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_media_queue' }));
  await waitFor(() => expect(backend.submit).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'com_media_recover_request' })).toBeEnabled(),
  );
  expect(backend.submit.mock.calls[0][0].comparisonId).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'com_media_recover_request' }));
  await waitFor(() => expect(backend.submit).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'com_media_prompt' })).toHaveValue(''),
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(backend.accepted.size).toBe(1);
  const requests = backend.submit.mock.calls.map(([request]) => request);
  expect(requests[1].clientRequestId).toBe(requests[0].clientRequestId);
  expect(requests.map((request) => request.selection.modelId)).toEqual(['model-a', 'model-a']);
  console.info(
    JSON.stringify({
      scenario: 'recover comparison after lost first response',
      uniqueAcceptedJobs: 1,
      requestedModels: requests.map((request) => request.selection.modelId),
      expectedModels: ['model-a', 'model-b'],
    }),
  );
});
