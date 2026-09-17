import React from 'react';
import { AxiosError, AxiosHeaders } from 'axios';
import { dataService } from 'librechat-data-provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMediaThreads } from '../queries';

jest.mock('librechat-data-provider', () => {
  const actual =
    jest.requireActual<typeof import('librechat-data-provider')>('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService, listMediaThreads: jest.fn() } };
});

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const host = {
    scope: 'owner',
    pollIntervalMs: 60000,
    catchUpIntervalMs: 60000,
    isCurrentSession: () => true,
  };
  return { client, wrapper, host };
}

function rejected(status: number) {
  const error = new AxiosError('Request rejected');
  error.response = {
    status,
    statusText: 'Rejected',
    data: {},
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
  return error;
}

beforeEach(() => jest.mocked(dataService.listMediaThreads).mockReset());

test('falls back once when an older server rejects the optional gallery view', async () => {
  const list = jest
    .mocked(dataService.listMediaThreads)
    .mockRejectedValueOnce(rejected(422))
    .mockResolvedValue({ items: [] });
  const env = setup();
  const hook = renderHook(() => useMediaThreads(env.host, 'all'), { wrapper: env.wrapper });
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  expect(list.mock.calls[0][0]).toMatchObject({ include: 'activity' });
  expect(list.mock.calls[1][0]).not.toHaveProperty('include');
  await act(async () => {
    await hook.result.current.refetch();
  });
  expect(list.mock.calls[2][0]).not.toHaveProperty('include');
  hook.unmount();
  env.client.clear();
});

test('preserves authorization failures instead of retrying a different gallery request', async () => {
  const list = jest.mocked(dataService.listMediaThreads).mockRejectedValue(rejected(403));
  const env = setup();
  const hook = renderHook(() => useMediaThreads(env.host, 'all'), { wrapper: env.wrapper });
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(list).toHaveBeenCalledTimes(1);
  hook.unmount();
  env.client.clear();
});
