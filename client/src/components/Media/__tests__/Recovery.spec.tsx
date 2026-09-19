import React from 'react';
import { Provider, createStore } from 'jotai';
import { dataService } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MediaRecoveryJob } from 'librechat-data-provider';
import { clearMediaSessionStorage, mediaRecoveryFamily } from '../state';
import MediaRecovery from '../Recovery';

jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
jest.mock('librechat-data-provider', () => {
  const actual =
    jest.requireActual<typeof import('librechat-data-provider')>('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService } };
});

const job: MediaRecoveryJob = {
  ownerId: 'owner',
  jobId: 'job',
  threadId: 'thread',
  version: 3,
  phase: 'requires_attention',
  executionOwner: 'media',
  operation: 'video.generate',
  selection: { connectionId: 'provider', modelId: 'model', catalogVersion: 'catalog' },
  provider: { certainty: 'submitted', operationId: 'provider-operation' },
  accounting: { mode: 'balance', phase: 'held', credits: 100 },
  allowedActions: { resume: true, settle: true, acknowledge: false },
  createdAt: '2026-09-17T12:00:00.000Z',
  updatedAt: '2026-09-17T12:00:00.000Z',
};
const clients: QueryClient[] = [];
function mount() {
  const store = createStore();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  });
  clients.push(client);
  let active = true;
  const view = render(
    <Provider store={store}>
      <QueryClientProvider client={client}>
        <MediaRecovery host={{ scope: 'admin', isCurrentSession: () => active }} />
      </QueryClientProvider>
    </Provider>,
  );
  return {
    ...view,
    store,
    client,
    endSession: () => {
      active = false;
    },
  };
}
async function openJob() {
  fireEvent.click(screen.getByRole('button', { name: 'com_media_recovery_open' }));
  fireEvent.click(await screen.findByRole('button', { name: 'com_media_recovery_review' }));
}
beforeEach(() => {
  clearMediaSessionStorage();
  jest
    .spyOn(dataService, 'listMediaRecoveryJobs')
    .mockResolvedValue({ items: [job], maxEvidenceChars: 200 });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  jest.restoreAllMocks();
});

test('recovery loads only when opened and presents its loading and empty states', async () => {
  let resolve!: (value: { items: MediaRecoveryJob[]; maxEvidenceChars: number }) => void;
  jest.mocked(dataService.listMediaRecoveryJobs).mockImplementation(
    () =>
      new Promise((accept) => {
        resolve = accept;
      }),
  );
  mount();
  expect(dataService.listMediaRecoveryJobs).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'com_media_recovery_open' }));
  expect(await screen.findByText('com_media_loading')).toBeVisible();
  await act(async () => resolve({ items: [], maxEvidenceChars: 200 }));
  expect(await screen.findByText('com_media_recovery_empty')).toBeVisible();
});

test('a forbidden list never exposes cached jobs or recovery controls', async () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'com_media_recovery_open' }));
  await screen.findByRole('button', { name: 'com_media_recovery_review' });
  jest
    .mocked(dataService.listMediaRecoveryJobs)
    .mockRejectedValue({ response: { status: 403, data: { error: { code: 'forbidden' } } } });
  fireEvent.click(screen.getByRole('button', { name: 'com_ui_refresh' }));
  expect(await screen.findByText('com_media_error_forbidden')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'com_media_recovery_review' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('model')).not.toBeInTheDocument();
});

test('financial settlement requires evidence, an explicit actual cost, and confirmation', async () => {
  const settle = jest
    .spyOn(dataService, 'recoverMediaJob')
    .mockResolvedValue({ ...job, version: 4, phase: 'reconciling' });
  mount();
  await openJob();
  fireEvent.click(screen.getByRole('radio', { name: 'com_media_recovery_settle' }));
  const apply = screen.getByRole('button', { name: 'com_media_recovery_apply' });
  expect(apply).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: 'com_media_recovery_evidence' }), {
    target: { value: 'Provider invoice INV-42' },
  });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'com_media_recovery_cost' }), {
    target: { value: '0' },
  });
  expect(apply).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(apply);
  await waitFor(() => expect(settle).toHaveBeenCalledTimes(1));
  expect(settle.mock.calls[0]).toEqual([
    'owner',
    'job',
    expect.objectContaining({
      action: 'settle',
      costUSD: 0,
      terminalStatus: 'failed',
      expectedVersion: 3,
      evidence: 'Provider invoice INV-42',
    }),
  ]);
  expect(await screen.findByText('com_media_recovery_success')).toBeVisible();
});

test('a lost response and reload retain the exact recovery identity and locked evidence', async () => {
  const recover = jest
    .spyOn(dataService, 'recoverMediaJob')
    .mockRejectedValueOnce(new Error('Lost receipt'))
    .mockResolvedValueOnce({ ...job, version: 4, phase: 'running' });
  const first = mount();
  await openJob();
  fireEvent.change(screen.getByRole('textbox', { name: 'com_media_recovery_evidence' }), {
    target: { value: 'Provider operation confirmed active' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_media_recovery_apply' }));
  await screen.findByText('com_media_error_internal_error');
  const saved = first.store.get(mediaRecoveryFamily('admin'))[0];
  expect(saved.request.clientRequestId).toBeTruthy();
  first.unmount();
  first.client.clear();
  mediaRecoveryFamily.remove('admin');
  mount();
  await openJob();
  expect(screen.getByRole('textbox', { name: 'com_media_recovery_evidence' })).toHaveValue(
    saved.request.evidence,
  );
  expect(screen.getByRole('textbox', { name: 'com_media_recovery_evidence' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'com_media_recovery_retry_same' }));
  await waitFor(() => expect(recover).toHaveBeenCalledTimes(2));
  expect(recover.mock.calls[1]).toEqual(recover.mock.calls[0]);
  expect(await screen.findByText('com_media_recovery_success')).toBeVisible();
});

test('version conflict refreshes the list and requires reviewing the new snapshot', async () => {
  const recover = jest.spyOn(dataService, 'recoverMediaJob').mockRejectedValue({
    response: { status: 409, data: { error: { code: 'version_conflict' } } },
  });
  const env = mount();
  await openJob();
  jest
    .mocked(dataService.listMediaRecoveryJobs)
    .mockResolvedValue({ items: [{ ...job, version: 4 }], maxEvidenceChars: 200 });
  fireEvent.change(screen.getByRole('textbox', { name: 'com_media_recovery_evidence' }), {
    target: { value: 'Provider support reference' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_media_recovery_apply' }));
  expect(await screen.findByText('com_media_error_version_conflict')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'com_media_recovery_apply' }),
  ).not.toBeInTheDocument();
  expect(env.store.get(mediaRecoveryFamily('admin'))).toEqual([]);
  await waitFor(() => expect(dataService.listMediaRecoveryJobs).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole('button', { name: 'com_media_recovery_review' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'com_media_recovery_evidence' }), {
    target: { value: 'Reviewed updated provider state' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_media_recovery_apply' }));
  await waitFor(() => expect(recover).toHaveBeenCalledTimes(2));
  expect(recover.mock.calls[1][2].expectedVersion).toBe(4);
  expect(recover.mock.calls[1][2].clientRequestId).not.toBe(
    recover.mock.calls[0][2].clientRequestId,
  );
});
