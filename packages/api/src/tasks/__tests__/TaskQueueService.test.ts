import { TaskQueueService } from '../TaskQueueService';

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
    __mocks: { mockAdd, mockGetRepeatableJobs, mockRemoveRepeatableByKey, mockGetJob, mockJobRemove }
  };
});

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../cache/redisClients', () => ({
  ioredisClient: {}, // Mock redis client
}));

import bullmq from 'bullmq';
const { mockAdd, mockGetRepeatableJobs, mockRemoveRepeatableByKey, mockGetJob, mockJobRemove } = (bullmq as any).__mocks;


describe('TaskQueueService', () => {
  let taskQueueService: TaskQueueService;
  
  beforeEach(() => {
    jest.clearAllMocks();
    taskQueueService = new TaskQueueService();
  });

  describe('addOrUpdateTask', () => {
    it('should add a cron task', async () => {
      const mockTask = {
        _id: { toString: () => '123' },
        status: 'active',
        triggerType: 'cron',
        expression: '0 * * * *',
      } as any;

      mockGetRepeatableJobs.mockResolvedValue([]);

      await taskQueueService.addOrUpdateTask(mockTask);

      expect(mockAdd).toHaveBeenCalledWith(
        'scheduled-tasks',
        { taskId: '123' },
        { jobId: '123', repeat: { pattern: '0 * * * *' } }
      );
    });

    it('should remove existing repeatable job before adding', async () => {
      const mockTask = {
        _id: { toString: () => '123' },
        status: 'active',
        triggerType: 'interval',
        expression: '60000',
      } as any;

      mockGetRepeatableJobs.mockResolvedValue([
        { id: '123', key: 'repeat:123' },
        { id: '456', key: 'repeat:456' }
      ]);
      mockGetJob.mockResolvedValue(null);

      await taskQueueService.addOrUpdateTask(mockTask);

      expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith('repeat:123');
      expect(mockAdd).toHaveBeenCalledWith(
        'scheduled-tasks',
        { taskId: '123' },
        { jobId: '123', repeat: { every: 60000 } }
      );
    });
  });

  describe('removeTask', () => {
    it('should remove task by ID', async () => {
      mockGetRepeatableJobs.mockResolvedValue([{ id: '123', key: 'repeat:123' }]);
      mockGetJob.mockResolvedValue({ remove: mockJobRemove });

      await taskQueueService.removeTask('123');

      expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith('repeat:123');
      expect(mockJobRemove).toHaveBeenCalled();
    });
  });
});
