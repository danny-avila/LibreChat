/**
 * Tests for sendError's reply stamping.
 *
 * A terminal error is a persisted assistant turn, and on the fallback paths that reach here it
 * is the only one written: without a stamp another device never learns the run ended.
 */

const mockSaveMessage = jest.fn();
const mockStampConvoLastResponse = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  logger: { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

jest.mock('@librechat/api', () => ({
  sendEvent: jest.fn(),
  handleError: jest.fn(),
  sanitizeMessageForTransmit: jest.fn((message) => message),
}));

jest.mock('~/models', () => ({
  saveMessage: (...args) => mockSaveMessage(...args),
  getMessages: jest.fn().mockResolvedValue([]),
  getConvo: jest.fn().mockResolvedValue({}),
  stampConvoLastResponse: (...args) => mockStampConvoLastResponse(...args),
}));

const { sendError } = require('./error');

const CONVO_ID = 'convo-errored';

const options = {
  user: 'user-123',
  sender: 'AI',
  conversationId: CONVO_ID,
  messageId: 'error-msg',
  parentMessageId: 'user-msg',
  text: 'Something went wrong',
  shouldSaveMessage: true,
};

const reqWith = (body = {}) => ({ user: { id: 'user-123' }, body, config: {} });

describe('sendError', () => {
  beforeEach(() => {
    mockSaveMessage.mockReset();
    mockSaveMessage.mockImplementation(async (_ctx, message) => message);
    mockStampConvoLastResponse.mockReset();
    mockStampConvoLastResponse.mockResolvedValue(undefined);
  });

  it('stamps the conversation once the error reply is durable', async () => {
    await sendError(reqWith(), {}, options);

    expect(mockStampConvoLastResponse).toHaveBeenCalledWith('user-123', CONVO_ID);
  });

  it('never stamps a temporary conversation', async () => {
    await sendError(reqWith({ isTemporary: true }), {}, options);

    expect(mockStampConvoLastResponse).not.toHaveBeenCalled();
  });

  it('never stamps a reply the message write did not persist', async () => {
    /* Announcing a reply that is absent from message history would show a dot for a message
       nobody can open. */
    mockSaveMessage.mockResolvedValue(null);

    await sendError(reqWith(), {}, options);

    expect(mockStampConvoLastResponse).not.toHaveBeenCalled();
  });

  it('never fails the error response because its indicator stamp failed', async () => {
    mockStampConvoLastResponse.mockRejectedValue(new Error('mongo is down'));

    await expect(sendError(reqWith(), {}, options)).resolves.toBeUndefined();
  });

  it('leaves the stamp alone when the caller does not persist the message', async () => {
    await sendError(reqWith(), {}, { ...options, shouldSaveMessage: false });

    expect(mockSaveMessage).not.toHaveBeenCalled();
    expect(mockStampConvoLastResponse).not.toHaveBeenCalled();
  });
});
