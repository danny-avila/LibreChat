import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { ITransaction } from '~/schema/transaction';
import type { TxData } from './transaction';
import type { IBalance } from '..';
import { createTxMethods, tokenValues, premiumTokenValues } from './tx';
import { matchModelName, findMatchingPattern } from './test-helpers';
import { createSpendTokensMethods } from './spendTokens';
import { createTransactionMethods } from './transaction';
import { createModels } from '~/models';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: InstanceType<typeof MongoMemoryServer>;
let Balance: mongoose.Model<IBalance>;
let Transaction: mongoose.Model<ITransaction>;
let spendTokens: ReturnType<typeof createSpendTokensMethods>['spendTokens'];
let spendStructuredTokens: ReturnType<typeof createSpendTokensMethods>['spendStructuredTokens'];
let createTransaction: ReturnType<typeof createTransactionMethods>['createTransaction'];
let createStructuredTransaction: ReturnType<
  typeof createTransactionMethods
>['createStructuredTransaction'];
let getMultiplier: ReturnType<typeof createTxMethods>['getMultiplier'];
let getCacheMultiplier: ReturnType<typeof createTxMethods>['getCacheMultiplier'];

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  // Register models
  const models = createModels(mongoose);
  Object.assign(mongoose.models, models);

  Balance = mongoose.models.Balance;
  Transaction = mongoose.models.Transaction;

  // Create methods from factories (following the chain in methods/index.ts)
  const txMethods = createTxMethods(mongoose, { matchModelName, findMatchingPattern });
  getMultiplier = txMethods.getMultiplier;
  getCacheMultiplier = txMethods.getCacheMultiplier;

  const transactionMethods = createTransactionMethods(mongoose, {
    getMultiplier: txMethods.getMultiplier,
    getCacheMultiplier: txMethods.getCacheMultiplier,
  });
  createTransaction = transactionMethods.createTransaction;
  createStructuredTransaction = transactionMethods.createStructuredTransaction;

  const spendMethods = createSpendTokensMethods(mongoose, {
    createTransaction: transactionMethods.createTransaction,
    createStructuredTransaction: transactionMethods.createStructuredTransaction,
  });
  spendTokens = spendMethods.spendTokens;
  spendStructuredTokens = spendMethods.spendStructuredTokens;

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

    expect(updatedBalance?.tokenCredits).toBeCloseTo(expectedBalance, 0);
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
    expect(updatedBalance?.tokenCredits).toBeCloseTo(initialBalance - expectedCost, 0);
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
    expect(updatedBalance?.tokenCredits).toBeCloseTo(initialBalance - expectedCost, 0);
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
    expect(updatedBalance?.tokenCredits).toBe(initialBalance);
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
      tokenUsage.promptTokens.write * (writeMultiplier ?? 0) +
      tokenUsage.promptTokens.read * (readMultiplier ?? 0);
    const expectedCompletionCost = tokenUsage.completionTokens * completionMultiplier;
    const expectedTotalCost = expectedPromptCost + expectedCompletionCost;
    const expectedBalance = initialBalance - expectedTotalCost;

    // Assert
    expect(result?.completion?.balance).toBeLessThan(initialBalance);
    const allowedDifference = 100;
    expect(Math.abs((result?.completion?.balance ?? 0) - expectedBalance)).toBeLessThan(
      allowedDifference,
    );
    const balanceDecrease = initialBalance - (result?.completion?.balance ?? 0);
    expect(balanceDecrease).toBeCloseTo(expectedTotalCost, 0);

    const expectedPromptTokenValue = -expectedPromptCost;
    const expectedCompletionTokenValue = -expectedCompletionCost;
    expect(result?.prompt?.prompt).toBeCloseTo(expectedPromptTokenValue, 1);
    expect(result?.completion?.completion).toBe(expectedCompletionTokenValue);
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
    expect(result?.prompt?.prompt).toBeLessThan(0);
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
    expect(result?.prompt?.prompt).toBeLessThan(0);
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
    expect(result?.completion?.completion).toBeCloseTo(-50 * 15 * 1.15, 0);
  });
});

describe('NaN Handling Tests', () => {
  test('should skip transaction creation when rawAmount is NaN', async () => {
    // Arrange
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 10000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'gpt-3.5-turbo';
    const txData: TxData = {
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
    expect(balance?.tokenCredits).toBe(initialBalance);
  });
});

describe('Transactions Config Tests', () => {
  test('createTransaction should not save when transactions.enabled is false', async () => {
    // Arrange
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 10000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'gpt-3.5-turbo';
    const txData: TxData = {
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
    expect(balance?.tokenCredits).toBe(initialBalance);
  });

  test('createTransaction should save when transactions.enabled is true', async () => {
    // Arrange
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 10000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'gpt-3.5-turbo';
    const txData: TxData = {
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
    expect(result?.balance).toBeLessThan(initialBalance);
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
    const txData: TxData = {
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
    expect(result?.balance).toBeLessThan(initialBalance);
    const transactions = await Transaction.find({ user: userId });
    expect(transactions).toHaveLength(1);
  });

  test('createTransaction should save transaction but not update balance when balance is disabled but transactions enabled', async () => {
    // Arrange
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 10000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'gpt-3.5-turbo';
    const txData: TxData = {
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
    expect(balance?.tokenCredits).toBe(initialBalance);
  });

  test('createStructuredTransaction should not save when transactions.enabled is false', async () => {
    // Arrange
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 10000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'claude-3-5-sonnet';
    const txData: TxData = {
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
    expect(balance?.tokenCredits).toBe(initialBalance);
  });

  test('createStructuredTransaction should save transaction but not update balance when balance is disabled but transactions enabled', async () => {
    // Arrange
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 10000000;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'claude-3-5-sonnet';
    const txData: TxData = {
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
    expect(balance?.tokenCredits).toBe(initialBalance);
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
    expect(result?.rate).toBe(expectedRate);

    const tx = await Transaction.findOne({ user: userId });
    expect(tx?.tokenValue).toBe(-promptTokens * expectedRate);
    expect(tx?.rate).toBe(expectedRate);
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
    expect(tx?.rate).toBeDefined();
    expect(tx?.rate).toBeGreaterThan(0);
    expect(tx?.tokenValue).toBe((tx?.rawAmount ?? 0) * (tx?.rate ?? 0));
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
    expect(result?.rate).toBe(expectedRate);

    const updatedBalance = await Balance.findOne({ user: userId });
    expect(updatedBalance?.tokenCredits).toBeCloseTo(
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
    expect(updatedBalance?.tokenCredits).toBeCloseTo(initialBalance - expectedCost, 0);
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
    expect(updatedBalance?.tokenCredits).toBeCloseTo(initialBalance - expectedCost, 0);
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
    expect(updatedBalance?.tokenCredits).toBeCloseTo(initialBalance - expectedCost, 0);
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
      tokenUsage.promptTokens.write * (writeMultiplier ?? 0) +
      tokenUsage.promptTokens.read * (readMultiplier ?? 0);
    const expectedCompletionCost = tokenUsage.completionTokens * premiumCompletionRate;
    const expectedTotalCost = expectedPromptCost + expectedCompletionCost;

    const updatedBalance = await Balance.findOne({ user: userId });
    expect(totalInput).toBeGreaterThan(premiumTokenValues[model].threshold);
    expect(updatedBalance?.tokenCredits).toBeCloseTo(initialBalance - expectedTotalCost, 0);
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
      tokenUsage.promptTokens.write * (writeMultiplier ?? 0) +
      tokenUsage.promptTokens.read * (readMultiplier ?? 0);
    const expectedCompletionCost = tokenUsage.completionTokens * standardCompletionRate;
    const expectedTotalCost = expectedPromptCost + expectedCompletionCost;

    const updatedBalance = await Balance.findOne({ user: userId });
    expect(totalInput).toBeLessThanOrEqual(premiumTokenValues[model].threshold);
    expect(updatedBalance?.tokenCredits).toBeCloseTo(initialBalance - expectedTotalCost, 0);
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
    expect(updatedBalance?.tokenCredits).toBeCloseTo(initialBalance - expectedCost, 0);
  });
});
