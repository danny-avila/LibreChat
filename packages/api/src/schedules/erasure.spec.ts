import type { IScheduleRun, ScheduleMethods } from '@librechat/data-schemas';
import type { JobState } from './types';
import { startScheduleErasureSweep } from './erasure';

const oldRun = (overrides: Partial<IScheduleRun> = {}): IScheduleRun =>
  ({
    scheduleId: 'schedule-1',
    user: 'user-1',
    scheduledFor: new Date('2026-08-17T12:00:00.000Z'),
    firedAt: new Date(Date.now() - 31 * 60_000),
    conversationId: 'conversation-1',
    status: 'started',
    ...overrides,
  }) as unknown as IScheduleRun;

async function sweepOnce(options: {
  canInferOwnerDeathFromMissingJob: boolean;
  job?: JobState | null;
}) {
  const methods = {
    getDeletingSchedules: jest.fn(async () => [{ id: 'schedule-1' }]),
    getActiveRunsForSchedule: jest.fn(async () => [oldRun()]),
    recordRunOutcome: jest.fn(async () => undefined),
    eraseScheduleIfDrained: jest.fn(async () => false),
    markEraseAttempted: jest.fn(async () => undefined),
  };
  const sweep = startScheduleErasureSweep({
    methods: methods as unknown as ScheduleMethods,
    getJobStatus: jest.fn(async () => options.job ?? null),
    canInferOwnerDeathFromMissingJob: options.canInferOwnerDeathFromMissingJob,
  });
  await jest.advanceTimersByTimeAsync(5 * 60_000);
  sweep.stop();
  return methods;
}

describe('schedule erasure fallback owner-death evidence', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('does not settle a peer-owned run from process-local job absence', async () => {
    const methods = await sweepOnce({ canInferOwnerDeathFromMissingJob: false });

    expect(methods.recordRunOutcome).not.toHaveBeenCalled();
    expect(methods.eraseScheduleIfDrained).toHaveBeenCalledWith('schedule-1');
  });

  it('retains owner-death recovery when job absence is deployment-authoritative', async () => {
    const methods = await sweepOnce({ canInferOwnerDeathFromMissingJob: true });

    expect(methods.recordRunOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleId: 'schedule-1',
        status: 'interrupted',
        error: 'Schedule deleted',
      }),
    );
  });

  it('still trusts an identity-matched terminal job in an unsafe topology', async () => {
    const methods = await sweepOnce({
      canInferOwnerDeathFromMissingJob: false,
      job: {
        status: 'complete',
        scheduleId: 'schedule-1',
        scheduledFor: '2026-08-17T12:00:00.000Z',
      },
    });

    expect(methods.recordRunOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ scheduleId: 'schedule-1', status: 'success' }),
    );
  });
});
