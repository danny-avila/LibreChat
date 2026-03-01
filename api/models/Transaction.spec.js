const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { spendTokens, spendStructuredTokens } = require('./spendTokens');
const { getMultiplier, getCacheMultiplier, premiumTokenValues, tokenValues } = require('./tx');
const { createTransaction, createStructuredTransaction } = require('./Transaction');
const { Balance, Transaction } = require('~/db/models');
const { createMethods } = require('@librechat/data-schemas');
const { recordCollectedUsage } = require('@librechat/api');

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

describe('calculateTokenValue Edge Cases', () => {
  test('should derive multiplier from model when valueKey is not provided', async () => {
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 100000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'gpt-4';
    const promptTokens = 1000;

    const result = await createTransaction({
      user: userId,
      conversationId: 'test-no-valuekey',
      model,
      tokenType: 'prompt',
      rawAmount: -promptTokens,
      context: 'test',
      balance: { enabled: true },
    });

    const expectedRate = getMultiplier({ model, tokenType: 'prompt' });
    expect(result.rate).toBe(expectedRate);

    const tx = await Transaction.findOne({ user: userId });
    expect(tx.tokenValue).toBe(-promptTokens * expectedRate);
    expect(tx.rate).toBe(expectedRate);
  });

  test('should derive valueKey and apply correct rate for an unknown model with tokenType', async () => {
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 100000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    await createTransaction({
      user: userId,
      conversationId: 'test-unknown-model',
      model: 'some-unrecognized-model-xyz',
      tokenType: 'prompt',
      rawAmount: -500,
      context: 'test',
      balance: { enabled: true },
    });

    const tx = await Transaction.findOne({ user: userId });
    expect(tx.rate).toBeDefined();
    expect(tx.rate).toBeGreaterThan(0);
    expect(tx.tokenValue).toBe(tx.rawAmount * tx.rate);
  });

  test('should correctly apply model-derived multiplier without valueKey for completion', async () => {
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 100000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'claude-opus-4-6';
    const completionTokens = 500;

    const result = await createTransaction({
      user: userId,
      conversationId: 'test-completion-no-valuekey',
      model,
      tokenType: 'completion',
      rawAmount: -completionTokens,
      context: 'test',
      balance: { enabled: true },
    });

    const expectedRate = getMultiplier({ model, tokenType: 'completion' });
    expect(expectedRate).toBe(tokenValues[model].completion);
    expect(result.rate).toBe(expectedRate);

    const updatedBalance = await Balance.findOne({ user: userId });
    expect(updatedBalance.tokenCredits).toBeCloseTo(
      initialBalance - completionTokens * expectedRate,
      0,
    );
  });
});

describe('Premium Token Pricing Integration Tests', () => {
  test('spendTokens should apply standard pricing when prompt tokens are below premium threshold', async () => {
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 100000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'claude-opus-4-6';
    const promptTokens = 100000;
    const completionTokens = 500;

    const txData = {
      user: userId,
      conversationId: 'test-premium-below',
      model,
      context: 'test',
      endpointTokenConfig: null,
      balance: { enabled: true },
    };

    await spendTokens(txData, { promptTokens, completionTokens });

    const standardPromptRate = tokenValues[model].prompt;
    const standardCompletionRate = tokenValues[model].completion;
    const expectedCost =
      promptTokens * standardPromptRate + completionTokens * standardCompletionRate;

    const updatedBalance = await Balance.findOne({ user: userId });
    expect(updatedBalance.tokenCredits).toBeCloseTo(initialBalance - expectedCost, 0);
  });

  test('spendTokens should apply premium pricing when prompt tokens exceed premium threshold', async () => {
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 100000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'claude-opus-4-6';
    const promptTokens = 250000;
    const completionTokens = 500;

    const txData = {
      user: userId,
      conversationId: 'test-premium-above',
      model,
      context: 'test',
      endpointTokenConfig: null,
      balance: { enabled: true },
    };

    await spendTokens(txData, { promptTokens, completionTokens });

    const premiumPromptRate = premiumTokenValues[model].prompt;
    const premiumCompletionRate = premiumTokenValues[model].completion;
    const expectedCost =
      promptTokens * premiumPromptRate + completionTokens * premiumCompletionRate;

    const updatedBalance = await Balance.findOne({ user: userId });
    expect(updatedBalance.tokenCredits).toBeCloseTo(initialBalance - expectedCost, 0);
  });

  test('spendTokens should apply standard pricing at exactly the premium threshold', async () => {
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 100000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'claude-opus-4-6';
    const promptTokens = premiumTokenValues[model].threshold;
    const completionTokens = 500;

    const txData = {
      user: userId,
      conversationId: 'test-premium-exact',
      model,
      context: 'test',
      endpointTokenConfig: null,
      balance: { enabled: true },
    };

    await spendTokens(txData, { promptTokens, completionTokens });

    const standardPromptRate = tokenValues[model].prompt;
    const standardCompletionRate = tokenValues[model].completion;
    const expectedCost =
      promptTokens * standardPromptRate + completionTokens * standardCompletionRate;

    const updatedBalance = await Balance.findOne({ user: userId });
    expect(updatedBalance.tokenCredits).toBeCloseTo(initialBalance - expectedCost, 0);
  });

  test('spendStructuredTokens should apply premium pricing when total input tokens exceed threshold', async () => {
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 100000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'claude-opus-4-6';
    const txData = {
      user: userId,
      conversationId: 'test-structured-premium',
      model,
      context: 'message',
      endpointTokenConfig: null,
      balance: { enabled: true },
    };

    const tokenUsage = {
      promptTokens: {
        input: 200000,
        write: 10000,
        read: 5000,
      },
      completionTokens: 1000,
    };

    const totalInput =
      tokenUsage.promptTokens.input + tokenUsage.promptTokens.write + tokenUsage.promptTokens.read;

    await spendStructuredTokens(txData, tokenUsage);

    const premiumPromptRate = premiumTokenValues[model].prompt;
    const premiumCompletionRate = premiumTokenValues[model].completion;
    const writeMultiplier = getCacheMultiplier({ model, cacheType: 'write' });
    const readMultiplier = getCacheMultiplier({ model, cacheType: 'read' });

    const expectedPromptCost =
      tokenUsage.promptTokens.input * premiumPromptRate +
      tokenUsage.promptTokens.write * writeMultiplier +
      tokenUsage.promptTokens.read * readMultiplier;
    const expectedCompletionCost = tokenUsage.completionTokens * premiumCompletionRate;
    const expectedTotalCost = expectedPromptCost + expectedCompletionCost;

    const updatedBalance = await Balance.findOne({ user: userId });
    expect(totalInput).toBeGreaterThan(premiumTokenValues[model].threshold);
    expect(updatedBalance.tokenCredits).toBeCloseTo(initialBalance - expectedTotalCost, 0);
  });

  test('spendStructuredTokens should apply standard pricing when total input tokens are below threshold', async () => {
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 100000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'claude-opus-4-6';
    const txData = {
      user: userId,
      conversationId: 'test-structured-standard',
      model,
      context: 'message',
      endpointTokenConfig: null,
      balance: { enabled: true },
    };

    const tokenUsage = {
      promptTokens: {
        input: 50000,
        write: 10000,
        read: 5000,
      },
      completionTokens: 1000,
    };

    const totalInput =
      tokenUsage.promptTokens.input + tokenUsage.promptTokens.write + tokenUsage.promptTokens.read;

    await spendStructuredTokens(txData, tokenUsage);

    const standardPromptRate = tokenValues[model].prompt;
    const standardCompletionRate = tokenValues[model].completion;
    const writeMultiplier = getCacheMultiplier({ model, cacheType: 'write' });
    const readMultiplier = getCacheMultiplier({ model, cacheType: 'read' });

    const expectedPromptCost =
      tokenUsage.promptTokens.input * standardPromptRate +
      tokenUsage.promptTokens.write * writeMultiplier +
      tokenUsage.promptTokens.read * readMultiplier;
    const expectedCompletionCost = tokenUsage.completionTokens * standardCompletionRate;
    const expectedTotalCost = expectedPromptCost + expectedCompletionCost;

    const updatedBalance = await Balance.findOne({ user: userId });
    expect(totalInput).toBeLessThanOrEqual(premiumTokenValues[model].threshold);
    expect(updatedBalance.tokenCredits).toBeCloseTo(initialBalance - expectedTotalCost, 0);
  });

  test('spendTokens should apply standard pricing for gemini-3.1-pro-preview below threshold', async () => {
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 100000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'gemini-3.1-pro-preview';
    const promptTokens = 100000;
    const completionTokens = 500;

    const txData = {
      user: userId,
      conversationId: 'test-gemini31-below',
      model,
      context: 'test',
      endpointTokenConfig: null,
      balance: { enabled: true },
    };

    await spendTokens(txData, { promptTokens, completionTokens });

    const standardPromptRate = tokenValues['gemini-3.1'].prompt;
    const standardCompletionRate = tokenValues['gemini-3.1'].completion;
    const expectedCost =
      promptTokens * standardPromptRate + completionTokens * standardCompletionRate;

    const updatedBalance = await Balance.findOne({ user: userId });
    expect(updatedBalance.tokenCredits).toBeCloseTo(initialBalance - expectedCost, 0);
  });

  test('spendTokens should apply premium pricing for gemini-3.1-pro-preview above threshold', async () => {
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 100000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'gemini-3.1-pro-preview';
    const promptTokens = 250000;
    const completionTokens = 500;

    const txData = {
      user: userId,
      conversationId: 'test-gemini31-above',
      model,
      context: 'test',
      endpointTokenConfig: null,
      balance: { enabled: true },
    };

    await spendTokens(txData, { promptTokens, completionTokens });

    const premiumPromptRate = premiumTokenValues['gemini-3.1'].prompt;
    const premiumCompletionRate = premiumTokenValues['gemini-3.1'].completion;
    const expectedCost =
      promptTokens * premiumPromptRate + completionTokens * premiumCompletionRate;

    const updatedBalance = await Balance.findOne({ user: userId });
    expect(updatedBalance.tokenCredits).toBeCloseTo(initialBalance - expectedCost, 0);
  });

  test('spendTokens should apply standard pricing for gemini-3.1-pro-preview at exactly the threshold', async () => {
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 100000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'gemini-3.1-pro-preview';
    const promptTokens = premiumTokenValues['gemini-3.1'].threshold;
    const completionTokens = 500;

    const txData = {
      user: userId,
      conversationId: 'test-gemini31-exact',
      model,
      context: 'test',
      endpointTokenConfig: null,
      balance: { enabled: true },
    };

    await spendTokens(txData, { promptTokens, completionTokens });

    const standardPromptRate = tokenValues['gemini-3.1'].prompt;
    const standardCompletionRate = tokenValues['gemini-3.1'].completion;
    const expectedCost =
      promptTokens * standardPromptRate + completionTokens * standardCompletionRate;

    const updatedBalance = await Balance.findOne({ user: userId });
    expect(updatedBalance.tokenCredits).toBeCloseTo(initialBalance - expectedCost, 0);
  });

  test('spendStructuredTokens should apply premium pricing for gemini-3.1 when total input exceeds threshold', async () => {
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 100000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'gemini-3.1-pro-preview';
    const txData = {
      user: userId,
      conversationId: 'test-gemini31-structured-premium',
      model,
      context: 'message',
      endpointTokenConfig: null,
      balance: { enabled: true },
    };

    const tokenUsage = {
      promptTokens: {
        input: 200000,
        write: 10000,
        read: 5000,
      },
      completionTokens: 1000,
    };

    const totalInput =
      tokenUsage.promptTokens.input + tokenUsage.promptTokens.write + tokenUsage.promptTokens.read;

    await spendStructuredTokens(txData, tokenUsage);

    const premiumPromptRate = premiumTokenValues['gemini-3.1'].prompt;
    const premiumCompletionRate = premiumTokenValues['gemini-3.1'].completion;
    const writeMultiplier = getCacheMultiplier({ model, cacheType: 'write' });
    const readMultiplier = getCacheMultiplier({ model, cacheType: 'read' });

    const expectedPromptCost =
      tokenUsage.promptTokens.input * premiumPromptRate +
      tokenUsage.promptTokens.write * writeMultiplier +
      tokenUsage.promptTokens.read * readMultiplier;
    const expectedCompletionCost = tokenUsage.completionTokens * premiumCompletionRate;
    const expectedTotalCost = expectedPromptCost + expectedCompletionCost;

    const updatedBalance = await Balance.findOne({ user: userId });
    expect(totalInput).toBeGreaterThan(premiumTokenValues['gemini-3.1'].threshold);
    expect(updatedBalance.tokenCredits).toBeCloseTo(initialBalance - expectedTotalCost, 0);
  });

  test('non-premium models should not be affected by inputTokenCount regardless of prompt size', async () => {
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 100000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'claude-opus-4-5';
    const promptTokens = 300000;
    const completionTokens = 500;

    const txData = {
      user: userId,
      conversationId: 'test-no-premium',
      model,
      context: 'test',
      endpointTokenConfig: null,
      balance: { enabled: true },
    };

    await spendTokens(txData, { promptTokens, completionTokens });

    const standardPromptRate = getMultiplier({ model, tokenType: 'prompt' });
    const standardCompletionRate = getMultiplier({ model, tokenType: 'completion' });
    const expectedCost =
      promptTokens * standardPromptRate + completionTokens * standardCompletionRate;

    const updatedBalance = await Balance.findOne({ user: userId });
    expect(updatedBalance.tokenCredits).toBeCloseTo(initialBalance - expectedCost, 0);
  });
});

describe('Bulk path parity', () => {
  /**
   * Each test here mirrors an existing legacy test above, replacing spendTokens/
   * spendStructuredTokens with recordCollectedUsage + bulk deps.
   * The balance deduction and transaction document fields must be numerically identical.
   */
  let bulkDeps;
  let methods;

  beforeEach(() => {
    methods = createMethods(mongoose);
    bulkDeps = {
      spendTokens: () => Promise.resolve(),
      spendStructuredTokens: () => Promise.resolve(),
      pricing: { getMultiplier, getCacheMultiplier },
      bulkWriteOps: {
        insertMany: methods.bulkInsertTransactions,
        updateBalance: methods.updateBalance,
      },
    };
  });

  test('balance should decrease when spending tokens via bulk path', async () => {
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 10000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'gpt-3.5-turbo';
    const promptTokens = 100;
    const completionTokens = 50;

    await recordCollectedUsage(bulkDeps, {
      user: userId.toString(),
      conversationId: 'test-conversation-id',
      model,
      context: 'test',
      balance: { enabled: true },
      transactions: { enabled: true },
      collectedUsage: [{ input_tokens: promptTokens, output_tokens: completionTokens, model }],
    });

    const updatedBalance = await Balance.findOne({ user: userId });
    const promptMultiplier = getMultiplier({
      model,
      tokenType: 'prompt',
      inputTokenCount: promptTokens,
    });
    const completionMultiplier = getMultiplier({
      model,
      tokenType: 'completion',
      inputTokenCount: promptTokens,
    });
    const expectedTotalCost =
      promptTokens * promptMultiplier + completionTokens * completionMultiplier;
    const expectedBalance = initialBalance - expectedTotalCost;

    expect(updatedBalance.tokenCredits).toBeCloseTo(expectedBalance, 0);

    const txns = await Transaction.find({ user: userId }).lean();
    expect(txns).toHaveLength(2);
  });

  test('bulk path should not update balance when balance.enabled is false', async () => {
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 10000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'gpt-3.5-turbo';

    await recordCollectedUsage(bulkDeps, {
      user: userId.toString(),
      conversationId: 'test-conversation-id',
      model,
      context: 'test',
      balance: { enabled: false },
      transactions: { enabled: true },
      collectedUsage: [{ input_tokens: 100, output_tokens: 50, model }],
    });

    const updatedBalance = await Balance.findOne({ user: userId });
    expect(updatedBalance.tokenCredits).toBe(initialBalance);
    const txns = await Transaction.find({ user: userId }).lean();
    expect(txns).toHaveLength(2); // transactions still recorded
  });

  test('bulk path should not insert when transactions.enabled is false', async () => {
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 10000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    await recordCollectedUsage(bulkDeps, {
      user: userId.toString(),
      conversationId: 'test-conversation-id',
      model: 'gpt-3.5-turbo',
      context: 'test',
      balance: { enabled: true },
      transactions: { enabled: false },
      collectedUsage: [{ input_tokens: 100, output_tokens: 50, model: 'gpt-3.5-turbo' }],
    });

    const txns = await Transaction.find({ user: userId }).lean();
    expect(txns).toHaveLength(0);
    const balance = await Balance.findOne({ user: userId });
    expect(balance.tokenCredits).toBe(initialBalance);
  });

  test('bulk path handles incomplete context for completion tokens — same CANCEL_RATE as legacy', async () => {
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 17613154.55;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'claude-3-5-sonnet';
    const promptTokens = 10;
    const completionTokens = 50;

    await recordCollectedUsage(bulkDeps, {
      user: userId.toString(),
      conversationId: 'test-convo',
      model,
      context: 'incomplete',
      balance: { enabled: true },
      transactions: { enabled: true },
      collectedUsage: [{ input_tokens: promptTokens, output_tokens: completionTokens, model }],
    });

    const txns = await Transaction.find({ user: userId }).lean();
    const completionTx = txns.find((t) => t.tokenType === 'completion');
    const completionMultiplier = getMultiplier({
      model,
      tokenType: 'completion',
      inputTokenCount: promptTokens,
    });
    expect(completionTx.tokenValue).toBeCloseTo(-completionTokens * completionMultiplier * 1.15, 0);
  });

  test('bulk path structured tokens — balance deduction matches legacy spendStructuredTokens', async () => {
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 17613154.55;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'claude-3-5-sonnet';
    const promptInput = 11;
    const promptWrite = 140522;
    const promptRead = 0;
    const completionTokens = 5;
    const totalInput = promptInput + promptWrite + promptRead;

    await recordCollectedUsage(bulkDeps, {
      user: userId.toString(),
      conversationId: 'test-convo',
      model,
      context: 'message',
      balance: { enabled: true },
      transactions: { enabled: true },
      collectedUsage: [
        {
          input_tokens: promptInput,
          output_tokens: completionTokens,
          model,
          input_token_details: { cache_creation: promptWrite, cache_read: promptRead },
        },
      ],
    });

    const promptMultiplier = getMultiplier({
      model,
      tokenType: 'prompt',
      inputTokenCount: totalInput,
    });
    const completionMultiplier = getMultiplier({
      model,
      tokenType: 'completion',
      inputTokenCount: totalInput,
    });
    const writeMultiplier = getCacheMultiplier({ model, cacheType: 'write' }) ?? promptMultiplier;
    const readMultiplier = getCacheMultiplier({ model, cacheType: 'read' }) ?? promptMultiplier;

    const expectedPromptCost =
      promptInput * promptMultiplier + promptWrite * writeMultiplier + promptRead * readMultiplier;
    const expectedCompletionCost = completionTokens * completionMultiplier;
    const expectedTotalCost = expectedPromptCost + expectedCompletionCost;
    const expectedBalance = initialBalance - expectedTotalCost;

    const updatedBalance = await Balance.findOne({ user: userId });
    expect(Math.abs(updatedBalance.tokenCredits - expectedBalance)).toBeLessThan(100);
  });

  test('premium pricing above threshold via bulk path — same balance as legacy', async () => {
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 100000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'claude-opus-4-6';
    const promptTokens = 250000;
    const completionTokens = 500;

    await recordCollectedUsage(bulkDeps, {
      user: userId.toString(),
      conversationId: 'test-premium',
      model,
      context: 'test',
      balance: { enabled: true },
      transactions: { enabled: true },
      collectedUsage: [{ input_tokens: promptTokens, output_tokens: completionTokens, model }],
    });

    const premiumPromptRate = premiumTokenValues[model].prompt;
    const premiumCompletionRate = premiumTokenValues[model].completion;
    const expectedCost =
      promptTokens * premiumPromptRate + completionTokens * premiumCompletionRate;

    const updatedBalance = await Balance.findOne({ user: userId });
    expect(updatedBalance.tokenCredits).toBeCloseTo(initialBalance - expectedCost, 0);
  });

  test('real-world multi-entry batch: 5 sequential tool calls — same total deduction as 5 legacy spendTokens calls', async () => {
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 100000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'claude-opus-4-5-20251101';
    const calls = [
      { input_tokens: 31596, output_tokens: 151 },
      { input_tokens: 35368, output_tokens: 150 },
      { input_tokens: 58362, output_tokens: 295 },
      { input_tokens: 112604, output_tokens: 193 },
      { input_tokens: 257440, output_tokens: 2217 },
    ];

    let expectedTotalCost = 0;
    for (const { input_tokens, output_tokens } of calls) {
      const pm = getMultiplier({ model, tokenType: 'prompt', inputTokenCount: input_tokens });
      const cm = getMultiplier({ model, tokenType: 'completion', inputTokenCount: input_tokens });
      expectedTotalCost += input_tokens * pm + output_tokens * cm;
    }

    await recordCollectedUsage(bulkDeps, {
      user: userId.toString(),
      conversationId: 'test-sequential',
      model,
      context: 'message',
      balance: { enabled: true },
      transactions: { enabled: true },
      collectedUsage: calls.map((c) => ({ ...c, model })),
    });

    const txns = await Transaction.find({ user: userId }).lean();
    expect(txns).toHaveLength(10); // 5 calls × 2 docs (prompt + completion)

    const updatedBalance = await Balance.findOne({ user: userId });
    expect(updatedBalance.tokenCredits).toBeCloseTo(initialBalance - expectedTotalCost, 0);
  });

  test('bulk path should save transaction but not update balance when balance disabled, transactions enabled', async () => {
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 10000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    await recordCollectedUsage(bulkDeps, {
      user: userId.toString(),
      conversationId: 'test-conversation-id',
      model: 'gpt-3.5-turbo',
      context: 'test',
      balance: { enabled: false },
      transactions: { enabled: true },
      collectedUsage: [{ input_tokens: 100, output_tokens: 50, model: 'gpt-3.5-turbo' }],
    });

    const txns = await Transaction.find({ user: userId }).lean();
    expect(txns).toHaveLength(2);
    expect(txns[0].rawAmount).toBeDefined();
    const balance = await Balance.findOne({ user: userId });
    expect(balance.tokenCredits).toBe(initialBalance);
  });

  test('bulk path structured tokens should not save when transactions.enabled is false', async () => {
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 10000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    await recordCollectedUsage(bulkDeps, {
      user: userId.toString(),
      conversationId: 'test-conversation-id',
      model: 'claude-3-5-sonnet',
      context: 'message',
      balance: { enabled: true },
      transactions: { enabled: false },
      collectedUsage: [
        {
          input_tokens: 10,
          output_tokens: 5,
          model: 'claude-3-5-sonnet',
          input_token_details: { cache_creation: 100, cache_read: 5 },
        },
      ],
    });

    const txns = await Transaction.find({ user: userId }).lean();
    expect(txns).toHaveLength(0);
    const balance = await Balance.findOne({ user: userId });
    expect(balance.tokenCredits).toBe(initialBalance);
  });

  test('bulk path structured tokens should save but not update balance when balance disabled', async () => {
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 10000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    await recordCollectedUsage(bulkDeps, {
      user: userId.toString(),
      conversationId: 'test-conversation-id',
      model: 'claude-3-5-sonnet',
      context: 'message',
      balance: { enabled: false },
      transactions: { enabled: true },
      collectedUsage: [
        {
          input_tokens: 10,
          output_tokens: 5,
          model: 'claude-3-5-sonnet',
          input_token_details: { cache_creation: 100, cache_read: 5 },
        },
      ],
    });

    const txns = await Transaction.find({ user: userId }).lean();
    expect(txns).toHaveLength(2);
    const promptTx = txns.find((t) => t.tokenType === 'prompt');
    expect(promptTx.inputTokens).toBe(-10);
    expect(promptTx.writeTokens).toBe(-100);
    expect(promptTx.readTokens).toBe(-5);
    const balance = await Balance.findOne({ user: userId });
    expect(balance.tokenCredits).toBe(initialBalance);
  });
});
