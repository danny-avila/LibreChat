const mockTaskStore = {
  configureTaskControlTransport: jest.fn().mockResolvedValue(undefined),
  configureActivityStream: jest.fn(),
  prepareActivityForShutdown: jest.fn(),
  destroyTaskControlTransport: jest.fn().mockResolvedValue(undefined),
  destroyActivityStream: jest.fn(),
};

jest.mock('@librechat/api', () => ({
  cacheConfig: { USE_REDIS: true, REDIS_KEY_PREFIX: 'test:' },
  ioredisClient: { duplicate: jest.fn() },
  isEnabled: jest.fn(() => false),
  registerShutdownTask: jest.fn(),
  duplicateIoRedisClient: jest.fn(),
  createSubagentThreadTaskStore: jest.fn(() => mockTaskStore),
  createSubagentCompletionWakeupHandler: jest.fn(),
  RedisSubagentTaskControlTransport: jest.fn(),
  RedisEventTransport: jest.fn(),
  SubagentActivityStream: jest.fn(),
}));

jest.mock('~/models', () => ({
  acquireSubagentThreadLease: jest.fn(),
  claimSubagentTaskResult: jest.fn(),
  releaseSubagentTaskResultClaim: jest.fn(),
  countActiveSubagentThreadLeases: jest.fn(),
  deleteConvos: jest.fn(),
  deleteMessages: jest.fn(),
  getConvo: jest.fn(),
  getMessages: jest.fn(),
  listActiveSubagentThreadLeases: jest.fn(),
  releaseSubagentThreadLease: jest.fn(),
  reserveSubagentThread: jest.fn(),
  renewSubagentThreadLease: jest.fn(),
  saveConvo: jest.fn(),
  saveMessage: jest.fn(),
  isSubagentOwnerAdmissible: jest.fn(),
  fenceSubagentAdmission: jest.fn(),
  renewSubagentAdmission: jest.fn(),
  releaseSubagentAdmission: jest.fn(),
}));

jest.mock('../../Agents/triggers', () => ({
  enqueueAgentTrigger: jest.fn(),
}));

const { ioredisClient, registerShutdownTask, duplicateIoRedisClient } = require('@librechat/api');
const { configureSubagentTaskRouting } = require('./subagentThreadStore');
const activityPrepareRegistration = registerShutdownTask.mock.calls.find(
  ([name]) => name === 'subagent activity streams prepare',
);

describe('subagent thread Redis lifecycle', () => {
  it('closes activity SSE before drain and disconnects its subscriber after drain', async () => {
    const taskSubscriber = { disconnect: jest.fn() };
    const activitySubscriber = { disconnect: jest.fn() };
    const taskPublisher = { disconnect: jest.fn() };
    const activityPublisher = { disconnect: jest.fn() };
    ioredisClient.duplicate
      .mockReturnValueOnce(taskSubscriber)
      .mockReturnValueOnce(activitySubscriber);
    duplicateIoRedisClient
      .mockReturnValueOnce(taskPublisher)
      .mockReturnValueOnce(activityPublisher);

    await configureSubagentTaskRouting();

    expect(activityPrepareRegistration).toEqual([
      'subagent activity streams prepare',
      expect.any(Function),
      { phase: 'pre-drain', priority: 100 },
    ]);
    expect(registerShutdownTask).toHaveBeenCalledWith(
      'subagent task control transport',
      expect.any(Function),
      { priority: 90 },
    );
    const prepare = activityPrepareRegistration[1];
    prepare();
    expect(mockTaskStore.prepareActivityForShutdown).toHaveBeenCalledTimes(1);

    const shutdown = registerShutdownTask.mock.calls.find(
      ([name]) => name === 'subagent task control transport',
    )[1];
    await shutdown();

    expect(mockTaskStore.destroyTaskControlTransport).toHaveBeenCalledTimes(1);
    expect(mockTaskStore.destroyActivityStream).toHaveBeenCalledTimes(1);
    expect(taskPublisher.disconnect).toHaveBeenCalledTimes(1);
    expect(activitySubscriber.disconnect).toHaveBeenCalledTimes(1);
    expect(activityPublisher.disconnect).toHaveBeenCalledTimes(1);
  });
});
