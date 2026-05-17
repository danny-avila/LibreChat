const { processJob } = require('../jobProcessor');
const { getScheduledTask, updateScheduledTask, saveConvo, getUserById } = require('~/models');
const AgentController = require('~/server/controllers/agents/request');
const { buildOptions } = require('~/server/services/Endpoints/agents');
const { getAppConfig } = require('~/server/services/Config');

jest.mock('~/models', () => ({
  getScheduledTask: jest.fn(),
  updateScheduledTask: jest.fn(),
  saveConvo: jest.fn(),
  getUserById: jest.fn(),
}));

jest.mock('~/server/controllers/agents/request', () => jest.fn());
jest.mock('~/server/services/Endpoints/agents', () => ({
  initializeClient: jest.fn(),
  buildOptions: jest.fn(),
}));
jest.mock('~/server/services/Endpoints/agents/title', () => jest.fn());
jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn(),
}));
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
    getUserById.mockResolvedValue({ id: 'user1', role: 'USER' });
    getAppConfig.mockResolvedValue({ interfaceConfig: {} });
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

  it('executes a model task by building an ephemeral endpointOption from payload.endpoint/model', async () => {
    const mockTask = {
      _id: 'task_model',
      userId: 'user1',
      name: 'Morning digest',
      targetType: 'model',
      targetId: 'gpt-4o',
      status: 'active',
      payload: {
        text: 'morning digest',
        endpoint: 'openAI',
        model: 'gpt-4o',
        ephemeralAgent: { web_search: true, mcp: ['memory'] },
      },
    };

    getScheduledTask.mockResolvedValue(mockTask);
    updateScheduledTask.mockResolvedValue(true);
    saveConvo.mockResolvedValue(true);
    buildOptions.mockResolvedValue({ endpoint: 'openAI', model_parameters: { model: 'gpt-4o' } });

    let capturedReq;
    AgentController.mockImplementation(async (req) => {
      capturedReq = {
        agent_id: req.body.agent_id,
        endpoint: req.body.endpoint,
        model: req.body.model,
        endpointOption: req.body.endpointOption,
        scheduledTaskMeta: req.scheduledTaskMeta,
      };
      req.body.conversationId = 'convo-model';
    });

    await processJob({ data: { taskId: 'task_model' } });

    expect(buildOptions).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ id: 'user1' }) }),
      'openAI',
      { endpoint: 'openAI', model: 'gpt-4o', agent_id: 'ephemeral' },
    );
    expect(capturedReq.agent_id).toBe('ephemeral');
    expect(capturedReq.endpoint).toBe('openAI');
    expect(capturedReq.model).toBe('gpt-4o');
    expect(capturedReq.endpointOption).toEqual({
      endpoint: 'openAI',
      model_parameters: { model: 'gpt-4o' },
    });
    expect(capturedReq.scheduledTaskMeta).toEqual({ taskId: 'task_model', isScheduled: true });

    expect(saveConvo).toHaveBeenCalledWith(
      { userId: 'user1' },
      { conversationId: 'convo-model', isScheduled: true, taskId: 'task_model' },
      expect.objectContaining({ noUpsert: true }),
    );
  });

  it('does not tag conversation when run is temporary', async () => {
    getScheduledTask.mockResolvedValue({
      _id: '123',
      userId: 'user1',
      name: 'Temp task',
      targetType: 'model',
      targetId: 'gpt-4o',
      status: 'active',
      payload: {
        text: 'hello',
        endpoint: 'openAI',
        model: 'gpt-4o',
        isTemporary: true,
      },
    });
    updateScheduledTask.mockResolvedValue(true);
    buildOptions.mockResolvedValue({ endpoint: 'openAI', model_parameters: { model: 'gpt-4o' } });

    AgentController.mockImplementation(async (req) => {
      req.body.conversationId = 'convo-temp';
    });

    await processJob({ data: { taskId: '123' } });

    expect(saveConvo).not.toHaveBeenCalled();
  });

  it('rejects a task that is missing payload.endpoint', async () => {
    getScheduledTask.mockResolvedValue({
      _id: '123',
      userId: 'user1',
      name: 'Missing endpoint',
      targetType: 'model',
      targetId: 'gpt-4o',
      status: 'active',
      payload: { text: 'hello', model: 'gpt-4o' },
    });

    await expect(processJob({ data: { taskId: '123' } })).rejects.toThrow(
      /missing payload.endpoint/,
    );
    expect(AgentController).not.toHaveBeenCalled();
    expect(updateScheduledTask).not.toHaveBeenCalled();
  });

  it('should throw error if AgentController fails', async () => {
    getScheduledTask.mockResolvedValue({
      _id: '123',
      userId: 'user1',
      name: 'Failing task',
      targetType: 'model',
      targetId: 'gpt-4o',
      status: 'active',
      payload: { text: 'hello', endpoint: 'openAI', model: 'gpt-4o' },
    });
    buildOptions.mockResolvedValue({ endpoint: 'openAI', model_parameters: { model: 'gpt-4o' } });
    AgentController.mockRejectedValue(new Error('Agent error'));

    await expect(processJob({ data: { taskId: '123' } })).rejects.toThrow('Agent error');

    expect(updateScheduledTask).not.toHaveBeenCalled();
  });
});
