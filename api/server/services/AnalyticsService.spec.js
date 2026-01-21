const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createModels } = require('@librechat/data-schemas');
const AnalyticsService = require('./AnalyticsService');

let mongoServer;
let User;
let Conversation;
let Message;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  // Initialize all models
  const models = createModels(mongoose);
  User = models.User;
  Conversation = models.Conversation;
  Message = models.Message;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  // Clear all collections before each test
  await User.deleteMany({});
  await Conversation.deleteMany({});
  await Message.deleteMany({});
});

describe('AnalyticsService', () => {
  describe('getUserStats', () => {
    it('should return zero users when database is empty', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const stats = await AnalyticsService.getUserStats(startDate, endDate);

      expect(stats).toEqual({
        totalUsers: 0,
        activeUsers: {
          daily: 0,
          weekly: 0,
          monthly: 0,
        },
      });
    });

    it('should count total users correctly', async () => {
      // Create test users
      await User.create([
        { username: 'user1', email: 'user1@test.com', createdAt: new Date('2024-01-15') },
        { username: 'user2', email: 'user2@test.com', createdAt: new Date('2024-01-20') },
        { username: 'user3', email: 'user3@test.com', createdAt: new Date('2024-01-25') },
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const stats = await AnalyticsService.getUserStats(startDate, endDate);

      expect(stats.totalUsers).toBe(3);
    });

    it('should count active users based on conversations', async () => {
      // Create test users
      const user1 = await User.create({
        username: 'user1',
        email: 'user1@test.com',
        createdAt: new Date('2024-01-01'),
      });
      const user2 = await User.create({
        username: 'user2',
        email: 'user2@test.com',
        createdAt: new Date('2024-01-01'),
      });
      const user3 = await User.create({
        username: 'user3',
        email: 'user3@test.com',
        createdAt: new Date('2024-01-01'),
      });

      // Create conversations for different time periods
      // User1: active in all periods
      await Conversation.create({
        conversationId: 'conv1',
        user: user1._id,
        createdAt: new Date('2024-01-30'),
      });

      // User2: active weekly and monthly
      await Conversation.create({
        conversationId: 'conv2',
        user: user2._id,
        createdAt: new Date('2024-01-25'),
      });

      // User3: active monthly only
      await Conversation.create({
        conversationId: 'conv3',
        user: user3._id,
        createdAt: new Date('2024-01-05'),
      });

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const stats = await AnalyticsService.getUserStats(startDate, endDate);

      expect(stats.totalUsers).toBe(3);
      expect(stats.activeUsers.daily).toBe(3); // All users active in the full range
      expect(stats.activeUsers.weekly).toBeGreaterThanOrEqual(1); // At least user1
      expect(stats.activeUsers.monthly).toBe(3); // All users active in 30 days
    });

    it('should throw error if start date is after end date', async () => {
      const startDate = new Date('2024-01-31');
      const endDate = new Date('2024-01-01');

      await expect(AnalyticsService.getUserStats(startDate, endDate)).rejects.toThrow(
        'Start date must be before or equal to end date',
      );
    });

    it('should handle string dates by converting them', async () => {
      const startDate = '2024-01-01';
      const endDate = '2024-01-31';

      const stats = await AnalyticsService.getUserStats(startDate, endDate);

      expect(stats).toHaveProperty('totalUsers');
      expect(stats).toHaveProperty('activeUsers');
    });
  });

  describe('validateDateRange', () => {
    it('should not throw error when start date equals end date', () => {
      const date = new Date('2024-01-15');
      expect(() => AnalyticsService.validateDateRange(date, date)).not.toThrow();
    });

    it('should not throw error when start date is before end date', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      expect(() => AnalyticsService.validateDateRange(startDate, endDate)).not.toThrow();
    });

    it('should throw error when start date is after end date', () => {
      const startDate = new Date('2024-01-31');
      const endDate = new Date('2024-01-01');
      expect(() => AnalyticsService.validateDateRange(startDate, endDate)).toThrow();
    });
  });

  describe('getNewUsersByPeriod', () => {
    it('should return empty array when no users exist', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const results = await AnalyticsService.getNewUsersByPeriod(startDate, endDate, 'daily');

      expect(results).toEqual([]);
    });

    it('should group users by day with daily granularity', async () => {
      // Create users on different days
      await User.create([
        { username: 'user1', email: 'user1@test.com', createdAt: new Date('2024-01-15T10:00:00Z') },
        { username: 'user2', email: 'user2@test.com', createdAt: new Date('2024-01-15T14:00:00Z') },
        { username: 'user3', email: 'user3@test.com', createdAt: new Date('2024-01-16T10:00:00Z') },
        { username: 'user4', email: 'user4@test.com', createdAt: new Date('2024-01-20T10:00:00Z') },
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const results = await AnalyticsService.getNewUsersByPeriod(startDate, endDate, 'daily');

      expect(results).toHaveLength(3); // 3 distinct days
      expect(results[0]).toHaveProperty('timestamp');
      expect(results[0]).toHaveProperty('value');
      
      // Find the entry for Jan 15
      const jan15Entry = results.find(r => {
        const date = new Date(r.timestamp);
        return date.getUTCDate() === 15 && date.getUTCMonth() === 0;
      });
      expect(jan15Entry.value).toBe(2); // 2 users on Jan 15
    });

    it('should group users by week with weekly granularity', async () => {
      // Create users in different weeks
      await User.create([
        { username: 'user1', email: 'user1@test.com', createdAt: new Date('2024-01-08') }, // Week 2
        { username: 'user2', email: 'user2@test.com', createdAt: new Date('2024-01-10') }, // Week 2
        { username: 'user3', email: 'user3@test.com', createdAt: new Date('2024-01-15') }, // Week 3
        { username: 'user4', email: 'user4@test.com', createdAt: new Date('2024-01-22') }, // Week 4
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const results = await AnalyticsService.getNewUsersByPeriod(startDate, endDate, 'weekly');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('timestamp');
      expect(results[0]).toHaveProperty('value');
    });

    it('should group users by month with monthly granularity', async () => {
      // Create users in different months
      await User.create([
        { username: 'user1', email: 'user1@test.com', createdAt: new Date('2024-01-15') },
        { username: 'user2', email: 'user2@test.com', createdAt: new Date('2024-01-20') },
        { username: 'user3', email: 'user3@test.com', createdAt: new Date('2024-02-10') },
        { username: 'user4', email: 'user4@test.com', createdAt: new Date('2024-02-15') },
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-02-29');

      const results = await AnalyticsService.getNewUsersByPeriod(startDate, endDate, 'monthly');

      expect(results).toHaveLength(2); // 2 distinct months
      expect(results[0].value).toBe(2); // 2 users in January
      expect(results[1].value).toBe(2); // 2 users in February
    });

    it('should return results sorted by date ascending', async () => {
      // Create users in non-chronological order
      await User.create([
        { username: 'user1', email: 'user1@test.com', createdAt: new Date('2024-01-20') },
        { username: 'user2', email: 'user2@test.com', createdAt: new Date('2024-01-10') },
        { username: 'user3', email: 'user3@test.com', createdAt: new Date('2024-01-15') },
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const results = await AnalyticsService.getNewUsersByPeriod(startDate, endDate, 'daily');

      // Verify results are sorted
      for (let i = 1; i < results.length; i++) {
        expect(new Date(results[i].timestamp).getTime()).toBeGreaterThanOrEqual(
          new Date(results[i - 1].timestamp).getTime(),
        );
      }
    });

    it('should throw error for invalid granularity', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await expect(
        AnalyticsService.getNewUsersByPeriod(startDate, endDate, 'invalid'),
      ).rejects.toThrow('Invalid granularity');
    });

    it('should throw error if start date is after end date', async () => {
      const startDate = new Date('2024-01-31');
      const endDate = new Date('2024-01-01');

      await expect(
        AnalyticsService.getNewUsersByPeriod(startDate, endDate, 'daily'),
      ).rejects.toThrow('Start date must be before or equal to end date');
    });

    it('should only include users within the date range', async () => {
      // Create users both inside and outside the range
      await User.create([
        { username: 'user1', email: 'user1@test.com', createdAt: new Date('2023-12-31') }, // Before range
        { username: 'user2', email: 'user2@test.com', createdAt: new Date('2024-01-15') }, // In range
        { username: 'user3', email: 'user3@test.com', createdAt: new Date('2024-01-20') }, // In range
        { username: 'user4', email: 'user4@test.com', createdAt: new Date('2024-02-01') }, // After range
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const results = await AnalyticsService.getNewUsersByPeriod(startDate, endDate, 'daily');

      // Sum all values to get total users in range
      const totalUsers = results.reduce((sum, item) => sum + item.value, 0);
      expect(totalUsers).toBe(2); // Only user2 and user3
    });
  });

  describe('getUserAuthMethodBreakdown', () => {
    it('should return empty object when no users exist', async () => {
      const breakdown = await AnalyticsService.getUserAuthMethodBreakdown();

      expect(breakdown).toEqual({});
    });

    it('should return breakdown with counts and percentages', async () => {
      // Create users with different providers
      await User.create([
        { username: 'user1', email: 'user1@test.com', provider: 'local' },
        { username: 'user2', email: 'user2@test.com', provider: 'local' },
        { username: 'user3', email: 'user3@test.com', provider: 'google' },
        { username: 'user4', email: 'user4@test.com', provider: 'github' },
      ]);

      const breakdown = await AnalyticsService.getUserAuthMethodBreakdown();

      expect(breakdown).toHaveProperty('local');
      expect(breakdown).toHaveProperty('google');
      expect(breakdown).toHaveProperty('github');

      expect(breakdown.local.count).toBe(2);
      expect(breakdown.local.percentage).toBe(50);

      expect(breakdown.google.count).toBe(1);
      expect(breakdown.google.percentage).toBe(25);

      expect(breakdown.github.count).toBe(1);
      expect(breakdown.github.percentage).toBe(25);
    });

    it('should calculate percentages correctly', async () => {
      // Create users with different providers
      await User.create([
        { username: 'user1', email: 'user1@test.com', provider: 'local' },
        { username: 'user2', email: 'user2@test.com', provider: 'local' },
        { username: 'user3', email: 'user3@test.com', provider: 'local' },
        { username: 'user4', email: 'user4@test.com', provider: 'google' },
      ]);

      const breakdown = await AnalyticsService.getUserAuthMethodBreakdown();

      expect(breakdown.local.percentage).toBe(75);
      expect(breakdown.google.percentage).toBe(25);

      // Verify percentages sum to 100
      const totalPercentage = Object.values(breakdown).reduce(
        (sum, item) => sum + item.percentage,
        0,
      );
      expect(totalPercentage).toBe(100);
    });

    it('should sort providers by count descending', async () => {
      // Create users with different providers
      await User.create([
        { username: 'user1', email: 'user1@test.com', provider: 'github' },
        { username: 'user2', email: 'user2@test.com', provider: 'local' },
        { username: 'user3', email: 'user3@test.com', provider: 'local' },
        { username: 'user4', email: 'user4@test.com', provider: 'local' },
        { username: 'user5', email: 'user5@test.com', provider: 'google' },
        { username: 'user6', email: 'user6@test.com', provider: 'google' },
      ]);

      const breakdown = await AnalyticsService.getUserAuthMethodBreakdown();

      const providers = Object.keys(breakdown);
      const counts = providers.map((p) => breakdown[p].count);

      // Verify counts are in descending order
      for (let i = 1; i < counts.length; i++) {
        expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
      }
    });

    it('should handle users with null or undefined provider', async () => {
      // Create users with different providers including null
      await User.create([
        { username: 'user1', email: 'user1@test.com', provider: 'local' },
        { username: 'user2', email: 'user2@test.com', provider: null },
      ]);

      const breakdown = await AnalyticsService.getUserAuthMethodBreakdown();

      expect(breakdown).toHaveProperty('local');
      expect(breakdown).toHaveProperty('unknown');
      expect(breakdown.unknown.count).toBe(1);
    });

    it('should round percentages to 2 decimal places', async () => {
      // Create users that will result in non-round percentages
      await User.create([
        { username: 'user1', email: 'user1@test.com', provider: 'local' },
        { username: 'user2', email: 'user2@test.com', provider: 'google' },
        { username: 'user3', email: 'user3@test.com', provider: 'github' },
      ]);

      const breakdown = await AnalyticsService.getUserAuthMethodBreakdown();

      // Each should be 33.33%
      Object.values(breakdown).forEach((item) => {
        // Check that percentage has at most 2 decimal places
        const decimalPlaces = (item.percentage.toString().split('.')[1] || '').length;
        expect(decimalPlaces).toBeLessThanOrEqual(2);
      });
    });
  });

  describe('getConversationStats', () => {
    it('should return zero conversations when database is empty', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const stats = await AnalyticsService.getConversationStats(startDate, endDate);

      expect(stats).toEqual({
        totalConversations: 0,
        archivedCount: 0,
        activeCount: 0,
      });
    });

    it('should count total conversations correctly', async () => {
      // Create test conversations
      await Conversation.create([
        { conversationId: 'conv1', user: 'user1', createdAt: new Date('2024-01-15') },
        { conversationId: 'conv2', user: 'user2', createdAt: new Date('2024-01-20') },
        { conversationId: 'conv3', user: 'user3', createdAt: new Date('2024-01-25') },
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const stats = await AnalyticsService.getConversationStats(startDate, endDate);

      expect(stats.totalConversations).toBe(3);
      expect(stats.activeCount).toBe(3);
      expect(stats.archivedCount).toBe(0);
    });

    it('should count archived and active conversations correctly', async () => {
      // Create test conversations with some archived
      await Conversation.create([
        { conversationId: 'conv1', user: 'user1', createdAt: new Date('2024-01-15'), isArchived: false },
        { conversationId: 'conv2', user: 'user2', createdAt: new Date('2024-01-20'), isArchived: true },
        { conversationId: 'conv3', user: 'user3', createdAt: new Date('2024-01-25'), isArchived: true },
        { conversationId: 'conv4', user: 'user4', createdAt: new Date('2024-01-28'), isArchived: false },
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const stats = await AnalyticsService.getConversationStats(startDate, endDate);

      expect(stats.totalConversations).toBe(4);
      expect(stats.archivedCount).toBe(2);
      expect(stats.activeCount).toBe(2);
    });

    it('should only count conversations within date range', async () => {
      // Create conversations both inside and outside the range
      await Conversation.create([
        { conversationId: 'conv1', user: 'user1', createdAt: new Date('2023-12-31') }, // Before range
        { conversationId: 'conv2', user: 'user2', createdAt: new Date('2024-01-15') }, // In range
        { conversationId: 'conv3', user: 'user3', createdAt: new Date('2024-01-20') }, // In range
        { conversationId: 'conv4', user: 'user4', createdAt: new Date('2024-02-01') }, // After range
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const stats = await AnalyticsService.getConversationStats(startDate, endDate);

      expect(stats.totalConversations).toBe(2);
    });

    it('should throw error if start date is after end date', async () => {
      const startDate = new Date('2024-01-31');
      const endDate = new Date('2024-01-01');

      await expect(AnalyticsService.getConversationStats(startDate, endDate)).rejects.toThrow(
        'Start date must be before or equal to end date',
      );
    });
  });

  describe('getConversationsByPeriod', () => {
    it('should return empty array when no conversations exist', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const results = await AnalyticsService.getConversationsByPeriod(startDate, endDate, 'daily');

      expect(results).toEqual([]);
    });

    it('should group conversations by day with daily granularity', async () => {
      // Create conversations on different days
      await Conversation.create([
        { conversationId: 'conv1', user: 'user1', createdAt: new Date('2024-01-15T10:00:00Z') },
        { conversationId: 'conv2', user: 'user2', createdAt: new Date('2024-01-15T14:00:00Z') },
        { conversationId: 'conv3', user: 'user3', createdAt: new Date('2024-01-16T10:00:00Z') },
        { conversationId: 'conv4', user: 'user4', createdAt: new Date('2024-01-20T10:00:00Z') },
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const results = await AnalyticsService.getConversationsByPeriod(startDate, endDate, 'daily');

      expect(results).toHaveLength(3); // 3 distinct days
      expect(results[0]).toHaveProperty('timestamp');
      expect(results[0]).toHaveProperty('value');
      
      // Find the entry for Jan 15
      const jan15Entry = results.find(r => {
        const date = new Date(r.timestamp);
        return date.getUTCDate() === 15 && date.getUTCMonth() === 0;
      });
      expect(jan15Entry.value).toBe(2); // 2 conversations on Jan 15
    });

    it('should group conversations by week with weekly granularity', async () => {
      // Create conversations in different weeks
      await Conversation.create([
        { conversationId: 'conv1', user: 'user1', createdAt: new Date('2024-01-08') }, // Week 2
        { conversationId: 'conv2', user: 'user2', createdAt: new Date('2024-01-10') }, // Week 2
        { conversationId: 'conv3', user: 'user3', createdAt: new Date('2024-01-15') }, // Week 3
        { conversationId: 'conv4', user: 'user4', createdAt: new Date('2024-01-22') }, // Week 4
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const results = await AnalyticsService.getConversationsByPeriod(startDate, endDate, 'weekly');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('timestamp');
      expect(results[0]).toHaveProperty('value');
    });

    it('should group conversations by month with monthly granularity', async () => {
      // Create conversations in different months
      await Conversation.create([
        { conversationId: 'conv1', user: 'user1', createdAt: new Date('2024-01-15') },
        { conversationId: 'conv2', user: 'user2', createdAt: new Date('2024-01-20') },
        { conversationId: 'conv3', user: 'user3', createdAt: new Date('2024-02-10') },
        { conversationId: 'conv4', user: 'user4', createdAt: new Date('2024-02-15') },
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-02-29');

      const results = await AnalyticsService.getConversationsByPeriod(startDate, endDate, 'monthly');

      expect(results).toHaveLength(2); // 2 distinct months
      expect(results[0].value).toBe(2); // 2 conversations in January
      expect(results[1].value).toBe(2); // 2 conversations in February
    });

    it('should throw error for invalid granularity', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await expect(
        AnalyticsService.getConversationsByPeriod(startDate, endDate, 'invalid'),
      ).rejects.toThrow('Invalid granularity');
    });

    it('should only include conversations within the date range', async () => {
      // Create conversations both inside and outside the range
      await Conversation.create([
        { conversationId: 'conv1', user: 'user1', createdAt: new Date('2023-12-31') }, // Before range
        { conversationId: 'conv2', user: 'user2', createdAt: new Date('2024-01-15') }, // In range
        { conversationId: 'conv3', user: 'user3', createdAt: new Date('2024-01-20') }, // In range
        { conversationId: 'conv4', user: 'user4', createdAt: new Date('2024-02-01') }, // After range
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const results = await AnalyticsService.getConversationsByPeriod(startDate, endDate, 'daily');

      // Sum all values to get total conversations in range
      const totalConversations = results.reduce((sum, item) => sum + item.value, 0);
      expect(totalConversations).toBe(2); // Only conv2 and conv3
    });
  });

  describe('getConversationsByEndpoint', () => {
    it('should return empty array when no conversations exist', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const breakdown = await AnalyticsService.getConversationsByEndpoint(startDate, endDate);

      expect(breakdown).toEqual([]);
    });

    it('should return breakdown with counts and percentages', async () => {
      // Create conversations with different endpoints
      await Conversation.create([
        { conversationId: 'conv1', user: 'user1', endpoint: 'openAI', createdAt: new Date('2024-01-15') },
        { conversationId: 'conv2', user: 'user2', endpoint: 'openAI', createdAt: new Date('2024-01-16') },
        { conversationId: 'conv3', user: 'user3', endpoint: 'anthropic', createdAt: new Date('2024-01-17') },
        { conversationId: 'conv4', user: 'user4', endpoint: 'google', createdAt: new Date('2024-01-18') },
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const breakdown = await AnalyticsService.getConversationsByEndpoint(startDate, endDate);

      expect(breakdown).toHaveLength(3);
      
      const openAIEntry = breakdown.find(b => b.endpoint === 'openAI');
      expect(openAIEntry.count).toBe(2);
      expect(openAIEntry.percentage).toBe(50);

      const anthropicEntry = breakdown.find(b => b.endpoint === 'anthropic');
      expect(anthropicEntry.count).toBe(1);
      expect(anthropicEntry.percentage).toBe(25);

      const googleEntry = breakdown.find(b => b.endpoint === 'google');
      expect(googleEntry.count).toBe(1);
      expect(googleEntry.percentage).toBe(25);
    });

    it('should calculate percentages correctly', async () => {
      // Create conversations with different endpoints
      await Conversation.create([
        { conversationId: 'conv1', user: 'user1', endpoint: 'openAI', createdAt: new Date('2024-01-15') },
        { conversationId: 'conv2', user: 'user2', endpoint: 'openAI', createdAt: new Date('2024-01-16') },
        { conversationId: 'conv3', user: 'user3', endpoint: 'openAI', createdAt: new Date('2024-01-17') },
        { conversationId: 'conv4', user: 'user4', endpoint: 'anthropic', createdAt: new Date('2024-01-18') },
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const breakdown = await AnalyticsService.getConversationsByEndpoint(startDate, endDate);

      const openAIEntry = breakdown.find(b => b.endpoint === 'openAI');
      expect(openAIEntry.percentage).toBe(75);

      const anthropicEntry = breakdown.find(b => b.endpoint === 'anthropic');
      expect(anthropicEntry.percentage).toBe(25);

      // Verify percentages sum to 100
      const totalPercentage = breakdown.reduce((sum, item) => sum + item.percentage, 0);
      expect(totalPercentage).toBe(100);
    });

    it('should sort endpoints by count descending', async () => {
      // Create conversations with different endpoints
      await Conversation.create([
        { conversationId: 'conv1', user: 'user1', endpoint: 'google', createdAt: new Date('2024-01-15') },
        { conversationId: 'conv2', user: 'user2', endpoint: 'openAI', createdAt: new Date('2024-01-16') },
        { conversationId: 'conv3', user: 'user3', endpoint: 'openAI', createdAt: new Date('2024-01-17') },
        { conversationId: 'conv4', user: 'user4', endpoint: 'openAI', createdAt: new Date('2024-01-18') },
        { conversationId: 'conv5', user: 'user5', endpoint: 'anthropic', createdAt: new Date('2024-01-19') },
        { conversationId: 'conv6', user: 'user6', endpoint: 'anthropic', createdAt: new Date('2024-01-20') },
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const breakdown = await AnalyticsService.getConversationsByEndpoint(startDate, endDate);

      // Verify counts are in descending order
      for (let i = 1; i < breakdown.length; i++) {
        expect(breakdown[i].count).toBeLessThanOrEqual(breakdown[i - 1].count);
      }
    });

    it('should handle conversations with null or undefined endpoint', async () => {
      // Create conversations with different endpoints including null
      await Conversation.create([
        { conversationId: 'conv1', user: 'user1', endpoint: 'openAI', createdAt: new Date('2024-01-15') },
        { conversationId: 'conv2', user: 'user2', endpoint: null, createdAt: new Date('2024-01-16') },
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const breakdown = await AnalyticsService.getConversationsByEndpoint(startDate, endDate);

      expect(breakdown).toHaveLength(2);
      const unknownEntry = breakdown.find(b => b.endpoint === 'unknown');
      expect(unknownEntry).toBeDefined();
      expect(unknownEntry.count).toBe(1);
    });

    it('should only include conversations within the date range', async () => {
      // Create conversations both inside and outside the range
      await Conversation.create([
        { conversationId: 'conv1', user: 'user1', endpoint: 'openAI', createdAt: new Date('2023-12-31') }, // Before range
        { conversationId: 'conv2', user: 'user2', endpoint: 'openAI', createdAt: new Date('2024-01-15') }, // In range
        { conversationId: 'conv3', user: 'user3', endpoint: 'anthropic', createdAt: new Date('2024-01-20') }, // In range
        { conversationId: 'conv4', user: 'user4', endpoint: 'openAI', createdAt: new Date('2024-02-01') }, // After range
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const breakdown = await AnalyticsService.getConversationsByEndpoint(startDate, endDate);

      // Sum all counts to get total conversations in range
      const totalConversations = breakdown.reduce((sum, item) => sum + item.count, 0);
      expect(totalConversations).toBe(2); // Only conv2 and conv3
    });
  });

  describe('getAverageMessagesPerConversation', () => {
    it('should return 0 when no conversations exist', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const avg = await AnalyticsService.getAverageMessagesPerConversation(startDate, endDate);

      expect(avg).toBe(0);
    });

    it('should calculate average correctly with multiple conversations', async () => {
      // Create conversations
      await Conversation.create([
        { conversationId: 'conv1', user: 'user1', createdAt: new Date('2024-01-15') },
        { conversationId: 'conv2', user: 'user2', createdAt: new Date('2024-01-16') },
        { conversationId: 'conv3', user: 'user3', createdAt: new Date('2024-01-17') },
      ]);

      // Create messages for conversations
      // conv1: 5 messages, conv2: 3 messages, conv3: 4 messages
      // Average: (5 + 3 + 4) / 3 = 4
      await Message.create([
        { messageId: 'msg1', conversationId: 'conv1', user: 'user1', text: 'test' },
        { messageId: 'msg2', conversationId: 'conv1', user: 'user1', text: 'test' },
        { messageId: 'msg3', conversationId: 'conv1', user: 'user1', text: 'test' },
        { messageId: 'msg4', conversationId: 'conv1', user: 'user1', text: 'test' },
        { messageId: 'msg5', conversationId: 'conv1', user: 'user1', text: 'test' },
        { messageId: 'msg6', conversationId: 'conv2', user: 'user2', text: 'test' },
        { messageId: 'msg7', conversationId: 'conv2', user: 'user2', text: 'test' },
        { messageId: 'msg8', conversationId: 'conv2', user: 'user2', text: 'test' },
        { messageId: 'msg9', conversationId: 'conv3', user: 'user3', text: 'test' },
        { messageId: 'msg10', conversationId: 'conv3', user: 'user3', text: 'test' },
        { messageId: 'msg11', conversationId: 'conv3', user: 'user3', text: 'test' },
        { messageId: 'msg12', conversationId: 'conv3', user: 'user3', text: 'test' },
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const avg = await AnalyticsService.getAverageMessagesPerConversation(startDate, endDate);

      expect(avg).toBe(4);
    });

    it('should handle conversations with no messages', async () => {
      // Create conversations without messages
      await Conversation.create([
        { conversationId: 'conv1', user: 'user1', createdAt: new Date('2024-01-15') },
        { conversationId: 'conv2', user: 'user2', createdAt: new Date('2024-01-16') },
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const avg = await AnalyticsService.getAverageMessagesPerConversation(startDate, endDate);

      expect(avg).toBe(0);
    });

    it('should only include conversations within the date range', async () => {
      // Create conversations both inside and outside the range
      await Conversation.create([
        { conversationId: 'conv1', user: 'user1', createdAt: new Date('2023-12-31') }, // Before range
        { conversationId: 'conv2', user: 'user2', createdAt: new Date('2024-01-15') }, // In range
        { conversationId: 'conv3', user: 'user3', createdAt: new Date('2024-01-16') }, // In range
        { conversationId: 'conv4', user: 'user4', createdAt: new Date('2024-02-01') }, // After range
      ]);

      // Create messages for all conversations
      await Message.create([
        { messageId: 'msg1', conversationId: 'conv1', user: 'user1', text: 'test' },
        { messageId: 'msg2', conversationId: 'conv1', user: 'user1', text: 'test' },
        { messageId: 'msg3', conversationId: 'conv2', user: 'user2', text: 'test' },
        { messageId: 'msg4', conversationId: 'conv2', user: 'user2', text: 'test' },
        { messageId: 'msg5', conversationId: 'conv2', user: 'user2', text: 'test' },
        { messageId: 'msg6', conversationId: 'conv3', user: 'user3', text: 'test' },
        { messageId: 'msg7', conversationId: 'conv4', user: 'user4', text: 'test' },
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const avg = await AnalyticsService.getAverageMessagesPerConversation(startDate, endDate);

      // Only conv2 (3 messages) and conv3 (1 message) are in range
      // Average: (3 + 1) / 2 = 2
      expect(avg).toBe(2);
    });

    it('should round to 2 decimal places', async () => {
      // Create conversations with messages that result in non-round average
      await Conversation.create([
        { conversationId: 'conv1', user: 'user1', createdAt: new Date('2024-01-15') },
        { conversationId: 'conv2', user: 'user2', createdAt: new Date('2024-01-16') },
        { conversationId: 'conv3', user: 'user3', createdAt: new Date('2024-01-17') },
      ]);

      // conv1: 2 messages, conv2: 2 messages, conv3: 1 message
      // Average: (2 + 2 + 1) / 3 = 1.666...
      await Message.create([
        { messageId: 'msg1', conversationId: 'conv1', user: 'user1', text: 'test' },
        { messageId: 'msg2', conversationId: 'conv1', user: 'user1', text: 'test' },
        { messageId: 'msg3', conversationId: 'conv2', user: 'user2', text: 'test' },
        { messageId: 'msg4', conversationId: 'conv2', user: 'user2', text: 'test' },
        { messageId: 'msg5', conversationId: 'conv3', user: 'user3', text: 'test' },
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const avg = await AnalyticsService.getAverageMessagesPerConversation(startDate, endDate);

      expect(avg).toBe(1.67);
      
      // Check that it has at most 2 decimal places
      const decimalPlaces = (avg.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(2);
    });

    it('should throw error if start date is after end date', async () => {
      const startDate = new Date('2024-01-31');
      const endDate = new Date('2024-01-01');

      await expect(
        AnalyticsService.getAverageMessagesPerConversation(startDate, endDate),
      ).rejects.toThrow('Start date must be before or equal to end date');
    });
  });

  describe('getMessageStats', () => {
    it('should return zero messages when database is empty', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const stats = await AnalyticsService.getMessageStats(startDate, endDate);

      expect(stats).toEqual({
        totalMessages: 0,
        userGeneratedCount: 0,
        aiGeneratedCount: 0,
        errorCount: 0,
        errorRate: 0,
      });
    });

    it('should count total messages correctly', async () => {
      // Create test messages
      await Message.create([
        {
          messageId: 'msg1',
          conversationId: 'conv1',
          user: 'user1',
          text: 'Hello',
          isCreatedByUser: true,
          createdAt: new Date('2024-01-15'),
        },
        {
          messageId: 'msg2',
          conversationId: 'conv1',
          user: 'user1',
          text: 'Hi there',
          isCreatedByUser: false,
          createdAt: new Date('2024-01-15'),
        },
        {
          messageId: 'msg3',
          conversationId: 'conv2',
          user: 'user2',
          text: 'Test',
          isCreatedByUser: true,
          createdAt: new Date('2024-01-20'),
        },
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const stats = await AnalyticsService.getMessageStats(startDate, endDate);

      expect(stats.totalMessages).toBe(3);
      expect(stats.userGeneratedCount).toBe(2);
      expect(stats.aiGeneratedCount).toBe(1);
    });

    it('should count error messages correctly', async () => {
      // Create test messages with errors
      await Message.create([
        {
          messageId: 'msg1',
          conversationId: 'conv1',
          user: 'user1',
          text: 'Hello',
          isCreatedByUser: true,
          createdAt: new Date('2024-01-15'),
        },
        {
          messageId: 'msg2',
          conversationId: 'conv1',
          user: 'user1',
          text: 'Error occurred',
          isCreatedByUser: false,
          error: true,
          createdAt: new Date('2024-01-15'),
        },
        {
          messageId: 'msg3',
          conversationId: 'conv2',
          user: 'user2',
          text: 'Another error',
          isCreatedByUser: false,
          error: true,
          createdAt: new Date('2024-01-20'),
        },
        {
          messageId: 'msg4',
          conversationId: 'conv2',
          user: 'user2',
          text: 'Success',
          isCreatedByUser: false,
          createdAt: new Date('2024-01-20'),
        },
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const stats = await AnalyticsService.getMessageStats(startDate, endDate);

      expect(stats.totalMessages).toBe(4);
      expect(stats.errorCount).toBe(2);
      expect(stats.errorRate).toBe(50); // 2 errors out of 4 messages = 50%
    });

    it('should calculate error rate correctly', async () => {
      // Create 10 messages with 1 error
      const messages = [];
      for (let i = 0; i < 10; i++) {
        messages.push({
          messageId: `msg${i}`,
          conversationId: 'conv1',
          user: 'user1',
          text: `Message ${i}`,
          isCreatedByUser: i % 2 === 0,
          error: i === 5 ? true : false,
          createdAt: new Date('2024-01-15'),
        });
      }
      await Message.create(messages);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const stats = await AnalyticsService.getMessageStats(startDate, endDate);

      expect(stats.totalMessages).toBe(10);
      expect(stats.errorCount).toBe(1);
      expect(stats.errorRate).toBe(10); // 1 error out of 10 messages = 10%
    });

    it('should filter messages by date range', async () => {
      // Create messages in different date ranges
      await Message.create([
        {
          messageId: 'msg1',
          conversationId: 'conv1',
          user: 'user1',
          text: 'Before range',
          isCreatedByUser: true,
          createdAt: new Date('2023-12-31'),
        },
        {
          messageId: 'msg2',
          conversationId: 'conv1',
          user: 'user1',
          text: 'In range',
          isCreatedByUser: true,
          createdAt: new Date('2024-01-15'),
        },
        {
          messageId: 'msg3',
          conversationId: 'conv1',
          user: 'user1',
          text: 'After range',
          isCreatedByUser: true,
          createdAt: new Date('2024-02-01'),
        },
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const stats = await AnalyticsService.getMessageStats(startDate, endDate);

      expect(stats.totalMessages).toBe(1);
    });

    it('should throw error if start date is after end date', async () => {
      const startDate = new Date('2024-01-31');
      const endDate = new Date('2024-01-01');

      await expect(AnalyticsService.getMessageStats(startDate, endDate)).rejects.toThrow(
        'Start date must be before or equal to end date',
      );
    });
  });

  describe('getMessagesByPeriod', () => {
    it('should return empty array when no messages exist', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const result = await AnalyticsService.getMessagesByPeriod(startDate, endDate, 'daily');

      expect(result).toEqual([]);
    });

    it('should group messages by day', async () => {
      // Create messages on different days
      await Message.create([
        {
          messageId: 'msg1',
          conversationId: 'conv1',
          user: 'user1',
          text: 'Day 1 - Message 1',
          createdAt: new Date('2024-01-15T10:00:00Z'),
        },
        {
          messageId: 'msg2',
          conversationId: 'conv1',
          user: 'user1',
          text: 'Day 1 - Message 2',
          createdAt: new Date('2024-01-15T14:00:00Z'),
        },
        {
          messageId: 'msg3',
          conversationId: 'conv2',
          user: 'user2',
          text: 'Day 2 - Message 1',
          createdAt: new Date('2024-01-20T10:00:00Z'),
        },
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const result = await AnalyticsService.getMessagesByPeriod(startDate, endDate, 'daily');

      expect(result).toHaveLength(2);
      expect(result[0].value).toBe(2); // 2 messages on Jan 15
      expect(result[1].value).toBe(1); // 1 message on Jan 20
    });

    it('should group messages by week', async () => {
      // Create messages in different weeks
      await Message.create([
        {
          messageId: 'msg1',
          conversationId: 'conv1',
          user: 'user1',
          text: 'Week 1',
          createdAt: new Date('2024-01-08'),
        },
        {
          messageId: 'msg2',
          conversationId: 'conv1',
          user: 'user1',
          text: 'Week 1',
          createdAt: new Date('2024-01-10'),
        },
        {
          messageId: 'msg3',
          conversationId: 'conv2',
          user: 'user2',
          text: 'Week 2',
          createdAt: new Date('2024-01-15'),
        },
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const result = await AnalyticsService.getMessagesByPeriod(startDate, endDate, 'weekly');

      expect(result.length).toBeGreaterThan(0);
      // Verify that messages are grouped
      const totalMessages = result.reduce((sum, item) => sum + item.value, 0);
      expect(totalMessages).toBe(3);
    });

    it('should group messages by month', async () => {
      // Create messages in different months
      await Message.create([
        {
          messageId: 'msg1',
          conversationId: 'conv1',
          user: 'user1',
          text: 'January',
          createdAt: new Date('2024-01-15'),
        },
        {
          messageId: 'msg2',
          conversationId: 'conv1',
          user: 'user1',
          text: 'January',
          createdAt: new Date('2024-01-20'),
        },
        {
          messageId: 'msg3',
          conversationId: 'conv2',
          user: 'user2',
          text: 'February',
          createdAt: new Date('2024-02-10'),
        },
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-02-28');

      const result = await AnalyticsService.getMessagesByPeriod(startDate, endDate, 'monthly');

      expect(result).toHaveLength(2);
      expect(result[0].value).toBe(2); // 2 messages in January
      expect(result[1].value).toBe(1); // 1 message in February
    });

    it('should throw error for invalid granularity', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await expect(
        AnalyticsService.getMessagesByPeriod(startDate, endDate, 'invalid'),
      ).rejects.toThrow('Invalid granularity');
    });

    it('should throw error if start date is after end date', async () => {
      const startDate = new Date('2024-01-31');
      const endDate = new Date('2024-01-01');

      await expect(
        AnalyticsService.getMessagesByPeriod(startDate, endDate, 'daily'),
      ).rejects.toThrow('Start date must be before or equal to end date');
    });
  });
});
