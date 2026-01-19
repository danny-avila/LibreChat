/**
 * Unit tests for performSync() function in indexSync.js
 *
 * Tests use real mongoose with mocked model methods, only mocking external calls.
 */

const mongoose = require('mongoose');

// Mock only external dependencies (not internal classes/models)
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockMeiliHealth = jest.fn();
const mockMeiliIndex = jest.fn();
const mockBatchResetMeiliFlags = jest.fn();
const mockIsEnabled = jest.fn();
const mockGetLogStores = jest.fn();

// Mock external modules
jest.mock('@librechat/data-schemas', () => ({
  logger: mockLogger,
}));

jest.mock('meilisearch', () => ({
  MeiliSearch: jest.fn(() => ({
    health: mockMeiliHealth,
    index: mockMeiliIndex,
  })),
}));

jest.mock('./utils', () => ({
  batchResetMeiliFlags: mockBatchResetMeiliFlags,
}));

jest.mock('@librechat/api', () => ({
  isEnabled: mockIsEnabled,
  FlowStateManager: jest.fn(),
}));

jest.mock('~/cache', () => ({
  getLogStores: mockGetLogStores,
}));

// Set environment before module load
process.env.MEILI_HOST = 'http://localhost:7700';
process.env.MEILI_MASTER_KEY = 'test-key';
process.env.SEARCH = 'true';

describe('performSync() - syncThreshold logic', () => {
  const ORIGINAL_ENV = process.env;
  let Message;
  let Conversation;

  beforeAll(() => {
    // Create model instances once
    Message = {
      collection: { name: 'messages' },
      getSyncProgress: jest.fn(),
      syncWithMeili: jest.fn(),
      countDocuments: jest.fn(),
    };

    Conversation = {
      collection: { name: 'conversations' },
      getSyncProgress: jest.fn(),
      syncWithMeili: jest.fn(),
      countDocuments: jest.fn(),
    };

    mongoose.models.Message = Message;
    mongoose.models.Conversation = Conversation;
  });

  beforeEach(() => {
    // Reset all mocks but keep the model instances
    jest.clearAllMocks();

    // Set up environment
    process.env = { ...ORIGINAL_ENV };
    process.env.MEILI_HOST = 'http://localhost:7700';
    process.env.MEILI_MASTER_KEY = 'test-key';
    process.env.SEARCH = 'true';
    delete process.env.MEILI_NO_SYNC;

    // Mock isEnabled
    mockIsEnabled.mockImplementation((val) => val === 'true' || val === true);

    // Mock MeiliSearch client responses
    mockMeiliHealth.mockResolvedValue({ status: 'available' });
    mockMeiliIndex.mockReturnValue({
      getSettings: jest.fn().mockResolvedValue({ filterableAttributes: ['user'] }),
      updateSettings: jest.fn().mockResolvedValue({}),
      search: jest.fn().mockResolvedValue({ hits: [] }),
    });

    mockBatchResetMeiliFlags.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  test('triggers sync when unindexed messages exceed syncThreshold', async () => {
    // Arrange: 1050 unindexed messages > 1000 threshold
    Message.getSyncProgress.mockResolvedValue({
      totalProcessed: 100,
      totalDocuments: 1150, // 1050 unindexed
      isComplete: false,
    });

    Conversation.getSyncProgress.mockResolvedValue({
      totalProcessed: 50,
      totalDocuments: 50,
      isComplete: true,
    });

    Message.syncWithMeili.mockResolvedValue(undefined);

    process.env.MEILI_SYNC_THRESHOLD = '1000';

    // Act
    const indexSync = require('./indexSync');
    await indexSync();

    // Assert: No countDocuments calls
    expect(Message.countDocuments).not.toHaveBeenCalled();
    expect(Conversation.countDocuments).not.toHaveBeenCalled();

    // Assert: Message sync triggered because 1050 > 1000
    expect(Message.syncWithMeili).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[indexSync] Messages need syncing: 100/1150 indexed',
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[indexSync] Starting message sync (1050 unindexed)',
    );

    // Assert: Conversation sync NOT triggered (already complete)
    expect(Conversation.syncWithMeili).not.toHaveBeenCalled();
  });

  test('skips sync when unindexed messages are below syncThreshold', async () => {
    // Arrange: 50 unindexed messages < 1000 threshold
    Message.getSyncProgress.mockResolvedValue({
      totalProcessed: 100,
      totalDocuments: 150, // 50 unindexed
      isComplete: false,
    });

    Conversation.getSyncProgress.mockResolvedValue({
      totalProcessed: 50,
      totalDocuments: 50,
      isComplete: true,
    });

    process.env.MEILI_SYNC_THRESHOLD = '1000';

    // Act
    const indexSync = require('./indexSync');
    await indexSync();

    // Assert: No countDocuments calls
    expect(Message.countDocuments).not.toHaveBeenCalled();
    expect(Conversation.countDocuments).not.toHaveBeenCalled();

    // Assert: Message sync NOT triggered because 50 < 1000
    expect(Message.syncWithMeili).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[indexSync] Messages need syncing: 100/150 indexed',
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[indexSync] 50 messages unindexed (below threshold: 1000, skipping)',
    );

    // Assert: Conversation sync NOT triggered (already complete)
    expect(Conversation.syncWithMeili).not.toHaveBeenCalled();
  });

  test('respects syncThreshold at boundary (exactly at threshold)', async () => {
    // Arrange: 1000 unindexed messages = 1000 threshold (NOT greater than)
    Message.getSyncProgress.mockResolvedValue({
      totalProcessed: 100,
      totalDocuments: 1100, // 1000 unindexed
      isComplete: false,
    });

    Conversation.getSyncProgress.mockResolvedValue({
      totalProcessed: 0,
      totalDocuments: 0,
      isComplete: true,
    });

    process.env.MEILI_SYNC_THRESHOLD = '1000';

    // Act
    const indexSync = require('./indexSync');
    await indexSync();

    // Assert: No countDocuments calls
    expect(Message.countDocuments).not.toHaveBeenCalled();

    // Assert: Message sync NOT triggered because 1000 is NOT > 1000
    expect(Message.syncWithMeili).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[indexSync] Messages need syncing: 100/1100 indexed',
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[indexSync] 1000 messages unindexed (below threshold: 1000, skipping)',
    );
  });

  test('triggers sync when unindexed is threshold + 1', async () => {
    // Arrange: 1001 unindexed messages > 1000 threshold
    Message.getSyncProgress.mockResolvedValue({
      totalProcessed: 100,
      totalDocuments: 1101, // 1001 unindexed
      isComplete: false,
    });

    Conversation.getSyncProgress.mockResolvedValue({
      totalProcessed: 0,
      totalDocuments: 0,
      isComplete: true,
    });

    Message.syncWithMeili.mockResolvedValue(undefined);

    process.env.MEILI_SYNC_THRESHOLD = '1000';

    // Act
    const indexSync = require('./indexSync');
    await indexSync();

    // Assert: No countDocuments calls
    expect(Message.countDocuments).not.toHaveBeenCalled();

    // Assert: Message sync triggered because 1001 > 1000
    expect(Message.syncWithMeili).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[indexSync] Messages need syncing: 100/1101 indexed',
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[indexSync] Starting message sync (1001 unindexed)',
    );
  });

  test('uses totalDocuments from convoProgress for conversation sync decisions', async () => {
    // Arrange: Messages complete, conversations need sync
    Message.getSyncProgress.mockResolvedValue({
      totalProcessed: 100,
      totalDocuments: 100,
      isComplete: true,
    });

    Conversation.getSyncProgress.mockResolvedValue({
      totalProcessed: 50,
      totalDocuments: 1100, // 1050 unindexed > 1000 threshold
      isComplete: false,
    });

    Conversation.syncWithMeili.mockResolvedValue(undefined);

    process.env.MEILI_SYNC_THRESHOLD = '1000';

    // Act
    const indexSync = require('./indexSync');
    await indexSync();

    // Assert: No countDocuments calls (the optimization)
    expect(Message.countDocuments).not.toHaveBeenCalled();
    expect(Conversation.countDocuments).not.toHaveBeenCalled();

    // Assert: Only conversation sync triggered
    expect(Message.syncWithMeili).not.toHaveBeenCalled();
    expect(Conversation.syncWithMeili).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[indexSync] Conversations need syncing: 50/1100 indexed',
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[indexSync] Starting convos sync (1050 unindexed)',
    );
  });

  test('skips sync when collections are fully synced', async () => {
    // Arrange: Everything already synced
    Message.getSyncProgress.mockResolvedValue({
      totalProcessed: 100,
      totalDocuments: 100,
      isComplete: true,
    });

    Conversation.getSyncProgress.mockResolvedValue({
      totalProcessed: 50,
      totalDocuments: 50,
      isComplete: true,
    });

    // Act
    const indexSync = require('./indexSync');
    await indexSync();

    // Assert: No countDocuments calls
    expect(Message.countDocuments).not.toHaveBeenCalled();
    expect(Conversation.countDocuments).not.toHaveBeenCalled();

    // Assert: No sync triggered
    expect(Message.syncWithMeili).not.toHaveBeenCalled();
    expect(Conversation.syncWithMeili).not.toHaveBeenCalled();

    // Assert: Correct logs
    expect(mockLogger.info).toHaveBeenCalledWith('[indexSync] Messages are fully synced: 100/100');
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[indexSync] Conversations are fully synced: 50/50',
    );
  });
});
