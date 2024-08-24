const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Balance = require('./Balance');
const { spendStructuredTokens } = require('./spendTokens');
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

describe('Structured Token Spending Tests', () => {
  test('Balance should decrease when spending a large number of structured tokens', async () => {
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

    console.log('Initial Balance:', initialBalance);
    console.log('Updated Balance:', updatedBalance.tokenCredits);

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

    // Log the result from spendStructuredTokens if available
    if (result) {
      console.log('Transaction Result:', result);
    }
  });
});
