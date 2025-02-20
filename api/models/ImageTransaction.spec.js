const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { ImageTransaction, getImageTransactions } = require('./ImageTransaction');
const Balance = require('./Balance');

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

describe('ImageTransaction Tests', () => {
  test('should create a successful image transaction', async () => {
    // Arrange
    const userId = new mongoose.Types.ObjectId();
    const txData = {
      user: userId,
      prompt: 'a beautiful sunset',
      endpoint: '/v1/flux-pro',
      cost: -0.05,
      imagePath: '/path/to/image.png',
      status: 'success',
      metadata: {
        width: 1024,
        height: 768,
        steps: 40,
        seed: 12345,
        raw: false,
        safety_tolerance: 6
      }
    };

    // Act
    const transaction = await ImageTransaction.create(txData);

    // Assert
    expect(transaction.user.toString()).toBe(userId.toString());
    expect(transaction.prompt).toBe('a beautiful sunset');
    expect(transaction.cost).toBe(-0.05);
    expect(transaction.status).toBe('success');
    expect(transaction.metadata.width).toBe(1024);
  });

  test('should create an error image transaction with zero cost', async () => {
    // Arrange
    const userId = new mongoose.Types.ObjectId();
    const txData = {
      user: userId,
      prompt: 'a beautiful sunset',
      endpoint: '/v1/flux-pro',
      cost: 0,
      imagePath: '',
      status: 'error',
      error: 'API unavailable',
      metadata: {
        width: 1024,
        height: 768,
        steps: 40
      }
    };

    // Act
    const transaction = await ImageTransaction.create(txData);

    // Assert
    expect(transaction.status).toBe('error');
    expect(transaction.error).toBe('API unavailable');
    expect(transaction.cost).toBe(0);
  });

  test('should reject successful transaction with zero cost', async () => {
    const userId = new mongoose.Types.ObjectId();
    const txData = {
      user: userId,
      prompt: 'test prompt',
      endpoint: '/v1/flux-pro',
      cost: 0,
      imagePath: '/path/to/image.png',
      status: 'success'
    };

    await expect(ImageTransaction.create(txData)).rejects.toThrow('Invalid cost value');
  });

  test('should reject transaction with NaN cost', async () => {
    const userId = new mongoose.Types.ObjectId();
    const txData = {
      user: userId,
      prompt: 'test prompt',
      endpoint: '/v1/flux-pro',
      cost: NaN,
      imagePath: '/path/to/image.png',
      status: 'success'
    };

    await expect(ImageTransaction.create(txData)).rejects.toThrow('Invalid cost value');
  });

  test('should create a finetuned image transaction', async () => {
    const userId = new mongoose.Types.ObjectId();
    const txData = {
      user: userId,
      prompt: 'in the style of van gogh',
      endpoint: '/v1/flux-pro-1.1-ultra-finetuned',
      cost: -0.07,
      imagePath: '/path/to/finetuned.png',
      status: 'success',
      metadata: {
        width: 1024,
        height: 768,
        steps: 40,
        finetune_id: 'ft-123',
        finetune_strength: 0.8,
        guidance: 2.5
      }
    };

    const transaction = await ImageTransaction.create(txData);

    expect(transaction.metadata.finetune_id).toBe('ft-123');
    expect(transaction.metadata.finetune_strength).toBe(0.8);
    expect(transaction.cost).toBe(-0.07);
  });

  test('should retrieve image transactions by user', async () => {
    // Arrange
    const userId = new mongoose.Types.ObjectId();
    const txData1 = {
      user: userId,
      prompt: 'first image',
      endpoint: '/v1/flux-pro',
      cost: -0.05,
      imagePath: '/path/1.png',
      status: 'success'
    };
    const txData2 = {
      user: userId,
      prompt: 'second image',
      endpoint: '/v1/flux-pro',
      cost: -0.05,
      imagePath: '/path/2.png',
      status: 'success'
    };

    await ImageTransaction.create(txData1);
    await ImageTransaction.create(txData2);

    // Act
    const transactions = await getImageTransactions({ user: userId });

    // Assert
    expect(transactions).toHaveLength(2);
    expect(transactions[0].prompt).toBe('first image');
    expect(transactions[1].prompt).toBe('second image');
  });

  test('should handle invalid user ID', async () => {
    const txData = {
      user: 'invalid-id',
      prompt: 'test prompt',
      endpoint: '/v1/flux-pro',
      cost: -0.05,
      imagePath: '/path/to/image.png',
      status: 'success'
    };

    await expect(ImageTransaction.create(txData)).rejects.toThrow();
  });

  test('should validate required fields', async () => {
    const userId = new mongoose.Types.ObjectId();
    const incompleteTxData = {
      user: userId,
      // missing required fields
    };

    await expect(ImageTransaction.create(incompleteTxData)).rejects.toThrow();
  });

  test('should validate endpoint enum values', async () => {
    const userId = new mongoose.Types.ObjectId();
    const txData = {
      user: userId,
      prompt: 'test prompt',
      endpoint: '/invalid/endpoint', // invalid endpoint
      cost: -0.05,
      imagePath: '/path/to/image.png',
      status: 'success'
    };

    await expect(ImageTransaction.create(txData)).rejects.toThrow();
  });
});

describe('ImageTransaction Model', () => {
  const mockUserId = new mongoose.Types.ObjectId();
  const validTransaction = {
    user: mockUserId,
    prompt: 'test prompt',
    endpoint: '/v1/flux-pro',
    cost: -0.05,
    imagePath: '/path/to/image.png',
    status: 'success',
    metadata: {
      width: 512,
      height: 512,
      steps: 30
    }
  };

  beforeEach(() => {
    // Reset env variable before each test
    process.env.TRACK_IMAGE_TRANSACTIONS = 'true';
  });

  describe('with tracking enabled', () => {
    test('creates a successful transaction', async () => {
      const transaction = await ImageTransaction.create(validTransaction);
      expect(transaction.prompt).toBe(validTransaction.prompt);
      expect(transaction.cost).toBe(validTransaction.cost);
      expect(transaction.status).toBe('success');
    });

    test('creates an error transaction with zero cost', async () => {
      const errorTransaction = {
        ...validTransaction,
        status: 'error',
        cost: 0,
        error: 'Test error message'
      };
      const transaction = await ImageTransaction.create(errorTransaction);
      expect(transaction.status).toBe('error');
      expect(transaction.cost).toBe(0);
      expect(transaction.error).toBe('Test error message');
    });

    test('retrieves transactions', async () => {
      await ImageTransaction.create(validTransaction);
      const transactions = await getImageTransactions({ user: mockUserId });
      expect(transactions.length).toBeGreaterThan(0);
      expect(transactions[0].prompt).toBe(validTransaction.prompt);
    });
  });

  describe('with tracking disabled', () => {
    beforeEach(() => {
      process.env.TRACK_IMAGE_TRANSACTIONS = 'false';
    });

    test('returns null when creating transaction', async () => {
      const transaction = await ImageTransaction.create(validTransaction);
      expect(transaction).toBeNull();
    });

    test('returns empty array when retrieving transactions', async () => {
      const transactions = await getImageTransactions({ user: mockUserId });
      expect(transactions).toEqual([]);
    });
  });

  describe('validation', () => {
    test('rejects invalid cost for success transaction', async () => {
      const invalidTransaction = {
        ...validTransaction,
        cost: 0
      };
      await expect(ImageTransaction.create(invalidTransaction))
        .rejects
        .toThrow('Invalid cost value for image transaction');
    });

    test('requires all mandatory fields', async () => {
      const incompleteTransaction = {
        user: mockUserId,
        prompt: 'test'
      };
      await expect(ImageTransaction.create(incompleteTransaction))
        .rejects
        .toThrow();
    });

    test('validates endpoint enum values', async () => {
      const invalidEndpoint = {
        ...validTransaction,
        endpoint: 'invalid-endpoint'
      };
      await expect(ImageTransaction.create(invalidEndpoint))
        .rejects
        .toThrow();
    });
  });
}); 