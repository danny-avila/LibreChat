const validateConvoAccess = require('../validate/convoAccess');
const { ViolationTypes } = require('librechat-data-provider');

jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn().mockReturnValue(false),
}));

jest.mock('~/server/middleware/denyRequest', () => jest.fn());

jest.mock('~/cache', () => ({
  logViolation: jest.fn(),
  getLogStores: jest.fn().mockReturnValue({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(true),
  }),
}));

jest.mock('~/models', () => ({
  searchConversation: jest.fn(),
}));

const { searchConversation } = require('~/models');
const denyRequest = require('~/server/middleware/denyRequest');

describe('validateConvoAccess', () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      user: { id: 'user_123' },
      body: { conversationId: 'convo_123' },
      config: {
        interfaceConfig: {
          agents: {
            preventSwitching: false,
          },
        },
      },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
  });

  it('allows access for new conversations immediately', async () => {
    req.body.conversationId = 'new';
    await validateConvoAccess(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(searchConversation).not.toHaveBeenCalled();
  });

  it('allows access if user owns the conversation', async () => {
    searchConversation.mockResolvedValue({
      conversationId: 'convo_123',
      user: 'user_123',
      agent_id: 'agent_abc',
    });

    await validateConvoAccess(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(denyRequest).not.toHaveBeenCalled();
  });

  it('denies access if user does not own the conversation', async () => {
    searchConversation.mockResolvedValue({
      conversationId: 'convo_123',
      user: 'user_456',
      agent_id: 'agent_abc',
    });

    await validateConvoAccess(req, res, next);

    expect(denyRequest).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  describe('preventSwitching setting tests', () => {
    beforeEach(() => {
      req.config.interfaceConfig.agents.preventSwitching = true;
    });

    it('blocks switching from custom Agent A to custom Agent B', async () => {
      searchConversation.mockResolvedValue({
        conversationId: 'convo_123',
        user: 'user_123',
        agent_id: 'agent_abc',
      });
      req.body.agent_id = 'agent_xyz';
      req.body.endpoint = 'agents';

      await validateConvoAccess(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Agent Switching Prohibited',
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('blocks switching from custom Agent A to no agent (ephemeral/standard)', async () => {
      searchConversation.mockResolvedValue({
        conversationId: 'convo_123',
        user: 'user_123',
        agent_id: 'agent_abc',
      });
      req.body.agent_id = 'ephemeral';
      req.body.endpoint = 'openAI';

      await validateConvoAccess(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('blocks switching from no agent (ephemeral/standard) to custom Agent A', async () => {
      searchConversation.mockResolvedValue({
        conversationId: 'convo_123',
        user: 'user_123',
        agent_id: 'ephemeral',
      });
      req.body.agent_id = 'agent_abc';
      req.body.endpoint = 'agents';

      await validateConvoAccess(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('allows changing models within non-agent endpoints (ephemeral to ephemeral)', async () => {
      searchConversation.mockResolvedValue({
        conversationId: 'convo_123',
        user: 'user_123',
        agent_id: 'ephemeral',
        endpoint: 'openAI',
      });
      req.body.agent_id = undefined;
      req.body.endpoint = 'openAI';

      await validateConvoAccess(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('allows accessing same agent when preventSwitching is true', async () => {
      searchConversation.mockResolvedValue({
        conversationId: 'convo_123',
        user: 'user_123',
        agent_id: 'agent_abc',
      });
      req.body.agent_id = 'agent_abc';
      req.body.endpoint = 'agents';

      await validateConvoAccess(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('does not block archive/pin/update requests (where agent_id & endpoint are undefined)', async () => {
      searchConversation.mockResolvedValue({
        conversationId: 'convo_123',
        user: 'user_123',
        agent_id: 'agent_abc',
      });
      // No agent_id or endpoint in body (typical of title updates, archiving, pinning)
      req.body = { conversationId: 'convo_123' };

      await validateConvoAccess(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
