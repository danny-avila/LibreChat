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

  it('should not allow balance to go below zero when spending tokens', async () => {
    // Create a balance with a low amount
    await Balance.create({
      user: userId,
      tokenCredits: 5000,
    });

    const txData = {
      user: userId,
      conversationId: 'test-convo',
      model: 'gpt-4', // Using a more expensive model
      context: 'test',
    };

    // Spending more tokens than the user has balance for
    const tokenUsage = {
      promptTokens: 1000,
      completionTokens: 500,
    };

    await spendTokens(txData, tokenUsage);

    // Verify transactions were created
    const transactions = await Transaction.find({ user: userId }).sort({ tokenType: 1 });
    expect(transactions).toHaveLength(2);

    // Verify balance was reduced to exactly 0, not negative
    const balance = await Balance.findOne({ user: userId });
    expect(balance).toBeDefined();
    expect(balance.tokenCredits).toBe(0);

    // Check that the transaction records show the adjusted values
    const transactionResults = await Promise.all(
      transactions.map((t) =>
        Transaction.create({
          ...txData,
          tokenType: t.tokenType,
          rawAmount: t.rawAmount,
        }),
      ),
    );

    // The second transaction should have an adjusted value since balance is already 0
    expect(transactionResults[1]).toEqual(
      expect.objectContaining({
        balance: 0,
      }),
    );
  });

  it('should handle multiple transactions in sequence with low balance and not increase balance', async () => {
    // This test is specifically checking for the issue reported in production
    // where the balance increases after a transaction when it should remain at 0
    // Create a balance with a very low amount
    await Balance.create({
      user: userId,
      tokenCredits: 100,
    });

    // First transaction - should reduce balance to 0
    const txData1 = {
      user: userId,
      conversationId: 'test-convo-1',
      model: 'gpt-4',
      context: 'test',
    };

    const tokenUsage1 = {
      promptTokens: 100,
      completionTokens: 50,
    };

    await spendTokens(txData1, tokenUsage1);

    // Check balance after first transaction
    let balance = await Balance.findOne({ user: userId });
    expect(balance.tokenCredits).toBe(0);

    // Second transaction - should keep balance at 0, not make it negative or increase it
    const txData2 = {
      user: userId,
      conversationId: 'test-convo-2',
      model: 'gpt-4',
      context: 'test',
    };

    const tokenUsage2 = {
      promptTokens: 200,
      completionTokens: 100,
    };

    await spendTokens(txData2, tokenUsage2);

    // Check balance after second transaction - should still be 0
    balance = await Balance.findOne({ user: userId });
    expect(balance.tokenCredits).toBe(0);

    // Verify all transactions were created
    const transactions = await Transaction.find({ user: userId });
    expect(transactions).toHaveLength(4); // 2 transactions (prompt+completion) for each call

    // Let's examine the actual transaction records to see what's happening
    const transactionDetails = await Transaction.find({ user: userId }).sort({ createdAt: 1 });

    // Log the transaction details for debugging
    console.log('Transaction details:');
    transactionDetails.forEach((tx, i) => {
      console.log(`Transaction ${i + 1}:`, {
        tokenType: tx.tokenType,
        rawAmount: tx.rawAmount,
        tokenValue: tx.tokenValue,
        model: tx.model,
      });
    });

    // Check the return values from Transaction.create directly
    // This is to verify that the incrementValue is not becoming positive
    const directResult = await Transaction.create({
      user: userId,
      conversationId: 'test-convo-3',
      model: 'gpt-4',
      tokenType: 'completion',
      rawAmount: -100,
      context: 'test',
    });

    console.log('Direct Transaction.create result:', directResult);

    // The completion value should never be positive
    expect(directResult.completion).not.toBeGreaterThan(0);
  });

  it('should ensure tokenValue is always negative for spending tokens', async () => {
    // Create a balance for the user
    await Balance.create({
      user: userId,
      tokenCredits: 10000,
    });

    // Test with various models to check multiplier calculations
    const models = ['gpt-3.5-turbo', 'gpt-4', 'claude-3-5-sonnet'];

    for (const model of models) {
      const txData = {
        user: userId,
        conversationId: `test-convo-${model}`,
        model,
        context: 'test',
      };

      const tokenUsage = {
        promptTokens: 100,
        completionTokens: 50,
      };

      await spendTokens(txData, tokenUsage);

      // Get the transactions for this model
      const transactions = await Transaction.find({
        user: userId,
        model,
      });

      // Verify tokenValue is negative for all transactions
      transactions.forEach((tx) => {
        console.log(`Model ${model}, Type ${tx.tokenType}: tokenValue = ${tx.tokenValue}`);
        expect(tx.tokenValue).toBeLessThan(0);
      });
    }
  });

  it('should handle structured transactions in sequence with low balance', async () => {
    // Create a balance with a very low amount
    await Balance.create({
      user: userId,
      tokenCredits: 100,
    });

    // First transaction - should reduce balance to 0
    const txData1 = {
      user: userId,
      conversationId: 'test-convo-1',
      model: 'claude-3-5-sonnet',
      context: 'test',
    };

    const tokenUsage1 = {
      promptTokens: {
        input: 10,
        write: 100,
        read: 5,
      },
      completionTokens: 50,
    };

    await spendStructuredTokens(txData1, tokenUsage1);

    // Check balance after first transaction
    let balance = await Balance.findOne({ user: userId });
    expect(balance.tokenCredits).toBe(0);

    // Second transaction - should keep balance at 0, not make it negative or increase it
    const txData2 = {
      user: userId,
      conversationId: 'test-convo-2',
      model: 'claude-3-5-sonnet',
      context: 'test',
    };

    const tokenUsage2 = {
      promptTokens: {
        input: 20,
        write: 200,
        read: 10,
      },
      completionTokens: 100,
    };

    await spendStructuredTokens(txData2, tokenUsage2);

    // Check balance after second transaction - should still be 0
    balance = await Balance.findOne({ user: userId });
    expect(balance.tokenCredits).toBe(0);

    // Verify all transactions were created
    const transactions = await Transaction.find({ user: userId });
    expect(transactions).toHaveLength(4); // 2 transactions (prompt+completion) for each call

    // Let's examine the actual transaction records to see what's happening
    const transactionDetails = await Transaction.find({ user: userId }).sort({ createdAt: 1 });

    // Log the transaction details for debugging
    console.log('Structured transaction details:');
    transactionDetails.forEach((tx, i) => {
      console.log(`Transaction ${i + 1}:`, {
        tokenType: tx.tokenType,
        rawAmount: tx.rawAmount,
        tokenValue: tx.tokenValue,
        inputTokens: tx.inputTokens,
        writeTokens: tx.writeTokens,
        readTokens: tx.readTokens,
        model: tx.model,
      });
    });
  });

  it('should not allow balance to go below zero when spending structured tokens', async () => {
    // Create a balance with a low amount
    await Balance.create({
      user: userId,
      tokenCredits: 5000,
    });

    const txData = {
      user: userId,
      conversationId: 'test-convo',
      model: 'claude-3-5-sonnet', // Using a model that supports structured tokens
      context: 'test',
    };

    // Spending more tokens than the user has balance for
    const tokenUsage = {
      promptTokens: {
        input: 100,
        write: 1000,
        read: 50,
      },
      completionTokens: 500,
    };

    const result = await spendStructuredTokens(txData, tokenUsage);

    // Verify transactions were created
    const transactions = await Transaction.find({ user: userId }).sort({ tokenType: 1 });
    expect(transactions).toHaveLength(2);

    // Verify balance was reduced to exactly 0, not negative
    const balance = await Balance.findOne({ user: userId });
    expect(balance).toBeDefined();
    expect(balance.tokenCredits).toBe(0);

    // The result should show the adjusted values
    expect(result).toEqual({
      prompt: expect.objectContaining({
        user: userId.toString(),
        balance: expect.any(Number),
      }),
      completion: expect.objectContaining({
        user: userId.toString(),
        balance: 0, // Final balance should be 0
      }),
    });
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
