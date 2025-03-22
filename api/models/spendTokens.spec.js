const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { Transaction } = require('./Transaction');
const Balance = require('./Balance');
const { spendTokens, spendStructuredTokens } = require('./spendTokens');

// Mock the logger to prevent console output during tests
jest.mock('~/config', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock the Config service
const { getBalanceConfig } = require('~/server/services/Config');
jest.mock('~/server/services/Config');

describe('spendTokens', () => {
  let mongoServer;
  let userId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear collections before each test
    await Transaction.deleteMany({});
    await Balance.deleteMany({});

    // Create a new user ID for each test
    userId = new mongoose.Types.ObjectId();

    // Mock the balance config to be enabled by default
    getBalanceConfig.mockResolvedValue({ enabled: true });
  });

  it('should create transactions for both prompt and completion tokens', async () => {
    // Create a balance for the user
    await Balance.create({
      user: userId,
      tokenCredits: 10000,
    });

    const txData = {
      user: userId,
      conversationId: 'test-convo',
      model: 'gpt-3.5-turbo',
      context: 'test',
    };
    const tokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
    };

    await spendTokens(txData, tokenUsage);

    // Verify transactions were created
    const transactions = await Transaction.find({ user: userId }).sort({ tokenType: 1 });
    expect(transactions).toHaveLength(2);

    // Check completion transaction
    expect(transactions[0].tokenType).toBe('completion');
    expect(transactions[0].rawAmount).toBe(-50);

    // Check prompt transaction
    expect(transactions[1].tokenType).toBe('prompt');
    expect(transactions[1].rawAmount).toBe(-100);

    // Verify balance was updated
    const balance = await Balance.findOne({ user: userId });
    expect(balance).toBeDefined();
    expect(balance.tokenCredits).toBeLessThan(10000); // Balance should be reduced
  });

  it('should handle zero completion tokens', async () => {
    // Create a balance for the user
    await Balance.create({
      user: userId,
      tokenCredits: 10000,
    });

    const txData = {
      user: userId,
      conversationId: 'test-convo',
      model: 'gpt-3.5-turbo',
      context: 'test',
    };
    const tokenUsage = {
      promptTokens: 100,
      completionTokens: 0,
    };

    await spendTokens(txData, tokenUsage);

    // Verify transactions were created
    const transactions = await Transaction.find({ user: userId }).sort({ tokenType: 1 });
    expect(transactions).toHaveLength(2);

    // Check completion transaction
    expect(transactions[0].tokenType).toBe('completion');
    // In JavaScript -0 and 0 are different but functionally equivalent
    // Use Math.abs to handle both 0 and -0
    expect(Math.abs(transactions[0].rawAmount)).toBe(0);

    // Check prompt transaction
    expect(transactions[1].tokenType).toBe('prompt');
    expect(transactions[1].rawAmount).toBe(-100);
  });

  it('should handle undefined token counts', async () => {
    const txData = {
      user: userId,
      conversationId: 'test-convo',
      model: 'gpt-3.5-turbo',
      context: 'test',
    };
    const tokenUsage = {};

    await spendTokens(txData, tokenUsage);

    // Verify no transactions were created
    const transactions = await Transaction.find({ user: userId });
    expect(transactions).toHaveLength(0);
  });

  it('should not update balance when the balance feature is disabled', async () => {
    // Override configuration: disable balance updates
    getBalanceConfig.mockResolvedValue({ enabled: false });
    // Create a balance for the user
    await Balance.create({
      user: userId,
      tokenCredits: 10000,
    });

    const txData = {
      user: userId,
      conversationId: 'test-convo',
      model: 'gpt-3.5-turbo',
      context: 'test',
    };
    const tokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
    };

    await spendTokens(txData, tokenUsage);

    // Verify transactions were created
    const transactions = await Transaction.find({ user: userId });
    expect(transactions).toHaveLength(2);

    // Verify balance was not updated (should still be 10000)
    const balance = await Balance.findOne({ user: userId });
    expect(balance.tokenCredits).toBe(10000);
  });

  it('should create structured transactions for both prompt and completion tokens', async () => {
    // Create a balance for the user
    await Balance.create({
      user: userId,
      tokenCredits: 10000,
    });

    const txData = {
      user: userId,
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

    const result = await spendStructuredTokens(txData, tokenUsage);

    // Verify transactions were created
    const transactions = await Transaction.find({ user: userId }).sort({ tokenType: 1 });
    expect(transactions).toHaveLength(2);

    // Check completion transaction
    expect(transactions[0].tokenType).toBe('completion');
    expect(transactions[0].rawAmount).toBe(-50);

    // Check prompt transaction
    expect(transactions[1].tokenType).toBe('prompt');
    expect(transactions[1].inputTokens).toBe(-10);
    expect(transactions[1].writeTokens).toBe(-100);
    expect(transactions[1].readTokens).toBe(-5);

    // Verify result contains transaction info
    expect(result).toEqual({
      prompt: expect.objectContaining({
        user: userId.toString(),
        prompt: expect.any(Number),
      }),
      completion: expect.objectContaining({
        user: userId.toString(),
        completion: expect.any(Number),
      }),
    });

    // Verify balance was updated
    const balance = await Balance.findOne({ user: userId });
    expect(balance).toBeDefined();
    expect(balance.tokenCredits).toBeLessThan(10000); // Balance should be reduced
  });
});
