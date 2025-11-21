const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { spendTokens, spendStructuredTokens } = require('./spendTokens');
const { getMultiplier, getCacheMultiplier } = require('./tx');
const { createTransaction, createStructuredTransaction } = require('./Transaction');
const { Balance, Transaction } = require('~/db/models');

let mongoServer;
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
  await mongoose.connection.dropDatabase();
});

describe('Regular Token Spending Tests', () => {
  test('Balance should decrease when spending tokens with spendTokens', async () => {
    // Arrange
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 10000000; // $10.00
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'gpt-3.5-turbo';
    const txData = {
      user: userId,
      conversationId: 'test-conversation-id',
      model,
      context: 'test',
      endpointTokenConfig: null,
      balance: { enabled: true },
    };

    const tokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
    };

    // Act
    await spendTokens(txData, tokenUsage);

    // Assert
    const updatedBalance = await Balance.findOne({ user: userId });
    const promptMultiplier = getMultiplier({ model, tokenType: 'prompt' });
    const completionMultiplier = getMultiplier({ model, tokenType: 'completion' });
    const expectedTotalCost = 100 * promptMultiplier + 50 * completionMultiplier;
    const expectedBalance = initialBalance - expectedTotalCost;

    expect(updatedBalance.tokenCredits).toBeCloseTo(expectedBalance, 0);
  });

  test('spendTokens should handle zero completion tokens', async () => {
    // Arrange
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 10000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'gpt-3.5-turbo';
    const txData = {
      user: userId,
      conversationId: 'test-conversation-id',
      model,
      context: 'test',
      endpointTokenConfig: null,
      balance: { enabled: true },
    };

    const tokenUsage = {
      promptTokens: 100,
      completionTokens: 0,
    };

    // Act
    await spendTokens(txData, tokenUsage);

    // Assert
    const updatedBalance = await Balance.findOne({ user: userId });
    const promptMultiplier = getMultiplier({ model, tokenType: 'prompt' });
    const expectedCost = 100 * promptMultiplier;
    expect(updatedBalance.tokenCredits).toBeCloseTo(initialBalance - expectedCost, 0);
  });

  test('spendTokens should handle undefined token counts', async () => {
    // Arrange
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 10000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'gpt-3.5-turbo';
    const txData = {
      user: userId,
      conversationId: 'test-conversation-id',
      model,
      context: 'test',
      endpointTokenConfig: null,
      balance: { enabled: true },
    };

    const tokenUsage = {};

    // Act
    const result = await spendTokens(txData, tokenUsage);

    // Assert: No transaction should be created
    expect(result).toBeUndefined();
  });

  test('spendTokens should handle only prompt tokens', async () => {
    // Arrange
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 10000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'gpt-3.5-turbo';
    const txData = {
      user: userId,
      conversationId: 'test-conversation-id',
      model,
      context: 'test',
      endpointTokenConfig: null,
      balance: { enabled: true },
    };

    const tokenUsage = { promptTokens: 100 };

    // Act
    await spendTokens(txData, tokenUsage);

    // Assert
    const updatedBalance = await Balance.findOne({ user: userId });
    const promptMultiplier = getMultiplier({ model, tokenType: 'prompt' });
    const expectedCost = 100 * promptMultiplier;
    expect(updatedBalance.tokenCredits).toBeCloseTo(initialBalance - expectedCost, 0);
  });

  test('spendTokens should not update balance when balance feature is disabled', async () => {
    // Arrange: Balance config is now passed directly in txData
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 10000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'gpt-3.5-turbo';
    const txData = {
      user: userId,
      conversationId: 'test-conversation-id',
      model,
      context: 'test',
      endpointTokenConfig: null,
      balance: { enabled: false },
    };

    const tokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
    };

    // Act
    await spendTokens(txData, tokenUsage);

    // Assert: Balance should remain unchanged.
    const updatedBalance = await Balance.findOne({ user: userId });
    expect(updatedBalance.tokenCredits).toBe(initialBalance);
  });
});

describe('Structured Token Spending Tests', () => {
  test('Balance should decrease and rawAmount should be set when spending a large number of structured tokens', async () => {
    // Arrange
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 17613154.55; // $17.61
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'claude-3-5-sonnet';
    const txData = {
      user: userId,
      conversationId: 'c23a18da-706c-470a-ac28-ec87ed065199',
      model,
      context: 'message',
      endpointTokenConfig: null,
      balance: { enabled: true },
    };

    const tokenUsage = {
      promptTokens: {
        input: 11,
        write: 140522,
        read: 0,
      },
      completionTokens: 5,
    };

    const promptMultiplier = getMultiplier({ model, tokenType: 'prompt' });
    const completionMultiplier = getMultiplier({ model, tokenType: 'completion' });
    const writeMultiplier = getCacheMultiplier({ model, cacheType: 'write' });
    const readMultiplier = getCacheMultiplier({ model, cacheType: 'read' });

    // Act
    const result = await spendStructuredTokens(txData, tokenUsage);

    // Calculate expected costs.
    const expectedPromptCost =
      tokenUsage.promptTokens.input * promptMultiplier +
      tokenUsage.promptTokens.write * writeMultiplier +
      tokenUsage.promptTokens.read * readMultiplier;
    const expectedCompletionCost = tokenUsage.completionTokens * completionMultiplier;
    const expectedTotalCost = expectedPromptCost + expectedCompletionCost;
    const expectedBalance = initialBalance - expectedTotalCost;

    // Assert
    expect(result.completion.balance).toBeLessThan(initialBalance);
    const allowedDifference = 100;
    expect(Math.abs(result.completion.balance - expectedBalance)).toBeLessThan(allowedDifference);
    const balanceDecrease = initialBalance - result.completion.balance;
    expect(balanceDecrease).toBeCloseTo(expectedTotalCost, 0);

    const expectedPromptTokenValue = -expectedPromptCost;
    const expectedCompletionTokenValue = -expectedCompletionCost;
    expect(result.prompt.prompt).toBeCloseTo(expectedPromptTokenValue, 1);
    expect(result.completion.completion).toBe(expectedCompletionTokenValue);
  });

  test('should handle zero completion tokens in structured spending', async () => {
    // Arrange
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 17613154.55;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'claude-3-5-sonnet';
    const txData = {
      user: userId,
      conversationId: 'test-convo',
      model,
      context: 'message',
      balance: { enabled: true },
    };

    const tokenUsage = {
      promptTokens: {
        input: 10,
        write: 100,
        read: 5,
      },
      completionTokens: 0,
    };

    // Act
    const result = await spendStructuredTokens(txData, tokenUsage);

    // Assert
    expect(result.prompt).toBeDefined();
    expect(result.completion).toBeUndefined();
    expect(result.prompt.prompt).toBeLessThan(0);
  });

  test('should handle only prompt tokens in structured spending', async () => {
    // Arrange
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 17613154.55;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'claude-3-5-sonnet';
    const txData = {
      user: userId,
      conversationId: 'test-convo',
      model,
      context: 'message',
      balance: { enabled: true },
    };

    const tokenUsage = {
      promptTokens: {
        input: 10,
        write: 100,
        read: 5,
      },
    };

    // Act
    const result = await spendStructuredTokens(txData, tokenUsage);

    // Assert
    expect(result.prompt).toBeDefined();
    expect(result.completion).toBeUndefined();
    expect(result.prompt.prompt).toBeLessThan(0);
  });

  test('should handle undefined token counts in structured spending', async () => {
    // Arrange
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 17613154.55;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'claude-3-5-sonnet';
    const txData = {
      user: userId,
      conversationId: 'test-convo',
      model,
      context: 'message',
      balance: { enabled: true },
    };

    const tokenUsage = {};

    // Act
    const result = await spendStructuredTokens(txData, tokenUsage);

    // Assert
    expect(result).toEqual({
      prompt: undefined,
      completion: undefined,
    });
  });

  test('should handle incomplete context for completion tokens', async () => {
    // Arrange
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 17613154.55;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'claude-3-5-sonnet';
    const txData = {
      user: userId,
      conversationId: 'test-convo',
      model,
      context: 'incomplete',
      balance: { enabled: true },
    };

    const tokenUsage = {
      promptTokens: {
        input: 10,
        write: 100,
        read: 5,
      },
      completionTokens: 50,
    };

    // Act
    const result = await spendStructuredTokens(txData, tokenUsage);

    // Assert:
    // (Assuming a multiplier for completion of 15 and a cancel rate of 1.15 as noted in the original test.)
    expect(result.completion.completion).toBeCloseTo(-50 * 15 * 1.15, 0);
  });
});

describe('NaN Handling Tests', () => {
  test('should skip transaction creation when rawAmount is NaN', async () => {
    // Arrange
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 10000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'gpt-3.5-turbo';
    const txData = {
      user: userId,
      conversationId: 'test-conversation-id',
      model,
      context: 'test',
      endpointTokenConfig: null,
      rawAmount: NaN,
      tokenType: 'prompt',
      balance: { enabled: true },
    };

    // Act
    const result = await createTransaction(txData);

    // Assert: No transaction should be created and balance remains unchanged.
    expect(result).toBeUndefined();
    const balance = await Balance.findOne({ user: userId });
    expect(balance.tokenCredits).toBe(initialBalance);
  });
});

describe('Transactions Config Tests', () => {
  test('createTransaction should not save when transactions.enabled is false', async () => {
    // Arrange
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 10000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'gpt-3.5-turbo';
    const txData = {
      user: userId,
      conversationId: 'test-conversation-id',
      model,
      context: 'test',
      endpointTokenConfig: null,
      rawAmount: -100,
      tokenType: 'prompt',
      transactions: { enabled: false },
    };

    // Act
    const result = await createTransaction(txData);

    // Assert: No transaction should be created
    expect(result).toBeUndefined();
    const transactions = await Transaction.find({ user: userId });
    expect(transactions).toHaveLength(0);
    const balance = await Balance.findOne({ user: userId });
    expect(balance.tokenCredits).toBe(initialBalance);
  });

  test('createTransaction should save when transactions.enabled is true', async () => {
    // Arrange
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 10000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'gpt-3.5-turbo';
    const txData = {
      user: userId,
      conversationId: 'test-conversation-id',
      model,
      context: 'test',
      endpointTokenConfig: null,
      rawAmount: -100,
      tokenType: 'prompt',
      transactions: { enabled: true },
      balance: { enabled: true },
    };

    // Act
    const result = await createTransaction(txData);

    // Assert: Transaction should be created
    expect(result).toBeDefined();
    expect(result.balance).toBeLessThan(initialBalance);
    const transactions = await Transaction.find({ user: userId });
    expect(transactions).toHaveLength(1);
    expect(transactions[0].rawAmount).toBe(-100);
  });

  test('createTransaction should save when balance.enabled is true even if transactions config is missing', async () => {
    // Arrange
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 10000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'gpt-3.5-turbo';
    const txData = {
      user: userId,
      conversationId: 'test-conversation-id',
      model,
      context: 'test',
      endpointTokenConfig: null,
      rawAmount: -100,
      tokenType: 'prompt',
      balance: { enabled: true },
      // No transactions config provided
    };

    // Act
    const result = await createTransaction(txData);

    // Assert: Transaction should be created (backward compatibility)
    expect(result).toBeDefined();
    expect(result.balance).toBeLessThan(initialBalance);
    const transactions = await Transaction.find({ user: userId });
    expect(transactions).toHaveLength(1);
  });

  test('createTransaction should save transaction but not update balance when balance is disabled but transactions enabled', async () => {
    // Arrange
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 10000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'gpt-3.5-turbo';
    const txData = {
      user: userId,
      conversationId: 'test-conversation-id',
      model,
      context: 'test',
      endpointTokenConfig: null,
      rawAmount: -100,
      tokenType: 'prompt',
      transactions: { enabled: true },
      balance: { enabled: false },
    };

    // Act
    const result = await createTransaction(txData);

    // Assert: Transaction should be created but balance unchanged
    expect(result).toBeUndefined();
    const transactions = await Transaction.find({ user: userId });
    expect(transactions).toHaveLength(1);
    expect(transactions[0].rawAmount).toBe(-100);
    const balance = await Balance.findOne({ user: userId });
    expect(balance.tokenCredits).toBe(initialBalance);
  });

  test('createStructuredTransaction should not save when transactions.enabled is false', async () => {
    // Arrange
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 10000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'claude-3-5-sonnet';
    const txData = {
      user: userId,
      conversationId: 'test-conversation-id',
      model,
      context: 'message',
      tokenType: 'prompt',
      inputTokens: -10,
      writeTokens: -100,
      readTokens: -5,
      transactions: { enabled: false },
    };

    // Act
    const result = await createStructuredTransaction(txData);

    // Assert: No transaction should be created
    expect(result).toBeUndefined();
    const transactions = await Transaction.find({ user: userId });
    expect(transactions).toHaveLength(0);
    const balance = await Balance.findOne({ user: userId });
    expect(balance.tokenCredits).toBe(initialBalance);
  });

  test('createStructuredTransaction should save transaction but not update balance when balance is disabled but transactions enabled', async () => {
    // Arrange
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 10000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'claude-3-5-sonnet';
    const txData = {
      user: userId,
      conversationId: 'test-conversation-id',
      model,
      context: 'message',
      tokenType: 'prompt',
      inputTokens: -10,
      writeTokens: -100,
      readTokens: -5,
      transactions: { enabled: true },
      balance: { enabled: false },
    };

    // Act
    const result = await createStructuredTransaction(txData);

    // Assert: Transaction should be created but balance unchanged
    expect(result).toBeUndefined();
    const transactions = await Transaction.find({ user: userId });
    expect(transactions).toHaveLength(1);
    expect(transactions[0].inputTokens).toBe(-10);
    expect(transactions[0].writeTokens).toBe(-100);
    expect(transactions[0].readTokens).toBe(-5);
    const balance = await Balance.findOne({ user: userId });
    expect(balance.tokenCredits).toBe(initialBalance);
  });
});
