type AnyFn = (...args: unknown[]) => unknown;

interface BullMqMocks {
  mockAdd: jest.Mock<Promise<void>, [string, unknown, unknown]>;
  mockGetRepeatableJobs: jest.Mock<Promise<Array<{ id: string; key: string }>>, []>;
  mockRemoveRepeatableByKey: jest.Mock<Promise<void>, [string]>;
  mockGetJob: jest.Mock<Promise<{ remove: AnyFn } | null>, [string]>;
  mockJobRemove: jest.Mock<Promise<void>, []>;
}

jest.mock('bullmq', () => {
  const mockAdd = jest.fn();
  const mockGetRepeatableJobs = jest.fn().mockResolvedValue([]);
  const mockRemoveRepeatableByKey = jest.fn();
  const mockJobRemove = jest.fn();
  const mockGetJob = jest.fn().mockResolvedValue({ remove: mockJobRemove });

  return {
    Queue: jest.fn().mockImplementation(() => ({
      add: mockAdd,
      getRepeatableJobs: mockGetRepeatableJobs,
      removeRepeatableByKey: mockRemoveRepeatableByKey,
      getJob: mockGetJob,
    })),
    Worker: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
    })),
    __mocks: { mockAdd, mockGetRepeatableJobs, mockRemoveRepeatableByKey, mockGetJob, mockJobRemove },
  };
});

jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../cache/redisClients', () => ({
  ioredisClient: {},
}));

import { TaskQueueService } from '../TaskQueueService';
import bullmq from 'bullmq';

const { mockAdd, mockGetRepeatableJobs, mockRemoveRepeatableByKey, mockGetJob, mockJobRemove } = (
  bullmq as unknown as { __mocks: BullMqMocks }
).__mocks;

describe('TaskQueueService', () => {
  let service: TaskQueueService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TaskQueueService();
    service.setJobProcessor(async () => {});
  });

  describe('addOrUpdateTask', () => {
    it('adds a cron task as a repeatable BullMQ job', async () => {
      mockGetRepeatableJobs.mockResolvedValue([]);

      await service.addOrUpdateTask({
        _id: '123',
        status: 'active',
        triggerType: 'cron',
        expression: '0 * * * *',
      });

      expect(mockAdd).toHaveBeenCalledWith(
        'scheduled-tasks',
        { taskId: '123' },
        { jobId: '123', repeat: { pattern: '0 * * * *' } },
      );
    });

    it('removes the existing repeatable job before adding an interval task', async () => {
      mockGetRepeatableJobs.mockResolvedValue([
        { id: '123', key: 'repeat:123' },
        { id: '456', key: 'repeat:456' },
      ]);
      mockGetJob.mockResolvedValue(null);

      await service.addOrUpdateTask({
        _id: '123',
        status: 'active',
        triggerType: 'interval',
        expression: '60000',
      });

      expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith('repeat:123');
      expect(mockAdd).toHaveBeenCalledWith(
        'scheduled-tasks',
        { taskId: '123' },
        { jobId: '123', repeat: { every: 60000 } },
      );
    });

    it('skips queuing for paused tasks', async () => {
      mockGetRepeatableJobs.mockResolvedValue([]);

      await service.addOrUpdateTask({
        _id: '123',
        status: 'paused',
        triggerType: 'cron',
        expression: '0 * * * *',
      });

      expect(mockAdd).not.toHaveBeenCalled();
    });

    it('throws on an invalid interval expression', async () => {
      mockGetRepeatableJobs.mockResolvedValue([]);

      await expect(
        service.addOrUpdateTask({
          _id: '123',
          status: 'active',
          triggerType: 'interval',
          expression: 'not-a-number',
        }),
      ).rejects.toThrow(/Invalid interval expression/);
    });

    it('passes timezone through to BullMQ for cron triggers', async () => {
      mockGetRepeatableJobs.mockResolvedValue([]);

      await service.addOrUpdateTask({
        _id: '123',
        status: 'active',
        triggerType: 'cron',
        expression: '0 9 * * *',
        timezone: 'America/New_York',
      });

      expect(mockAdd).toHaveBeenCalledWith(
        'scheduled-tasks',
        { taskId: '123' },
        { jobId: '123', repeat: { pattern: '0 9 * * *', tz: 'America/New_York' } },
      );
    });

    it('rejects an invalid IANA timezone', async () => {
      mockGetRepeatableJobs.mockResolvedValue([]);

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

    it('interprets a naive date expression in the task timezone', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-30T12:00:00Z'));
      mockGetRepeatableJobs.mockResolvedValue([]);

      await service.addOrUpdateTask({
        _id: '123',
        status: 'active',
        triggerType: 'date',
        expression: '2026-07-15T09:00:00',
        timezone: 'America/New_York',
      });

      // 2026-07-15 09:00 NY (EDT, UTC-4) = 2026-07-15 13:00 UTC.
      const expectedTargetMs = Date.UTC(2026, 6, 15, 13, 0, 0);
      const expectedDelay = expectedTargetMs - new Date('2026-06-30T12:00:00Z').getTime();
      expect(mockAdd).toHaveBeenCalledWith(
        'scheduled-tasks',
        { taskId: '123' },
        { jobId: '123', delay: expectedDelay },
      );

      jest.useRealTimers();
    });
  });

  describe('removeTask', () => {
    it('removes both repeatable and direct jobs for the given id', async () => {
      mockGetRepeatableJobs.mockResolvedValue([{ id: '123', key: 'repeat:123' }]);
      mockGetJob.mockResolvedValue({ remove: mockJobRemove });

      await service.removeTask('123');

      expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith('repeat:123');
      expect(mockJobRemove).toHaveBeenCalled();
    });
  });
});
