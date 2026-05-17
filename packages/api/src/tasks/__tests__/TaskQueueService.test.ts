type AnyFn = (...args: unknown[]) => unknown;

interface BullMqMocks {
  mockAdd: jest.Mock<Promise<void>, [string, unknown, unknown]>;
  mockUpsertJobScheduler: jest.Mock<Promise<void>, [string, unknown, unknown]>;
  mockRemoveJobScheduler: jest.Mock<Promise<boolean>, [string]>;
  mockGetJob: jest.Mock<Promise<{ remove: AnyFn } | null>, [string]>;
  mockJobRemove: jest.Mock<Promise<void>, []>;
}

jest.mock('bullmq', () => {
  const mockAdd = jest.fn();
  const mockUpsertJobScheduler = jest.fn();
  const mockRemoveJobScheduler = jest.fn().mockResolvedValue(true);
  const mockJobRemove = jest.fn();
  const mockGetJob = jest.fn().mockResolvedValue(null);

  return {
    Queue: jest.fn().mockImplementation(() => ({
      add: mockAdd,
      upsertJobScheduler: mockUpsertJobScheduler,
      removeJobScheduler: mockRemoveJobScheduler,
      getJob: mockGetJob,
    })),
    Worker: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
    })),
    __mocks: {
      mockAdd,
      mockUpsertJobScheduler,
      mockRemoveJobScheduler,
      mockGetJob,
      mockJobRemove,
    },
  };
});

jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('ioredis', () => {
  const Mock = jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    quit: jest.fn().mockResolvedValue(undefined),
  }));
  return { __esModule: true, default: Mock };
});

jest.mock('../../cache/cacheConfig', () => ({
  cacheConfig: {
    USE_REDIS: true,
    REDIS_URI: 'redis://127.0.0.1:6379',
    REDIS_KEY_PREFIX: '',
  },
}));

import { TaskQueueService } from '../TaskQueueService';
import bullmq from 'bullmq';

const {
  mockAdd,
  mockUpsertJobScheduler,
  mockRemoveJobScheduler,
  mockGetJob,
  mockJobRemove,
} = (bullmq as unknown as { __mocks: BullMqMocks }).__mocks;

describe('TaskQueueService', () => {
  let service: TaskQueueService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRemoveJobScheduler.mockResolvedValue(true);
    mockGetJob.mockResolvedValue(null);
    service = new TaskQueueService();
    service.setJobProcessor(async () => {});
  });

  describe('addOrUpdateTask', () => {
    it('upserts a cron scheduler keyed by the task id', async () => {
      await service.addOrUpdateTask({
        _id: '123',
        status: 'active',
        triggerType: 'cron',
        expression: '0 * * * *',
      });

      expect(mockRemoveJobScheduler).toHaveBeenCalledWith('123');
      expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
        '123',
        { pattern: '0 * * * *' },
        { name: 'scheduled-tasks', data: { taskId: '123' } },
      );
    });

    it('upserts an interval scheduler with the parsed every value', async () => {
      await service.addOrUpdateTask({
        _id: '123',
        status: 'active',
        triggerType: 'interval',
        expression: '60000',
      });

      expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
        '123',
        { every: 60000 },
        { name: 'scheduled-tasks', data: { taskId: '123' } },
      );
    });

    it('skips queuing for paused tasks but still clears any prior schedule', async () => {
      await service.addOrUpdateTask({
        _id: '123',
        status: 'paused',
        triggerType: 'cron',
        expression: '0 * * * *',
      });

      expect(mockRemoveJobScheduler).toHaveBeenCalledWith('123');
      expect(mockUpsertJobScheduler).not.toHaveBeenCalled();
    });

    it('throws on an invalid interval expression', async () => {
      await expect(
        service.addOrUpdateTask({
          _id: '123',
          status: 'active',
          triggerType: 'interval',
          expression: 'not-a-number',
        }),
      ).rejects.toThrow(/Invalid interval expression/);
    });

    it('passes timezone through for cron triggers', async () => {
      await service.addOrUpdateTask({
        _id: '123',
        status: 'active',
        triggerType: 'cron',
        expression: '0 9 * * *',
        timezone: 'America/New_York',
      });

      expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
        '123',
        { pattern: '0 9 * * *', tz: 'America/New_York' },
        { name: 'scheduled-tasks', data: { taskId: '123' } },
      );
    });

    it('rejects an invalid IANA timezone', async () => {
      await expect(
        service.addOrUpdateTask({
          _id: '123',
          status: 'active',
          triggerType: 'cron',
          expression: '0 9 * * *',
          timezone: 'Not/A_Zone',
        }),
      ).rejects.toThrow(/Invalid IANA timezone/);
    });

    it('enqueues a one-off delayed job for date triggers and interprets the expression in the task timezone', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-30T12:00:00Z'));

      await service.addOrUpdateTask({
        _id: '123',
        status: 'active',
        triggerType: 'date',
        expression: '2026-07-15T09:00:00',
        timezone: 'America/New_York',
      });

      const expectedTargetMs = Date.UTC(2026, 6, 15, 13, 0, 0);
      const expectedDelay = expectedTargetMs - new Date('2026-06-30T12:00:00Z').getTime();
      expect(mockAdd).toHaveBeenCalledWith(
        'scheduled-tasks',
        { taskId: '123' },
        { jobId: '123', delay: expectedDelay },
      );
      expect(mockUpsertJobScheduler).not.toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  describe('removeTask', () => {
    it('removes the scheduler and any pending one-off job for the given id', async () => {
      mockGetJob.mockResolvedValue({ remove: mockJobRemove });

      await service.removeTask('123');

      expect(mockRemoveJobScheduler).toHaveBeenCalledWith('123');
      expect(mockGetJob).toHaveBeenCalledWith('123');
      expect(mockJobRemove).toHaveBeenCalled();
    });

    it('is idempotent when nothing matches the id', async () => {
      mockGetJob.mockResolvedValue(null);

      await expect(service.removeTask('does-not-exist')).resolves.toBeUndefined();
      expect(mockRemoveJobScheduler).toHaveBeenCalledWith('does-not-exist');
    });
  });
});
