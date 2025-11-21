const { duplicateAgent } = require('../v1');
const { getAgent, createAgent } = require('~/models/Agent');
const { getActions } = require('~/models/Action');
const { nanoid } = require('nanoid');

jest.mock('~/models/Agent');
jest.mock('~/models/Action');
jest.mock('nanoid');

describe('duplicateAgent', () => {
  let req, res;

  beforeEach(() => {
    req = {
      params: { id: 'agent_123' },
      user: { id: 'user_456' },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    jest.clearAllMocks();
  });

  it('should duplicate an agent successfully', async () => {
    const mockAgent = {
      id: 'agent_123',
      name: 'Test Agent',
      description: 'Test Description',
      instructions: 'Test Instructions',
      provider: 'openai',
      model: 'gpt-4',
      tools: ['file_search'],
      actions: [],
      author: 'user_789',
      versions: [{ name: 'Test Agent', version: 1 }],
      __v: 0,
    };

    const mockNewAgent = {
      id: 'agent_new_123',
      name: 'Test Agent (1/2/23, 12:34)',
      description: 'Test Description',
      instructions: 'Test Instructions',
      provider: 'openai',
      model: 'gpt-4',
      tools: ['file_search'],
      actions: [],
      author: 'user_456',
      versions: [
        {
          name: 'Test Agent (1/2/23, 12:34)',
          description: 'Test Description',
          instructions: 'Test Instructions',
          provider: 'openai',
          model: 'gpt-4',
          tools: ['file_search'],
          actions: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    };

    getAgent.mockResolvedValue(mockAgent);
    getActions.mockResolvedValue([]);
    nanoid.mockReturnValue('new_123');
    createAgent.mockResolvedValue(mockNewAgent);

    await duplicateAgent(req, res);

    expect(getAgent).toHaveBeenCalledWith({ id: 'agent_123' });
    expect(getActions).toHaveBeenCalledWith({ agent_id: 'agent_123' }, true);
    expect(createAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'agent_new_123',
        author: 'user_456',
        name: expect.stringContaining('Test Agent ('),
        description: 'Test Description',
        instructions: 'Test Instructions',
        provider: 'openai',
        model: 'gpt-4',
        tools: ['file_search'],
        actions: [],
      }),
    );

    expect(createAgent).toHaveBeenCalledWith(
      expect.not.objectContaining({
        versions: expect.anything(),
        __v: expect.anything(),
      }),
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      agent: mockNewAgent,
      actions: [],
    });
  });

  it('should ensure duplicated agent has clean versions array without nested fields', async () => {
    const mockAgent = {
      id: 'agent_123',
      name: 'Test Agent',
      description: 'Test Description',
      versions: [
        {
          name: 'Test Agent',
          versions: [{ name: 'Nested' }],
          __v: 1,
        },
      ],
      __v: 2,
    };

    const mockNewAgent = {
      id: 'agent_new_123',
      name: 'Test Agent (1/2/23, 12:34)',
      description: 'Test Description',
      versions: [
        {
          name: 'Test Agent (1/2/23, 12:34)',
          description: 'Test Description',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    };

    getAgent.mockResolvedValue(mockAgent);
    getActions.mockResolvedValue([]);
    nanoid.mockReturnValue('new_123');
    createAgent.mockResolvedValue(mockNewAgent);

    await duplicateAgent(req, res);

    expect(mockNewAgent.versions).toHaveLength(1);

    const firstVersion = mockNewAgent.versions[0];
    expect(firstVersion).not.toHaveProperty('versions');
    expect(firstVersion).not.toHaveProperty('__v');

    expect(mockNewAgent).not.toHaveProperty('__v');

    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('should return 404 if agent not found', async () => {
    getAgent.mockResolvedValue(null);

    await duplicateAgent(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Agent not found',
      status: 'error',
    });
  });

  it('should convert `tool_resources.ocr` to `tool_resources.context`', async () => {
    const mockAgent = {
      id: 'agent_123',
      name: 'Test Agent',
      tool_resources: {
        ocr: { enabled: true, config: 'test' },
        other: { should: 'not be copied' },
      },
    };

    getAgent.mockResolvedValue(mockAgent);
    getActions.mockResolvedValue([]);
    nanoid.mockReturnValue('new_123');
    createAgent.mockResolvedValue({ id: 'agent_new_123' });

    await duplicateAgent(req, res);

    expect(createAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        tool_resources: {
          context: { enabled: true, config: 'test' },
        },
      }),
    );
  });

  it('should handle errors gracefully', async () => {
    getAgent.mockRejectedValue(new Error('Database error'));

    await duplicateAgent(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Database error' });
  });
});
