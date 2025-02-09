const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { Transaction } = require('./Transaction');
const Balance = require('./Balance');
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
    console.log('Initial Balance:', initialBalance);

    const updatedBalance = await Balance.findOne({ user: userId });
    console.log('Updated Balance:', updatedBalance.tokenCredits);

    const promptMultiplier = getMultiplier({ model, tokenType: 'prompt' });
    const completionMultiplier = getMultiplier({ model, tokenType: 'completion' });

    const expectedPromptCost = tokenUsage.promptTokens * promptMultiplier;
    const expectedCompletionCost = tokenUsage.completionTokens * completionMultiplier;
    const expectedTotalCost = expectedPromptCost + expectedCompletionCost;
    const expectedBalance = initialBalance - expectedTotalCost;

    expect(updatedBalance.tokenCredits).toBeLessThan(initialBalance);
    expect(updatedBalance.tokenCredits).toBeCloseTo(expectedBalance, 0);

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

    const promptMultiplier = getMultiplier({ model, tokenType: 'prompt' });
    const expectedCost = tokenUsage.promptTokens * promptMultiplier;
    expect(updatedBalance.tokenCredits).toBeCloseTo(initialBalance - expectedCost, 0);

    console.log('Initial Balance:', initialBalance);
    console.log('Updated Balance:', updatedBalance.tokenCredits);
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

    const result = await spendTokens(txData, tokenUsage);

    expect(result).toBeUndefined();
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

    const updatedBalance = await Balance.findOne({ user: userId });

    const promptMultiplier = getMultiplier({ model, tokenType: 'prompt' });
    const expectedCost = 100 * promptMultiplier;
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
    console.log('Initial Balance:', initialBalance);
    console.log('Updated Balance:', result.completion.balance);
    console.log('Transaction Result:', result);

    const expectedPromptCost =
      tokenUsage.promptTokens.input * promptMultiplier +
      tokenUsage.promptTokens.write * writeMultiplier +
      tokenUsage.promptTokens.read * readMultiplier;
    const expectedCompletionCost = tokenUsage.completionTokens * completionMultiplier;
    const expectedTotalCost = expectedPromptCost + expectedCompletionCost;
    const expectedBalance = initialBalance - expectedTotalCost;

    console.log('Expected Cost:', expectedTotalCost);
    console.log('Expected Balance:', expectedBalance);

    expect(result.completion.balance).toBeLessThan(initialBalance);

    // Allow for a small difference (e.g., 100 token credits, which is $0.0001)
    const allowedDifference = 100;
    expect(Math.abs(result.completion.balance - expectedBalance)).toBeLessThan(allowedDifference);

    // Check if the decrease is approximately as expected
    const balanceDecrease = initialBalance - result.completion.balance;
    expect(balanceDecrease).toBeCloseTo(expectedTotalCost, 0);

    // Check token values
    const expectedPromptTokenValue = -(
      tokenUsage.promptTokens.input * promptMultiplier +
      tokenUsage.promptTokens.write * writeMultiplier +
      tokenUsage.promptTokens.read * readMultiplier
    );
    const expectedCompletionTokenValue = -tokenUsage.completionTokens * completionMultiplier;

    expect(result.prompt.prompt).toBeCloseTo(expectedPromptTokenValue, 1);
    expect(result.completion.completion).toBe(expectedCompletionTokenValue);

    console.log('Expected prompt tokenValue:', expectedPromptTokenValue);
    console.log('Actual prompt tokenValue:', result.prompt.prompt);
    console.log('Expected completion tokenValue:', expectedCompletionTokenValue);
    console.log('Actual completion tokenValue:', result.completion.completion);
  });

  test('should handle zero completion tokens in structured spending', async () => {
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 17613154.55;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'claude-3-5-sonnet';
    const txData = {
      user: userId,
      conversationId: 'test-convo',
      model,
      context: 'message',
    };

    const tokenUsage = {
      promptTokens: {
        input: 10,
        write: 100,
        read: 5,
      },
      completionTokens: 0,
    };

    process.env.CHECK_BALANCE = 'true';
    const result = await spendStructuredTokens(txData, tokenUsage);

    expect(result.prompt).toBeDefined();
    expect(result.completion).toBeUndefined();
    expect(result.prompt.prompt).toBeLessThan(0);
  });

  test('should handle only prompt tokens in structured spending', async () => {
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 17613154.55;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'claude-3-5-sonnet';
    const txData = {
      user: userId,
      conversationId: 'test-convo',
      model,
      context: 'message',
    };

    const tokenUsage = {
      promptTokens: {
        input: 10,
        write: 100,
        read: 5,
      },
    };

    process.env.CHECK_BALANCE = 'true';
    const result = await spendStructuredTokens(txData, tokenUsage);

    expect(result.prompt).toBeDefined();
    expect(result.completion).toBeUndefined();
    expect(result.prompt.prompt).toBeLessThan(0);
  });

  test('should handle undefined token counts in structured spending', async () => {
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 17613154.55;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'claude-3-5-sonnet';
    const txData = {
      user: userId,
      conversationId: 'test-convo',
      model,
      context: 'message',
    };

    const tokenUsage = {};

    process.env.CHECK_BALANCE = 'true';
    const result = await spendStructuredTokens(txData, tokenUsage);

    expect(result).toEqual({
      prompt: undefined,
      completion: undefined,
    });
  });

  test('should handle incomplete context for completion tokens', async () => {
    const userId = new mongoose.Types.ObjectId();
    const initialBalance = 17613154.55;
    await Balance.create({ user: userId, tokenCredits: initialBalance });

    const model = 'claude-3-5-sonnet';
    const txData = {
      user: userId,
      conversationId: 'test-convo',
      model,
      context: 'incomplete',
    };

    const tokenUsage = {
      promptTokens: {
        input: 10,
        write: 100,
        read: 5,
      },
      completionTokens: 50,
    };

    process.env.CHECK_BALANCE = 'true';
    const result = await spendStructuredTokens(txData, tokenUsage);

    expect(result.completion.completion).toBeCloseTo(-50 * 15 * 1.15, 0); // Assuming multiplier is 15 and cancelRate is 1.15
  });
});

describe('NaN Handling Tests', () => {
  test('should skip transaction creation when rawAmount is NaN', async () => {
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
    };

    const result = await Transaction.create(txData);
    expect(result).toBeUndefined();

    const balance = await Balance.findOne({ user: userId });
    expect(balance.tokenCredits).toBe(initialBalance);
  });
});
