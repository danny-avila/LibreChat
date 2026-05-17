const { processJob } = require('../jobProcessor');
const { getScheduledTask, updateScheduledTask } = require('~/models');
const AgentController = require('~/server/controllers/agents/request');

jest.mock('~/models', () => ({
  getScheduledTask: jest.fn(),
  updateScheduledTask: jest.fn(),
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

  it('should execute the AgentController and update the task on success', async () => {
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
      save: jest.fn().mockResolvedValue(true),
    };

    getScheduledTask.mockResolvedValue(mockTask);
    updateScheduledTask.mockResolvedValue(true);

    AgentController.mockImplementation(async (req, res, next) => {
      // Simulate successful run
      res.json({ status: 'success' });
      res.end();
    });

    await processJob({ data: { taskId: '123' } });

    expect(getScheduledTask).toHaveBeenCalledWith('123');
    
    expect(AgentController).toHaveBeenCalled();
    const reqArg = AgentController.mock.calls[0][0];
    
    expect(reqArg.user.id).toBe('user1');
    expect(reqArg.body.text).toBe('hello world');
    expect(reqArg.body.conversationId).toBe('new');
    expect(reqArg.body.agent_id).toBe('agent1');
    expect(reqArg.body.ephemeralAgent).toEqual({
      web_search: true,
      mcp: ['server1'],
    });

    expect(updateScheduledTask).toHaveBeenCalledWith('123', expect.objectContaining({
      lastRunAt: expect.any(Date),
    }));
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
