import { QueryKeys } from 'librechat-data-provider';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TBalanceResponse } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import useCreditRequestStatus from './useCreditRequestStatus';

const mockUseGetUserBalance = jest.fn();
const mockUseGetStartupConfig = jest.fn();

jest.mock('~/data-provider', () => ({
  useGetUserBalance: () => mockUseGetUserBalance(),
  useGetStartupConfig: () => mockUseGetStartupConfig(),
}));

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ isAuthenticated: true }),
  useLocalize: () => (key: string) => key,
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: jest.fn() }),
}));

function renderStatusHook() {
  const queryClient = new QueryClient();
  const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return { invalidateSpy, ...renderHook(() => useCreditRequestStatus(), { wrapper }) };
}

function refillBalance(overrides: Partial<TBalanceResponse> = {}): TBalanceResponse {
  return {
    tokenCredits: 0,
    autoRefillEnabled: true,
    lastRefill: new Date().toISOString(),
    refillIntervalValue: 5,
    refillIntervalUnit: 'seconds',
    refillMode: 'add',
    ...overrides,
  };
}

describe('useCreditRequestStatus refill scheduling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockUseGetStartupConfig.mockReturnValue({ data: { balance: { enabled: true } } });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('invalidates the balance query when the refill deadline elapses', () => {
    mockUseGetUserBalance.mockReturnValue({ data: refillBalance() });
    const { invalidateSpy } = renderStatusHook();

    act(() => {
      jest.advanceTimersByTime(6_000);
    });

    expect(invalidateSpy).toHaveBeenCalledWith([QueryKeys.balance]);
  });

  it('invalidates immediately when the refill is already overdue', () => {
    mockUseGetUserBalance.mockReturnValue({
      data: refillBalance({
        lastRefill: new Date('2020-01-01').toISOString(),
        refillIntervalValue: 1,
        refillIntervalUnit: 'days',
      }),
    });

    const { invalidateSpy } = renderStatusHook();

    expect(invalidateSpy).toHaveBeenCalledWith([QueryKeys.balance]);
  });

  it('does not poll an overdue add-mode balance while credits remain', () => {
    mockUseGetUserBalance.mockReturnValue({
      data: refillBalance({
        tokenCredits: 500,
        lastRefill: new Date('2020-01-01').toISOString(),
        refillIntervalValue: 1,
        refillIntervalUnit: 'days',
      }),
    });

    const { invalidateSpy } = renderStatusHook();
    act(() => {
      jest.advanceTimersByTime(10 * 60 * 1000);
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('does refresh an overdue reset-mode balance while credits remain', () => {
    mockUseGetUserBalance.mockReturnValue({
      data: refillBalance({
        tokenCredits: 500,
        refillMode: 'reset',
        lastRefill: new Date('2020-01-01').toISOString(),
        refillIntervalValue: 1,
        refillIntervalUnit: 'days',
      }),
    });

    const { invalidateSpy } = renderStatusHook();

    expect(invalidateSpy).toHaveBeenCalledWith([QueryKeys.balance]);
  });

  it('starts polling when an overdue add-mode balance reaches zero', () => {
    const overdue = {
      autoRefillEnabled: true,
      lastRefill: new Date('2020-01-01').toISOString(),
      refillIntervalValue: 1,
      refillIntervalUnit: 'days',
      refillMode: 'add',
    };
    mockUseGetUserBalance.mockReturnValue({ data: { ...overdue, tokenCredits: 500 } });
    const { invalidateSpy, rerender } = renderStatusHook();

    mockUseGetUserBalance.mockReturnValue({ data: { ...overdue, tokenCredits: 0 } });
    rerender();

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });

  it('retries an unchanged overdue balance with bounded backoff', () => {
    mockUseGetUserBalance.mockReturnValue({
      data: refillBalance({
        lastRefill: new Date('2020-01-01').toISOString(),
        refillIntervalValue: 1,
        refillIntervalUnit: 'days',
      }),
    });
    const { invalidateSpy } = renderStatusHook();

    act(() => {
      jest.advanceTimersByTime(10 * 60 * 1000);
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(7);

    act(() => {
      jest.advanceTimersByTime(60 * 60 * 1000);
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(7);
  });

  it('abandons the retry chain after a confirmed refill moves the deadline', () => {
    mockUseGetUserBalance.mockReturnValue({
      data: refillBalance({
        lastRefill: new Date('2020-01-01').toISOString(),
        refillIntervalValue: 1,
        refillIntervalUnit: 'days',
      }),
    });
    const { invalidateSpy, rerender } = renderStatusHook();

    mockUseGetUserBalance.mockReturnValue({
      data: refillBalance({
        tokenCredits: 1000,
        lastRefill: new Date().toISOString(),
        refillIntervalValue: 1,
        refillIntervalUnit: 'days',
      }),
    });
    rerender();
    act(() => {
      jest.advanceTimersByTime(5_000);
    });

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });

  it('does not overflow long setTimeout delays', () => {
    mockUseGetUserBalance.mockReturnValue({
      data: refillBalance({ refillIntervalValue: 1, refillIntervalUnit: 'months' }),
    });
    const { invalidateSpy } = renderStatusHook();

    act(() => {
      jest.advanceTimersByTime(60_000);
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('clears the scheduled check on unmount', () => {
    mockUseGetUserBalance.mockReturnValue({ data: refillBalance() });
    const { invalidateSpy, unmount } = renderStatusHook();

    unmount();
    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
