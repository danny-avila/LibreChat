const mockAbortJob = jest.fn();
const mockSaveMessage = jest.fn();
const mockSpendTokens = jest.fn();
const mockGetConvo = jest.fn();
const mockRecordCollectedUsage = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn(() => false),
  sendEvent: jest.fn(),
  countTokens: jest.fn(async () => 7),
  GenerationJobManager: {
    abortJob: (...args) => mockAbortJob(...args),
  },
  recordCollectedUsage: (...args) => mockRecordCollectedUsage(...args),
  sanitizeMessageForTransmit: (message) => message,
  buildAbortedResponseMetadata: jest.fn(() => null),
}));

jest.mock('~/app/clients/prompts', () => ({
  truncateText: (text) => text,
  smartTruncateText: (text) => text,
}));
jest.mock('~/cache/clearPendingReq', () => jest.fn());
jest.mock('~/server/middleware/error', () => ({ sendError: jest.fn() }));
jest.mock('../abortRun', () => ({ abortRun: jest.fn() }));
jest.mock('~/models', () => ({
  saveMessage: (...args) => mockSaveMessage(...args),
  spendTokens: (...args) => mockSpendTokens(...args),
  getConvo: (...args) => mockGetConvo(...args),
}));

const { handleAbort } = require('../abortMiddleware');

function createRes() {
  const res = { headersSent: false };
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}

describe('legacy abortMessage persistence enrollment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetConvo.mockResolvedValue({ title: 'A chat' });
    mockSaveMessage.mockResolvedValue({ messageId: 'resp-1' });
    mockSpendTokens.mockResolvedValue(undefined);
  });

  it('runs its usage spend and response save INSIDE beforePublish, before abortJob resolves', async () => {
    // The old shape awaited abortJob and persisted afterwards — after abortJob had
    // already released its finalization lease, so an account-deletion cascade could
    // race the spend/save. Enrolled in beforePublish, the writes stay covered.
    const persistedDuringAbort = { spend: false, save: false };
    mockAbortJob.mockImplementation(async (streamId, options) => {
      await options.beforePublish({
        jobData: {
          responseMessageId: 'resp-1',
          userMessage: { messageId: 'user-1' },
          conversationId: 'conv-1',
          sender: 'AI',
          promptTokens: 3,
        },
        content: [{ type: 'text', text: 'partial' }],
        text: 'partial',
        collectedUsage: [],
      });
      persistedDuringAbort.spend = mockSpendTokens.mock.calls.length > 0;
      persistedDuringAbort.save = mockSaveMessage.mock.calls.length > 0;
      return {
        success: true,
        jobData: {
          responseMessageId: 'resp-1',
          userMessage: { messageId: 'user-1' },
          conversationId: 'conv-1',
        },
        content: [],
        text: 'partial',
        collectedUsage: [],
        finalEvent: null,
      };
    });
    const req = { user: { id: 'user-1', email: 'a@b.com' }, body: { abortKey: 'conv-1:x' } };
    const res = createRes();

    await handleAbort()(req, res);

    expect(persistedDuringAbort).toEqual({ spend: true, save: true });
    expect(res.send).toHaveBeenCalled();
  });

  it('answers 204 without persisting when the abort found nothing', async () => {
    mockAbortJob.mockResolvedValue({ success: false, jobData: null, content: [], text: '' });
    const req = { user: { id: 'user-1', email: 'a@b.com' }, body: { abortKey: 'conv-1:x' } };
    const res = createRes();

    await handleAbort()(req, res);

    expect(res.status).toHaveBeenCalledWith(204);
    expect(mockSaveMessage).not.toHaveBeenCalled();
    expect(mockSpendTokens).not.toHaveBeenCalled();
  });
});
