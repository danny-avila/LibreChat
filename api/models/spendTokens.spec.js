const mongoose = require('mongoose');

jest.mock('./Transaction', () => ({
  Transaction: {
    create: jest.fn(),
    createStructured: jest.fn(),
  },
}));

jest.mock('./Balance', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

jest.mock('~/config', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

// New config module
const { getBalanceConfig } = require('~/server/services/Config');
jest.mock('~/server/services/Config');

// Import after mocking
const { spendTokens, spendStructuredTokens } = require('./spendTokens');
const { Transaction } = require('./Transaction');
const Balance = require('./Balance');

describe('spendTokens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getBalanceConfig.mockResolvedValue({ enabled: true });
  });

  it('should create transactions for both prompt and completion tokens', async () => {
    const txData = {
      user: new mongoose.Types.ObjectId(),
      conversationId: 'test-convo',
      model: 'gpt-3.5-turbo',
      context: 'test',
    };
    const tokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
    };

    Transaction.create.mockResolvedValueOnce({ tokenType: 'prompt', rawAmount: -100 });
    Transaction.create.mockResolvedValueOnce({ tokenType: 'completion', rawAmount: -50 });
    Balance.findOne.mockResolvedValue({ tokenCredits: 10000 });
    Balance.findOneAndUpdate.mockResolvedValue({ tokenCredits: 9850 });

    await spendTokens(txData, tokenUsage);

    expect(Transaction.create).toHaveBeenCalledTimes(2);
    expect(Transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenType: 'prompt',
        rawAmount: -100,
      }),
    );
    expect(Transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenType: 'completion',
        rawAmount: -50,
      }),
    );
  });

  it('should handle zero completion tokens', async () => {
    const txData = {
      user: new mongoose.Types.ObjectId(),
      conversationId: 'test-convo',
      model: 'gpt-3.5-turbo',
      context: 'test',
    };
    const tokenUsage = {
      promptTokens: 100,
      completionTokens: 0,
    };

    Transaction.create.mockResolvedValueOnce({ tokenType: 'prompt', rawAmount: -100 });
    Transaction.create.mockResolvedValueOnce({ tokenType: 'completion', rawAmount: -0 });
    Balance.findOne.mockResolvedValue({ tokenCredits: 10000 });
    Balance.findOneAndUpdate.mockResolvedValue({ tokenCredits: 9850 });

    await spendTokens(txData, tokenUsage);

    expect(Transaction.create).toHaveBeenCalledTimes(2);
    expect(Transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenType: 'prompt',
        rawAmount: -100,
      }),
    );
    expect(Transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenType: 'completion',
        rawAmount: -0,
      }),
    );
  });

  it('should handle undefined token counts', async () => {
    const txData = {
      user: new mongoose.Types.ObjectId(),
      conversationId: 'test-convo',
      model: 'gpt-3.5-turbo',
      context: 'test',
    };
    const tokenUsage = {};

    await spendTokens(txData, tokenUsage);

    expect(Transaction.create).not.toHaveBeenCalled();
  });

  it('should not update balance when the balance feature is disabled', async () => {
    // Override configuration: disable balance updates.
    getBalanceConfig.mockResolvedValue({ enabled: false });
    const txData = {
      user: new mongoose.Types.ObjectId(),
      conversationId: 'test-convo',
      model: 'gpt-3.5-turbo',
      context: 'test',
    };
    const tokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
    };

    Transaction.create.mockResolvedValueOnce({ tokenType: 'prompt', rawAmount: -100 });
    Transaction.create.mockResolvedValueOnce({ tokenType: 'completion', rawAmount: -50 });

    await spendTokens(txData, tokenUsage);

    expect(Transaction.create).toHaveBeenCalledTimes(2);
    // When balance updates are disabled, Balance methods should not be called.
    expect(Balance.findOne).not.toHaveBeenCalled();
    expect(Balance.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('should create structured transactions for both prompt and completion tokens', async () => {
    const txData = {
      user: new mongoose.Types.ObjectId(),
      conversationId: 'test-convo',
      model: 'claude-3-5-sonnet',
      context: 'test',
    };
    const tokenUsage = {
      promptTokens: {
        input: 10,
        write: 100,
        read: 5,
      },
      completionTokens: 50,
    };

    Transaction.createStructured.mockResolvedValueOnce({
      rate: 3.75,
      user: txData.user.toString(),
      balance: 9570,
      prompt: -430,
    });
    Transaction.create.mockResolvedValueOnce({
      rate: 15,
      user: txData.user.toString(),
      balance: 8820,
      completion: -750,
    });

    const result = await spendStructuredTokens(txData, tokenUsage);

    expect(Transaction.createStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenType: 'prompt',
        inputTokens: -10,
        writeTokens: -100,
        readTokens: -5,
      }),
    );
    expect(Transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenType: 'completion',
        rawAmount: -50,
      }),
    );
    expect(result).toEqual({
      prompt: expect.objectContaining({
        rate: 3.75,
        user: txData.user.toString(),
        balance: 9570,
        prompt: -430,
      }),
      completion: expect.objectContaining({
        rate: 15,
        user: txData.user.toString(),
        balance: 8820,
        completion: -750,
      }),
    });
  });
});
