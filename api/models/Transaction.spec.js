const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Balance = require('./Balance');
const { Transaction } = require('./Transaction');
const { spendTokens, spendStructuredTokens } = require('./spendTokens');
const { getMultiplier, getCacheMultiplier } = require('./tx');

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
    };

    const tokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
    };

    // Act
    process.env.CHECK_BALANCE = 'true';
    await spendTokens(txData, tokenUsage);

    // Assert
    const updatedBalance = await Balance.findOne({ user: userId });
    const transactions = await Transaction.find({ user: userId });

    console.log('Initial Balance:', initialBalance);
    console.log('Updated Balance:', updatedBalance.tokenCredits);
    console.log('Transactions:', transactions);

    const promptMultiplier = getMultiplier({ model, tokenType: 'prompt' });
    const completionMultiplier = getMultiplier({ model, tokenType: 'completion' });

    const expectedPromptCost = tokenUsage.promptTokens * promptMultiplier;
    const expectedCompletionCost = tokenUsage.completionTokens * completionMultiplier;
    const expectedTotalCost = expectedPromptCost + expectedCompletionCost;
    const expectedBalance = initialBalance - expectedTotalCost;

    expect(updatedBalance.tokenCredits).toBeLessThan(initialBalance);
    expect(updatedBalance.tokenCredits).toBeCloseTo(expectedBalance, 0);

    expect(transactions).toHaveLength(2);

    const promptTransaction = transactions.find((t) => t.tokenType === 'prompt');
    const completionTransaction = transactions.find((t) => t.tokenType === 'completion');

    expect(promptTransaction.rawAmount).toBe(-tokenUsage.promptTokens);
    expect(completionTransaction.rawAmount).toBe(-tokenUsage.completionTokens);

    expect(promptTransaction.tokenValue).toBeCloseTo(-expectedPromptCost, 0);
    expect(completionTransaction.tokenValue).toBeCloseTo(-expectedCompletionCost, 0);

    console.log('Expected Total Cost:', expectedTotalCost);
    console.log('Actual Balance Decrease:', initialBalance - updatedBalance.tokenCredits);
  });

  test('spendTokens should handle zero completion tokens', async () => {
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
    };

    const tokenUsage = {
      promptTokens: 100,
      completionTokens: 0,
    };

    // Act
    process.env.CHECK_BALANCE = 'true';
    await spendTokens(txData, tokenUsage);

    // Assert
    const updatedBalance = await Balance.findOne({ user: userId });
    const transactions = await Transaction.find({ user: userId });

    expect(transactions).toHaveLength(2);

    const promptTransaction = transactions.find((t) => t.tokenType === 'prompt');
    const completionTransaction = transactions.find((t) => t.tokenType === 'completion');

    expect(promptTransaction.rawAmount).toBe(-tokenUsage.promptTokens);
    expect(completionTransaction.rawAmount).toEqual(-0); // Changed to toEqual and -0

    const promptMultiplier = getMultiplier({ model, tokenType: 'prompt' });
    const expectedCost = tokenUsage.promptTokens * promptMultiplier;
    expect(updatedBalance.tokenCredits).toBeCloseTo(initialBalance - expectedCost, 0);

    console.log('Initial Balance:', initialBalance);
    console.log('Updated Balance:', updatedBalance.tokenCredits);
    console.log('Transactions:', transactions);
    console.log('Expected Cost:', expectedCost);
  });

  test('spendTokens should handle undefined token counts', async () => {
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
    };

    const tokenUsage = {};

    await spendTokens(txData, tokenUsage);

    const transactions = await Transaction.find({ user: userId });
    expect(transactions).toHaveLength(0);

    const updatedBalance = await Balance.findOne({ user: userId });
    expect(updatedBalance.tokenCredits).toBe(initialBalance);
  });

  test('spendTokens should handle only prompt tokens', async () => {
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
    };

    const tokenUsage = { promptTokens: 100 };

    await spendTokens(txData, tokenUsage);

    const transactions = await Transaction.find({ user: userId });
    expect(transactions).toHaveLength(1);
    expect(transactions[0].tokenType).toBe('prompt');
    expect(transactions[0].rawAmount).toBe(-100);

    const promptMultiplier = getMultiplier({ model, tokenType: 'prompt' });
    const expectedCost = 100 * promptMultiplier;
    const updatedBalance = await Balance.findOne({ user: userId });
    expect(updatedBalance.tokenCredits).toBeCloseTo(initialBalance - expectedCost, 0);
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
      endpointTokenConfig: null, // We'll use the default rates
    };

    const tokenUsage = {
      promptTokens: {
        input: 11,
        write: 140522,
        read: 0,
      },
      completionTokens: 5,
    };

    // Get the actual multipliers
    const promptMultiplier = getMultiplier({ model, tokenType: 'prompt' });
    const completionMultiplier = getMultiplier({ model, tokenType: 'completion' });
    const writeMultiplier = getCacheMultiplier({ model, cacheType: 'write' });
    const readMultiplier = getCacheMultiplier({ model, cacheType: 'read' });

    console.log('Multipliers:', {
      promptMultiplier,
      completionMultiplier,
      writeMultiplier,
      readMultiplier,
    });

    // Act
    process.env.CHECK_BALANCE = 'true';
    const result = await spendStructuredTokens(txData, tokenUsage);

    // Assert
    const updatedBalance = await Balance.findOne({ user: userId });
    const transactions = await Transaction.find({ user: userId });

    console.log('Initial Balance:', initialBalance);
    console.log('Updated Balance:', updatedBalance.tokenCredits);
    console.log('Transactions:', transactions);

    const expectedPromptCost =
      tokenUsage.promptTokens.input * promptMultiplier +
      tokenUsage.promptTokens.write * writeMultiplier +
      tokenUsage.promptTokens.read * readMultiplier;
    const expectedCompletionCost = tokenUsage.completionTokens * completionMultiplier;
    const expectedTotalCost = expectedPromptCost + expectedCompletionCost;
    const expectedBalance = initialBalance - expectedTotalCost;

    console.log('Expected Cost:', expectedTotalCost);
    console.log('Expected Balance:', expectedBalance);

    expect(updatedBalance.tokenCredits).toBeLessThan(initialBalance);

    // Allow for a small difference (e.g., 100 token credits, which is $0.0001)
    const allowedDifference = 100;
    expect(Math.abs(updatedBalance.tokenCredits - expectedBalance)).toBeLessThan(allowedDifference);

    // Check if the decrease is approximately as expected
    const balanceDecrease = initialBalance - updatedBalance.tokenCredits;
    expect(balanceDecrease).toBeCloseTo(expectedTotalCost, 0);

    // Check if rawAmount is set correctly for both transactions
    const expectedPromptRawAmount = -(
      tokenUsage.promptTokens.input +
      tokenUsage.promptTokens.write +
      tokenUsage.promptTokens.read
    );
    const expectedCompletionRawAmount = -tokenUsage.completionTokens;

    const promptTransaction = transactions.find((t) => t.tokenType === 'prompt');
    const completionTransaction = transactions.find((t) => t.tokenType === 'completion');

    expect(promptTransaction.rawAmount).toBe(expectedPromptRawAmount);
    expect(completionTransaction.rawAmount).toBe(expectedCompletionRawAmount);

    console.log('Expected prompt rawAmount:', expectedPromptRawAmount);
    console.log('Actual prompt rawAmount:', promptTransaction.rawAmount);
    console.log('Expected completion rawAmount:', expectedCompletionRawAmount);
    console.log('Actual completion rawAmount:', completionTransaction.rawAmount);

    // Check token values
    const expectedPromptTokenValue = -(
      tokenUsage.promptTokens.input * promptMultiplier +
      tokenUsage.promptTokens.write * writeMultiplier +
      tokenUsage.promptTokens.read * readMultiplier
    );
    const expectedCompletionTokenValue = -tokenUsage.completionTokens * completionMultiplier;

    expect(promptTransaction.tokenValue).toBeCloseTo(expectedPromptTokenValue, 1);
    expect(completionTransaction.tokenValue).toBe(expectedCompletionTokenValue);

    console.log('Expected prompt tokenValue:', expectedPromptTokenValue);
    console.log('Actual prompt tokenValue:', promptTransaction.tokenValue);
    console.log('Expected completion tokenValue:', expectedCompletionTokenValue);
    console.log('Actual completion tokenValue:', completionTransaction.tokenValue);

    // Log the result from spendStructuredTokens if available
    if (result) {
      console.log('Transaction Result:', result);
    }
  });
});
