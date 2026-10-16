import { AppService } from '@librechat/data-schemas';
import {
  startPRAutomationReaper,
  reapOrphanedPRAutomations,
  createClusteredPRAutomationReaper,
} from './automation';
import { isLeader } from '~/cluster';

jest.mock('~/cluster', () => ({ isLeader: jest.fn() }));

const emptyPage = () => jest.fn().mockResolvedValue({ scanned: 0, removed: 0 });

describe('PR automation reaper', () => {
  let stop: (() => void) | undefined;

  afterEach(() => {
    stop?.();
    stop = undefined;
    jest.mocked(isLeader).mockReset();
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
    const reapPRAutomations = emptyPage();

    stop = startPRAutomationReaper({ reapPRAutomations });
    await jest.advanceTimersByTimeAsync(0);
    expect(reapPRAutomations).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(60 * 60_000);
    expect(leader).toHaveBeenCalledTimes(2);
    expect(reapPRAutomations).toHaveBeenCalledTimes(1);
  });

  test('runs at the interval the yaml sets', async () => {
    jest.useFakeTimers();
    jest.mocked(isLeader).mockResolvedValue(true);
    const reapPRAutomations = emptyPage();
    const appConfig = await AppService({
      config: { endpoints: { agents: { prAutomation: { reaperIntervalMinutes: 15 } } } },
    });

    stop = startPRAutomationReaper({ reapPRAutomations }, appConfig);
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(15 * 60_000);
    expect(reapPRAutomations).toHaveBeenCalledTimes(2);
  });

  test('without Redis, waits in a worker until the primary assigns it', async () => {
    jest.useFakeTimers();
    jest.mocked(isLeader).mockResolvedValue(true);
    const reapPRAutomations = emptyPage();
    const reaper = createClusteredPRAutomationReaper(false, { reapPRAutomations });

    stop = reaper.stop;
    reaper.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(reapPRAutomations).not.toHaveBeenCalled();

    reaper.assign();
    stop = reaper.stop;
    await jest.advanceTimersByTimeAsync(0);
    expect(reapPRAutomations).toHaveBeenCalledTimes(1);
  });

  test('with Redis, every worker starts and leader election picks one', async () => {
    jest.useFakeTimers();
    jest.mocked(isLeader).mockResolvedValue(true);
    const reapPRAutomations = emptyPage();
    const reaper = createClusteredPRAutomationReaper(true, { reapPRAutomations });

    reaper.start();
    stop = reaper.stop;
    await jest.advanceTimersByTimeAsync(0);
    expect(reapPRAutomations).toHaveBeenCalledTimes(1);
  });
});
