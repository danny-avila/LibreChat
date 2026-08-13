import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { getClerkAuthErrorCode, useClerkLoginMutation, useLoginUserMutation } from '../mutations';

const mockEvents: string[] = [];
const mockLogin = jest.fn();
const mockLoginClerk = jest.fn();

jest.mock('recoil', () => ({
  ...jest.requireActual('recoil'),
  useResetRecoilState: () => () => mockEvents.push('reset-preset'),
  useSetRecoilState: () => (enabled: boolean) => mockEvents.push(`queries:${enabled}`),
}));

jest.mock('~/hooks/Config/useClearStates', () => ({
  __esModule: true,
  default: () => () => mockEvents.push('clear-states'),
}));

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      login: (...args: unknown[]) => mockLogin(...args),
      loginClerk: (...args: unknown[]) => mockLoginClerk(...args),
    },
  };
});

function renderMutation<T>(hook: () => T) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  jest.spyOn(queryClient, 'removeQueries').mockImplementation(() => {
    mockEvents.push('remove-queries');
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return renderHook(hook, { wrapper });
}

describe('shared login mutation lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEvents.length = 0;
  });

  const expectSuccessfulLifecycle = async (invoke: () => Promise<unknown>) => {
    await act(async () => {
      await invoke();
    });

    expect(mockEvents).toEqual([
      'queries:false',
      'reset-preset',
      'clear-states',
      'remove-queries',
      'caller-mutate',
      'caller-success',
    ]);
  };

  it('clears state before the local request and leaves query re-enable to context', async () => {
    expect.hasAssertions();
    mockLogin.mockResolvedValue({ token: 'token', user: { id: 'user-1' } });
    const { result } = renderMutation(() =>
      useLoginUserMutation({
        onMutate: () => {
          mockEvents.push('caller-mutate');
        },
        onSuccess: () => mockEvents.push('caller-success'),
      }),
    );

    await expectSuccessfulLifecycle(() =>
      result.current.mutateAsync({ email: 'user@example.com', password: 'password' }),
    );
  });

  it('clears state before the Clerk request and leaves query re-enable to context', async () => {
    expect.hasAssertions();
    mockLoginClerk.mockResolvedValue({ token: 'token', user: { id: 'user-1' } });
    const { result } = renderMutation(() =>
      useClerkLoginMutation({
        onMutate: () => {
          mockEvents.push('caller-mutate');
        },
        onSuccess: () => mockEvents.push('caller-success'),
      }),
    );

    await expectSuccessfulLifecycle(() =>
      result.current.mutateAsync({ clerkToken: 'clerk-session-token' }),
    );
  });

  it('re-enables queries before the Clerk caller receives an error', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockLoginClerk.mockRejectedValue(new Error('request failed'));
    const { result } = renderMutation(() =>
      useClerkLoginMutation({
        onError: () => mockEvents.push('caller-error'),
      }),
    );

    await act(async () => {
      await expect(
        result.current.mutateAsync({ clerkToken: 'clerk-session-token' }),
      ).rejects.toThrow('request failed');
    });

    expect(mockEvents.slice(-2)).toEqual(['queries:true', 'caller-error']);
    expect(consoleError).toHaveBeenCalled();
  });
});

describe('getClerkAuthErrorCode', () => {
  it.each([
    undefined,
    null,
    'CLERK_TOKEN_REPLAYED',
    {},
    { response: null },
    { response: { data: null } },
    { response: { data: { code: 409 } } },
    { response: { data: { code: 'NOT_A_CLERK_CODE' } } },
  ])('returns undefined for non-contract error shape %#', (error) => {
    expect(getClerkAuthErrorCode(error)).toBeUndefined();
  });

  it('returns an exact stable Clerk error code from an Axios-shaped error', () => {
    expect(getClerkAuthErrorCode({ response: { data: { code: 'CLERK_TOKEN_REPLAYED' } } })).toBe(
      'CLERK_TOKEN_REPLAYED',
    );
  });
});
