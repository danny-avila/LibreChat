import { grantLeaseKey, withLease } from './lease';

describe('withLease', () => {
  afterEach(() => jest.useRealTimers());

  it('renews the lease while the callback is still running', async () => {
    jest.useFakeTimers();
    const lease = {
      acquireResourceLock: jest.fn().mockResolvedValue(true),
      renewResourceLock: jest.fn().mockResolvedValue(true),
      releaseResourceLock: jest.fn().mockResolvedValue(true),
    };
    const run = withLease(
      lease,
      'k',
      () => new Promise<string>((resolve) => setTimeout(() => resolve('done'), 25_000)),
    );

    await jest.advanceTimersByTimeAsync(25_000);

    await expect(run).resolves.toBe('done');
    expect(lease.renewResourceLock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(lease.releaseResourceLock).toHaveBeenCalledTimes(1);
  });

  it('keys one grant the same for a user ObjectId in either case', () => {
    const hex = 'abcdef0123456789abcdef01';
    expect(grantLeaseKey('user', hex, 'cap')).toBe(grantLeaseKey('USER', hex.toUpperCase(), 'cap'));
  });

  it('keeps role names case-sensitive', () => {
    const hex = 'abcdef0123456789abcdef01';
    expect(grantLeaseKey('role', hex, 'cap')).not.toBe(
      grantLeaseKey('role', hex.toUpperCase(), 'cap'),
    );
  });
});
