import { reapOrphanedPRAutomations, startPRAutomationReaper } from './automation';
import { isLeader } from '~/cluster';

jest.mock('~/cluster', () => ({ isLeader: jest.fn() }));

describe('PR automation reaper', () => {
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('follows the cursor until every page was read', async () => {
    const reapPRAutomations = jest
      .fn()
      .mockResolvedValueOnce({ scanned: 100, removed: 2, next: 'a' })
      .mockResolvedValueOnce({ scanned: 3, removed: 1 });

    expect(await reapOrphanedPRAutomations({ reapPRAutomations })).toBe(3);
    expect(reapPRAutomations.mock.calls).toEqual([[{ after: undefined }], [{ after: 'a' }]]);
  });

  test('reaps only on the elected replica, then again every hour', async () => {
    jest.useFakeTimers();
    const leader = jest.mocked(isLeader);
    leader.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const reapPRAutomations = jest.fn().mockResolvedValue({ scanned: 0, removed: 0 });

    startPRAutomationReaper({ reapPRAutomations });
    await jest.advanceTimersByTimeAsync(0);
    expect(reapPRAutomations).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(60 * 60_000);
    expect(leader).toHaveBeenCalledTimes(2);
    expect(reapPRAutomations).toHaveBeenCalledTimes(1);
  });
});
