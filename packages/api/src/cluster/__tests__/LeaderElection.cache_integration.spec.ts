import { expect } from '@playwright/test';

describe('LeaderElection with Redis', () => {
  let LeaderElection: typeof import('../LeaderElection').LeaderElection;
  let instances: InstanceType<typeof import('../LeaderElection').LeaderElection>[] = [];
  let keyvRedisClient: Awaited<typeof import('~/cache/redisClients')>['keyvRedisClient'];
  let ioredisClient: Awaited<typeof import('~/cache/redisClients')>['ioredisClient'];

  beforeAll(async () => {
    // Set up environment variables for Redis
    process.env.USE_REDIS = 'true';
    process.env.REDIS_URI = process.env.REDIS_URI ?? 'redis://127.0.0.1:6379';
    process.env.REDIS_KEY_PREFIX = 'LeaderElection-IntegrationTest';

    // Import modules after setting env vars
    const leaderElectionModule = await import('../LeaderElection');
    const redisClients = await import('~/cache/redisClients');

    LeaderElection = leaderElectionModule.LeaderElection;
    keyvRedisClient = redisClients.keyvRedisClient;
    ioredisClient = redisClients.ioredisClient;

    // Ensure Redis is connected
    if (!keyvRedisClient) {
      throw new Error('Redis client is not initialized');
    }

    // Wait for connection and topology discovery to complete
    await redisClients.keyvRedisClientReady;

    // Increase max listeners to handle many instances in tests
    process.setMaxListeners(200);
  });

  afterEach(async () => {
    await Promise.all(instances.map((instance) => instance.resign()));
    instances = [];

    // Clean up: clear the leader key directly from Redis
    if (keyvRedisClient) {
      await keyvRedisClient.del(LeaderElection.LEADER_KEY);
    }
  });

  afterAll(async () => {
    // Close both Redis clients to prevent hanging
    if (keyvRedisClient?.isOpen) await keyvRedisClient.disconnect();
    if (ioredisClient?.status === 'ready') await ioredisClient.quit();
  });

  describe('Test Case 1: Simulate shutdown of the leader', () => {
    it('should elect a new leader after the current leader resigns', async () => {
      // Create 100 instances
      instances = Array.from({ length: 100 }, () => new LeaderElection());

      // Call isLeader on all instances and get leadership status
      const resultsWithInstances = await Promise.all(
        instances.map(async (instance) => ({
          instance,
          isLeader: await instance.isLeader(),
        })),
      );

      // Find leader and followers
      const leaders = resultsWithInstances.filter((r) => r.isLeader);
      const followers = resultsWithInstances.filter((r) => !r.isLeader);
      const leader = leaders[0].instance;
      const nextLeader = followers[0].instance;

      // Verify only one is leader
      expect(leaders.length).toBe(1);

      // Verify getLeaderUUID matches the leader's UUID
      expect(await LeaderElection.getLeaderUUID()).toBe(leader.UUID);

      // Leader resigns
      await leader.resign();

      // Verify getLeaderUUID returns null after resignation
      expect(await LeaderElection.getLeaderUUID()).toBeNull();

      // Next instance to call isLeader should become the new leader
      expect(await nextLeader.isLeader()).toBe(true);
    }, 30000); // 30 second timeout for 100 instances
  });

  describe('Test Case 2: Simulate crash of the leader', () => {
    it('should allow re-election after leader crashes (lease expires)', async () => {
      // Mock config with short lease duration
      const clusterConfigModule = await import('../config');
      const originalConfig = { ...clusterConfigModule.clusterConfig };

      // Override config values for this test
      Object.assign(clusterConfigModule.clusterConfig, {
        LEADER_LEASE_DURATION: 2,
        LEADER_RENEW_INTERVAL: 4,
      });

      try {
        // Create 1 instance with mocked config
        const instance = new LeaderElection();
        instances.push(instance);

        // Become leader
        expect(await instance.isLeader()).toBe(true);

        // Verify leader UUID is set
        expect(await LeaderElection.getLeaderUUID()).toBe(instance.UUID);

        // Simulate crash by clearing refresh timer
        instance.clearRefreshTimer();

        // The instance no longer considers itself leader even though it still holds the key
        expect(await LeaderElection.getLeaderUUID()).toBe(instance.UUID);
        expect(await instance.isLeader()).toBe(false);

        // Wait for lease to expire (3 seconds > 2 second lease)
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Verify leader UUID is null after lease expiration
        expect(await LeaderElection.getLeaderUUID()).toBeNull();
      } finally {
        // Restore original config values
        Object.assign(clusterConfigModule.clusterConfig, originalConfig);
      }
    }, 15000); // 15 second timeout
  });

  describe('Test Case 3: Stress testing', () => {
    it('should ensure only one instance becomes leader even when multiple instances call electSelf() at once', async () => {
      // Create 10 instances
      instances = Array.from({ length: 10 }, () => new LeaderElection());

      // Call electSelf on all instances in parallel
      const results = await Promise.all(instances.map((instance) => instance['electSelf']()));

      // Verify only one returned true
      const successCount = results.filter((success) => success).length;
      expect(successCount).toBe(1);

      // Find the winning instance
      const winnerInstance = instances.find((_, index) => results[index]);

      // Verify getLeaderUUID matches the winner's UUID
      expect(await LeaderElection.getLeaderUUID()).toBe(winnerInstance?.UUID);
    }, 15000); // 15 second timeout
  });
});

describe('LeaderElection without Redis', () => {
  let LeaderElection: typeof import('../LeaderElection').LeaderElection;
  let instances: InstanceType<typeof import('../LeaderElection').LeaderElection>[] = [];

  beforeAll(async () => {
    // Set up environment variables for non-Redis mode
    process.env.USE_REDIS = 'false';

    // Reset all modules to force re-evaluation with new env vars
    jest.resetModules();

    // Import modules after setting env vars and resetting modules
    const leaderElectionModule = await import('../LeaderElection');
    LeaderElection = leaderElectionModule.LeaderElection;
  });

  afterEach(async () => {
    await Promise.all(instances.map((instance) => instance.resign()));
    instances = [];
  });

  afterAll(() => {
    // Restore environment variables
    process.env.USE_REDIS = 'true';

    // Reset all modules to ensure next test runs get fresh imports
    jest.resetModules();
  });

  it('should allow all instances to be leaders when USE_REDIS is false', async () => {
    // Create 10 instances
    instances = Array.from({ length: 10 }, () => new LeaderElection());

    // Call isLeader on all instances
    const results = await Promise.all(instances.map((instance) => instance.isLeader()));

    // Verify all instances report themselves as leaders
    expect(results.every((isLeader) => isLeader)).toBe(true);
    expect(results.filter((isLeader) => isLeader).length).toBe(10);
  });

  it('should return null for getLeaderUUID when USE_REDIS is false', async () => {
    // Create a few instances
    instances = Array.from({ length: 3 }, () => new LeaderElection());

    // Call isLeader on all instances to make them "leaders"
    await Promise.all(instances.map((instance) => instance.isLeader()));

    // Verify getLeaderUUID returns null in non-Redis mode
    expect(await LeaderElection.getLeaderUUID()).toBeNull();
  });

  it('should allow resign() to be called without throwing errors', async () => {
    // Create multiple instances
    instances = Array.from({ length: 5 }, () => new LeaderElection());

    // Make them all leaders
    await Promise.all(instances.map((instance) => instance.isLeader()));

    // Call resign on all instances - should not throw
    await expect(
      Promise.all(instances.map((instance) => instance.resign())),
    ).resolves.not.toThrow();

    // Verify they're still leaders after resigning (since there's no shared state)
    const results = await Promise.all(instances.map((instance) => instance.isLeader()));
    expect(results.every((isLeader) => isLeader)).toBe(true);
  });
});
