import React from 'react';
import { SSE } from 'sse.js';
import { QueryKeys } from 'librechat-data-provider';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMediaEvents } from '../events';

jest.mock('sse.js', () => ({ SSE: jest.fn() }));

test('valid nudges invalidate only the current owner and denial closes without retries', async () => {
  const handlers = new Map<string, (event: unknown) => void>();
  const close = jest.fn();
  jest.mocked(SSE).mockImplementation(
    () =>
      ({
        close,
        addEventListener: (name: string, callback: (event: unknown) => void) =>
          handlers.set(name, callback),
      }) as unknown as SSE,
  );
  const client = new QueryClient();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  let active = true;
  const host = {
    scope: 'tenant-owner',
    pollIntervalMs: 100,
    catchUpIntervalMs: 1000,
    isCurrentSession: () => active,
  };
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  jest.useFakeTimers();
  const hook = renderHook(() => useMediaEvents(host, 'test-token', true), { wrapper });
  await act(async () =>
    handlers.get('message')?.({
      data: JSON.stringify({ event: 'media_update', data: { threadId: 'thread', version: 2 } }),
    }),
  );
  expect(invalidate).toHaveBeenCalledWith([QueryKeys.mediaThread, host.scope, 'thread']);
  invalidate.mockClear();
  active = false;
  await act(async () => handlers.get('message')?.({ data: JSON.stringify({ ready: true }) }));
  expect(invalidate).not.toHaveBeenCalled();
  await act(async () => {
    handlers.get('error')?.({ responseCode: 403 });
    jest.advanceTimersByTime(10000);
  });
  expect(SSE).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
  hook.unmount();
  client.clear();
  jest.useRealTimers();
});
