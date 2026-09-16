import React from 'react';
import { Provider, createStore } from 'jotai';
import { dataService, QueryKeys } from 'librechat-data-provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MediaSubmissionReceipt } from 'librechat-data-provider';
import type { PendingMedia } from '../state';
import {
  clearMediaSessionStorage,
  emptyDraft,
  mediaDraftFamily,
  mediaPendingFamily,
} from '../state';
import { useMediaCommands } from '../commands';
import { MediaHostProvider } from '../host';

jest.mock('librechat-data-provider', () => {
  const actual =
    jest.requireActual<typeof import('librechat-data-provider')>('librechat-data-provider');
  return {
    ...actual,
    dataService: { ...actual.dataService, submitMedia: jest.fn(), getMediaSubmission: jest.fn() },
  };
});

const command: PendingMedia = {
  kind: 'submission',
  draftKey: 'owner:new',
  draftRevision: 3,
  request: {
    schemaVersion: 1,
    clientRequestId: 'request',
    operation: 'image.generate',
    prompt: 'A lake',
    inputs: [],
    parameters: { count: 1 },
    selection: { connectionId: 'connection', modelId: 'model', catalogVersion: 'catalog' },
  },
};
const preparing: MediaSubmissionReceipt = {
  schemaVersion: 1,
  clientRequestId: 'request',
  threadId: 'thread',
  turnId: 'turn',
  jobId: 'job',
  phase: 'preparing',
};

function setup() {
  const store = createStore();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    logger: { log: console.log, warn: console.warn, error: () => {} },
  });
  let active = true;
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>
      <QueryClientProvider client={client}>
        <MediaHostProvider
          value={{
            scope: 'owner',
            canCreate: true,
            pollIntervalMs: 60000,
            catchUpIntervalMs: 60000,
            enterToSend: false,
            isCurrentSession: () => active,
            openThread: () => {},
          }}
        >
          {children}
        </MediaHostProvider>
      </QueryClientProvider>
    </Provider>
  );
  return {
    store,
    client,
    wrapper,
    endSession: () => {
      active = false;
    },
  };
}

beforeEach(() => {
  clearMediaSessionStorage();
  jest.resetAllMocks();
});

test('a preparing receipt keeps the draft until accepted and does not vanish during projection lag', async () => {
  jest.mocked(dataService.submitMedia).mockResolvedValue(preparing);
  jest.mocked(dataService.getMediaSubmission).mockResolvedValue(preparing);
  const env = setup();
  env.store.set(mediaDraftFamily(command.draftKey), {
    ...emptyDraft(),
    prompt: 'A lake',
    revision: 3,
  });
  const hook = renderHook(({ visible }) => useMediaCommands(visible), {
    wrapper: env.wrapper,
    initialProps: { visible: [] as string[] },
  });
  await act(async () => {
    await hook.result.current.send(command);
  });
  expect(env.store.get(mediaDraftFamily(command.draftKey)).prompt).toBe('A lake');
  expect(hook.result.current.pending).toHaveLength(1);
  act(() =>
    env.client.setQueryData([QueryKeys.mediaSubmission, 'owner', 'request'], {
      ...preparing,
      phase: 'accepted',
    }),
  );
  await waitFor(() => expect(env.store.get(mediaDraftFamily(command.draftKey)).prompt).toBe(''));
  expect(hook.result.current.pending).toHaveLength(1);
  hook.rerender({ visible: ['thread'] });
  await waitFor(() => expect(hook.result.current.pending).toHaveLength(0));
  env.client.clear();
});

test('lost responses retain the same request identity and recovery cannot erase newer draft edits', async () => {
  const submit = jest
    .mocked(dataService.submitMedia)
    .mockRejectedValueOnce(new Error('connection lost'))
    .mockResolvedValueOnce({ ...preparing, phase: 'accepted' });
  jest.mocked(dataService.getMediaSubmission).mockRejectedValue(new Error('not projected yet'));
  const env = setup();
  env.store.set(mediaDraftFamily(command.draftKey), {
    ...emptyDraft(),
    prompt: 'Newer lake',
    revision: 4,
  });
  const hook = renderHook(() => useMediaCommands([]), { wrapper: env.wrapper });
  await act(async () => {
    await hook.result.current.send(command);
  });
  expect(hook.result.current.pending[0].request.clientRequestId).toBe('request');
  await act(async () => {
    await hook.result.current.send(hook.result.current.pending[0]);
  });
  expect(submit.mock.calls[0][0]).toEqual(submit.mock.calls[1][0]);
  expect(env.store.get(mediaDraftFamily(command.draftKey)).prompt).toBe('Newer lake');
  env.client.clear();
});

test('an account change discards a late receipt and leaves the next session cache untouched', async () => {
  let finish: (value: MediaSubmissionReceipt) => void = () => {};
  jest.mocked(dataService.submitMedia).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  jest.mocked(dataService.getMediaSubmission).mockRejectedValue(new Error('pending'));
  const env = setup();
  const hook = renderHook(() => useMediaCommands([]), { wrapper: env.wrapper });
  let sending: Promise<void>;
  act(() => {
    sending = hook.result.current.send(command);
  });
  env.endSession();
  await act(async () => {
    finish({ ...preparing, phase: 'accepted' });
    await sending;
  });
  expect(env.client.getQueryData([QueryKeys.mediaSubmission, 'owner', 'request'])).toBeUndefined();
  env.client.clear();
});

test('a definite validation rejection preserves the draft without an unrecoverable pending command', async () => {
  jest
    .mocked(dataService.submitMedia)
    .mockRejectedValue({ response: { status: 400, data: { error: { code: 'invalid_request' } } } });
  jest.mocked(dataService.getMediaSubmission).mockRejectedValue(new Error('absent'));
  const env = setup();
  env.store.set(mediaDraftFamily(command.draftKey), {
    ...emptyDraft(),
    prompt: 'A lake',
    revision: 3,
  });
  const hook = renderHook(() => useMediaCommands([]), { wrapper: env.wrapper });
  await act(async () => {
    await hook.result.current.send(command);
  });
  expect(env.store.get(mediaPendingFamily('owner'))).toEqual([]);
  expect(env.store.get(mediaDraftFamily(command.draftKey)).prompt).toBe('A lake');
  expect(hook.result.current.error).toBe('invalid_request');
  env.client.clear();
});
