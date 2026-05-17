const { processJob } = require('../jobProcessor');
const { getScheduledTask, updateScheduledTask, saveConvo } = require('~/models');
const AgentController = require('~/server/controllers/agents/request');

jest.mock('~/models', () => ({
  getScheduledTask: jest.fn(),
  updateScheduledTask: jest.fn(),
  saveConvo: jest.fn(),
}));

jest.mock('~/server/controllers/agents/request', () => jest.fn());
jest.mock('~/server/services/Endpoints/agents', () => ({
  initializeClient: jest.fn(),
}));
jest.mock('~/server/services/Endpoints/agents/title', () => jest.fn());
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('jobProcessor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not process if task is not found', async () => {
    getScheduledTask.mockResolvedValue(null);

    await processJob({ data: { taskId: '123' } });

    expect(getScheduledTask).toHaveBeenCalledWith('123');
    expect(AgentController).not.toHaveBeenCalled();
  });

  it('should not process if task is not active', async () => {
    getScheduledTask.mockResolvedValue({ status: 'paused' });

    await processJob({ data: { taskId: '123' } });

    expect(getScheduledTask).toHaveBeenCalledWith('123');
    expect(AgentController).not.toHaveBeenCalled();
  });

  it('executes AgentController, tags the conversation, and updates lastRunAt', async () => {
    const mockTask = {
      _id: '123',
      userId: 'user1',
      targetType: 'agent',
      targetId: 'agent1',
      status: 'active',
      payload: {
        text: 'hello world',
        ephemeralAgent: {
          web_search: true,
          mcp: ['server1'],
        },
      },
    };

    getScheduledTask.mockResolvedValue(mockTask);
    updateScheduledTask.mockResolvedValue(true);
    saveConvo.mockResolvedValue(true);

    let capturedReq;
    AgentController.mockImplementation(async (req) => {
      capturedReq = {
        userId: req.user.id,
        text: req.body.text,
        conversationId: req.body.conversationId,
        agent_id: req.body.agent_id,
        ephemeralAgent: req.body.ephemeralAgent,
        scheduledTaskMeta: req.scheduledTaskMeta,
      };
      req.body.conversationId = 'convo-new-id';
    });

    await processJob({ data: { taskId: '123' } });

    expect(getScheduledTask).toHaveBeenCalledWith('123');
    expect(AgentController).toHaveBeenCalled();

    expect(capturedReq.userId).toBe('user1');
    expect(capturedReq.text).toBe('hello world');
    expect(capturedReq.conversationId).toBe('new');
    expect(capturedReq.agent_id).toBe('agent1');
    expect(capturedReq.ephemeralAgent).toEqual({
      web_search: true,
      mcp: ['server1'],
    });
    expect(capturedReq.scheduledTaskMeta).toEqual({ taskId: '123', isScheduled: true });

    expect(saveConvo).toHaveBeenCalledWith(
      { userId: 'user1' },
      { conversationId: 'convo-new-id', isScheduled: true, taskId: '123' },
      expect.objectContaining({ noUpsert: true }),
    );
    expect(updateScheduledTask).toHaveBeenCalledWith(
      '123',
      expect.objectContaining({ lastRunAt: expect.any(Date) }),
      'user1',
    );
  });

  it('does not tag conversation when run is temporary', async () => {
    getScheduledTask.mockResolvedValue({
      _id: '123',
      userId: 'user1',
      targetType: 'agent',
      targetId: 'agent1',
      status: 'active',
      payload: { text: 'hello', isTemporary: true },
    });
    updateScheduledTask.mockResolvedValue(true);

    AgentController.mockImplementation(async (req) => {
      req.body.conversationId = 'convo-temp';
    });

    await processJob({ data: { taskId: '123' } });

    expect(saveConvo).not.toHaveBeenCalled();
  });

  it('should throw error if AgentController fails', async () => {
    const mockTask = {
      _id: '123',
      userId: 'user1',
      status: 'active',
      payload: {},
    };

    getScheduledTask.mockResolvedValue(mockTask);
    
    AgentController.mockRejectedValue(new Error('Agent error'));

    await expect(processJob({ data: { taskId: '123' } })).rejects.toThrow('Agent error');
    
    expect(updateScheduledTask).not.toHaveBeenCalled();
  });
});
