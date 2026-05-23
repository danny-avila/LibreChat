jest.mock('~/models', () => ({
  getConvo: jest.fn(),
}));

const validateMessageReq = require('../validateMessageReq');
const { getConvo } = require('~/models');

function createResponse() {
  const res = {
    json: jest.fn(),
    send: jest.fn(),
    status: jest.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

describe('validateMessageReq', () => {
  const userId = 'user-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject requests when URL and body conversationId values differ', async () => {
    const req = {
      params: { conversationId: 'convo-owned' },
      body: { conversationId: 'convo-victim' },
      user: { id: userId },
    };
    const res = createResponse();
    const next = jest.fn();

    await validateMessageReq(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Conversation ID mismatch' });
    expect(getConvo).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject requests when URL and nested message conversationId values differ', async () => {
    const req = {
      params: { conversationId: 'convo-owned' },
      body: { message: { conversationId: 'convo-victim' } },
      user: { id: userId },
    };
    const res = createResponse();
    const next = jest.fn();

    await validateMessageReq(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Conversation ID mismatch' });
    expect(getConvo).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('should validate ownership against the URL conversationId when values match', async () => {
    const req = {
      params: { conversationId: 'convo-owned' },
      body: { conversationId: 'convo-owned' },
      user: { id: userId },
    };
    const res = createResponse();
    const next = jest.fn();
    getConvo.mockResolvedValue({ conversationId: 'convo-owned', user: userId });

    await validateMessageReq(req, res, next);

    expect(getConvo).toHaveBeenCalledWith(userId, 'convo-owned');
    expect(next).toHaveBeenCalledTimes(1);
  });
});
