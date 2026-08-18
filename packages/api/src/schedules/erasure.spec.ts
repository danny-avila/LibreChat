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
    getRunsForReconciliation: jest.fn(async () => []),
  };
  const sweep = startScheduleErasureSweep({
    methods: methods as unknown as ScheduleMethods,
    getJobStatus: jest.fn(async () => options.job ?? null),
    getTriggerDelivery: jest.fn(async () => null),
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

describe('topology-safe dead-delivery convergence', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  async function convergeOnce(options: {
    run?: Partial<IScheduleRun>;
    delivery?: { status: string; lastError?: string } | null;
    job?: JobState | null;
    canInferOwnerDeathFromMissingJob?: boolean;
  }) {
    const methods = {
      getDeletingSchedules: jest.fn(async () => []),
      getActiveRunsForSchedule: jest.fn(async () => []),
      recordRunOutcome: jest.fn(async () => undefined),
      eraseScheduleIfDrained: jest.fn(async () => false),
      markEraseAttempted: jest.fn(async () => undefined),
      getRunsForReconciliation: jest.fn(async () => [
        oldRun({ deliveryKey: 'dk-1', ...options.run } as Partial<IScheduleRun>),
      ]),
    };
    const getTriggerDelivery = jest.fn(async () => options.delivery ?? null);
    const sweep = startScheduleErasureSweep({
      methods: methods as unknown as ScheduleMethods,
      getJobStatus: jest.fn(async () => options.job ?? null),
      getTriggerDelivery: getTriggerDelivery as never,
      // Defaults to the UNSAFE topology to prove this path never depends on it.
      canInferOwnerDeathFromMissingJob: options.canInferOwnerDeathFromMissingJob ?? false,
    });
    await jest.advanceTimersByTimeAsync(5 * 60_000);
    sweep.stop();
    return { methods, getTriggerDelivery };
  }

  it('settles a dead delivery as error even in an unsafe topology (positive evidence)', async () => {
    const { methods } = await convergeOnce({
      delivery: { status: 'dead', lastError: 'blocked by moderation' },
    });
    expect(methods.recordRunOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleId: 'schedule-1',
        status: 'error',
        error: 'blocked by moderation',
      }),
    );
  });

  it('leaves a live delivery alone', async () => {
    const { methods } = await convergeOnce({ delivery: { status: 'pending' } });
    expect(methods.recordRunOutcome).not.toHaveBeenCalled();
  });

  it('never settles while an identity-matched generation still owns the reservation', async () => {
    const { methods, getTriggerDelivery } = await convergeOnce({
      delivery: { status: 'dead' },
      job: {
        status: 'running',
        scheduleId: 'schedule-1',
        scheduledFor: '2026-08-17T12:00:00.000Z',
      } as unknown as JobState,
    });
    expect(getTriggerDelivery).not.toHaveBeenCalled();
    expect(methods.recordRunOutcome).not.toHaveBeenCalled();
  });

  it('defers a run whose abort is still in flight', async () => {
    const { methods } = await convergeOnce({
      run: { abortRequestedAt: new Date() } as Partial<IScheduleRun>,
      delivery: { status: 'dead' },
    });
    expect(methods.recordRunOutcome).not.toHaveBeenCalled();
  });

  it('ignores a legacy reservation carrying no deliveryKey', async () => {
    const { methods, getTriggerDelivery } = await convergeOnce({
      run: { deliveryKey: undefined } as Partial<IScheduleRun>,
      delivery: { status: 'dead' },
    });
    expect(getTriggerDelivery).not.toHaveBeenCalled();
    expect(methods.recordRunOutcome).not.toHaveBeenCalled();
  });
});
