import type { Redis, Cluster } from 'ioredis';

/**
 * Integration tests for GenerationJobManager.
 *
 * Tests the job manager with both in-memory and Redis backends
 * to ensure consistent behavior across deployment modes.
 *
 * Run with: USE_REDIS=true npx jest GenerationJobManager.stream_integration
 */
describe('GenerationJobManager Integration Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let ioredisClient: Redis | Cluster | null = null;
  const testPrefix = 'JobManager-Integration-Test';

  beforeAll(async () => {
    originalEnv = { ...process.env };

    // Set up test environment
    process.env.USE_REDIS = process.env.USE_REDIS ?? 'true';
    process.env.REDIS_URI = process.env.REDIS_URI ?? 'redis://127.0.0.1:6379';
    process.env.REDIS_KEY_PREFIX = testPrefix;

    jest.resetModules();

    const { ioredisClient: client } = await import('../../cache/redisClients');
    ioredisClient = client;
  });

  afterEach(async () => {
    // Clean up module state
    jest.resetModules();

    // Clean up Redis keys (delete individually for cluster compatibility)
    if (ioredisClient) {
      try {
        const keys = await ioredisClient.keys(`${testPrefix}*`);
        const streamKeys = await ioredisClient.keys(`stream:*`);
        const allKeys = [...keys, ...streamKeys];
        await Promise.all(allKeys.map((key) => ioredisClient!.del(key)));
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  afterAll(async () => {
    if (ioredisClient) {
      try {
        // Use quit() to gracefully close - waits for pending commands
        await ioredisClient.quit();
      } catch {
        // Fall back to disconnect if quit fails
        try {
          ioredisClient.disconnect();
        } catch {
          // Ignore
        }
      }
    }
    process.env = originalEnv;
  });

  describe('In-Memory Mode', () => {
    test('should create and manage jobs', async () => {
      const { GenerationJobManager } = await import('../GenerationJobManager');
      const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
      const { InMemoryEventTransport } = await import('../implementations/InMemoryEventTransport');

      // Configure with in-memory
      // cleanupOnComplete: false so we can verify completed status
      GenerationJobManager.configure({
        jobStore: new InMemoryJobStore({ ttlAfterComplete: 60000 }),
        eventTransport: new InMemoryEventTransport(),
        isRedis: false,
        cleanupOnComplete: false,
      });

      await GenerationJobManager.initialize();

      const streamId = `inmem-job-${Date.now()}`;
      const userId = 'test-user-1';

      // Create job (async)
      const job = await GenerationJobManager.createJob(streamId, userId);
      expect(job.streamId).toBe(streamId);
      expect(job.status).toBe('running');

      // Check job exists
      const hasJob = await GenerationJobManager.hasJob(streamId);
      expect(hasJob).toBe(true);

      // Get job
      const retrieved = await GenerationJobManager.getJob(streamId);
      expect(retrieved?.streamId).toBe(streamId);

      // Update job
      await GenerationJobManager.updateMetadata(streamId, { sender: 'TestAgent' });
      const updated = await GenerationJobManager.getJob(streamId);
      expect(updated?.metadata?.sender).toBe('TestAgent');

      // Complete job
      await GenerationJobManager.completeJob(streamId);
      const completed = await GenerationJobManager.getJob(streamId);
      expect(completed?.status).toBe('complete');

      await GenerationJobManager.destroy();
    });

    test('should handle event streaming', async () => {
      const { GenerationJobManager } = await import('../GenerationJobManager');
      const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
      const { InMemoryEventTransport } = await import('../implementations/InMemoryEventTransport');

      GenerationJobManager.configure({
        jobStore: new InMemoryJobStore({ ttlAfterComplete: 60000 }),
        eventTransport: new InMemoryEventTransport(),
        isRedis: false,
      });

      await GenerationJobManager.initialize();

      const streamId = `inmem-events-${Date.now()}`;
      await GenerationJobManager.createJob(streamId, 'user-1');

      const receivedChunks: unknown[] = [];

      // Subscribe to events (subscribe takes separate args, not an object)
      const subscription = await GenerationJobManager.subscribe(streamId, (event) =>
        receivedChunks.push(event),
      );
      const { unsubscribe } = subscription!;

      // Wait for first subscriber to be registered
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Emit chunks (emitChunk takes { event, data } format, now async for Redis ordering)
      await GenerationJobManager.emitChunk(streamId, {
        event: 'on_message_delta',
        data: { type: 'text', text: 'Hello' },
      });
      await GenerationJobManager.emitChunk(streamId, {
        event: 'on_message_delta',
        data: { type: 'text', text: ' world' },
      });

      // Give time for events to propagate
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify chunks were received
      expect(receivedChunks.length).toBeGreaterThan(0);

      // Complete the job (this cleans up resources)
      await GenerationJobManager.completeJob(streamId);

      unsubscribe();
      await GenerationJobManager.destroy();
    });
  });

  describe('Redis Mode', () => {
    test('should create and manage jobs via Redis', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      const { GenerationJobManager } = await import('../GenerationJobManager');
      const { createStreamServices } = await import('../createStreamServices');

      // Create Redis services
      const services = createStreamServices({
        useRedis: true,
        redisClient: ioredisClient,
      });

      expect(services.isRedis).toBe(true);

      GenerationJobManager.configure(services);
      await GenerationJobManager.initialize();

      const streamId = `redis-job-${Date.now()}`;
      const userId = 'test-user-redis';

      // Create job (async)
      const job = await GenerationJobManager.createJob(streamId, userId);
      expect(job.streamId).toBe(streamId);

      // Verify in Redis
      const hasJob = await GenerationJobManager.hasJob(streamId);
      expect(hasJob).toBe(true);

      // Update and verify
      await GenerationJobManager.updateMetadata(streamId, { sender: 'RedisAgent' });
      const updated = await GenerationJobManager.getJob(streamId);
      expect(updated?.metadata?.sender).toBe('RedisAgent');

      await GenerationJobManager.destroy();
    });

    test('should persist chunks for cross-instance resume', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      const { GenerationJobManager } = await import('../GenerationJobManager');
      const { createStreamServices } = await import('../createStreamServices');

      const services = createStreamServices({
        useRedis: true,
        redisClient: ioredisClient,
      });

      GenerationJobManager.configure(services);
      await GenerationJobManager.initialize();

      const streamId = `redis-chunks-${Date.now()}`;
      await GenerationJobManager.createJob(streamId, 'user-1');

      // Emit chunks (these should be persisted to Redis)
      // emitChunk takes { event, data } format, now async for Redis ordering
      await GenerationJobManager.emitChunk(streamId, {
        event: 'on_run_step',
        data: {
          id: 'step-1',
          runId: 'run-1',
          index: 0,
          stepDetails: { type: 'message_creation' },
        },
      });
      await GenerationJobManager.emitChunk(streamId, {
        event: 'on_message_delta',
        data: {
          id: 'step-1',
          delta: { content: { type: 'text', text: 'Persisted ' } },
        },
      });
      await GenerationJobManager.emitChunk(streamId, {
        event: 'on_message_delta',
        data: {
          id: 'step-1',
          delta: { content: { type: 'text', text: 'content' } },
        },
      });

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Simulate getting resume state (as if from different instance)
      const resumeState = await GenerationJobManager.getResumeState(streamId);

      expect(resumeState).not.toBeNull();
      expect(resumeState!.aggregatedContent?.length).toBeGreaterThan(0);

      await GenerationJobManager.destroy();
    });

    test('should handle abort and return content', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      const { GenerationJobManager } = await import('../GenerationJobManager');
      const { createStreamServices } = await import('../createStreamServices');

      const services = createStreamServices({
        useRedis: true,
        redisClient: ioredisClient,
      });

      GenerationJobManager.configure(services);
      await GenerationJobManager.initialize();

      const streamId = `redis-abort-${Date.now()}`;
      await GenerationJobManager.createJob(streamId, 'user-1');

      // Emit some content (emitChunk takes { event, data } format, now async)
      await GenerationJobManager.emitChunk(streamId, {
        event: 'on_run_step',
        data: {
          id: 'step-1',
          runId: 'run-1',
          index: 0,
          stepDetails: { type: 'message_creation' },
        },
      });
      await GenerationJobManager.emitChunk(streamId, {
        event: 'on_message_delta',
        data: {
          id: 'step-1',
          delta: { content: { type: 'text', text: 'Partial response...' } },
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Abort the job
      const abortResult = await GenerationJobManager.abortJob(streamId);

      expect(abortResult.success).toBe(true);
      expect(abortResult.content.length).toBeGreaterThan(0);

      await GenerationJobManager.destroy();
    });
  });

  describe('Cross-Mode Consistency', () => {
    test('should have consistent API between in-memory and Redis modes', async () => {
      // This test verifies that the same operations work identically
      // regardless of backend mode

      const runTestWithMode = async (isRedis: boolean) => {
        jest.resetModules();

        const { GenerationJobManager } = await import('../GenerationJobManager');

        if (isRedis && ioredisClient) {
          const { createStreamServices } = await import('../createStreamServices');
          GenerationJobManager.configure({
            ...createStreamServices({
              useRedis: true,
              redisClient: ioredisClient,
            }),
            cleanupOnComplete: false, // Keep job for verification
          });
        } else {
          const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
          const { InMemoryEventTransport } = await import(
            '../implementations/InMemoryEventTransport'
          );
          GenerationJobManager.configure({
            jobStore: new InMemoryJobStore({ ttlAfterComplete: 60000 }),
            eventTransport: new InMemoryEventTransport(),
            isRedis: false,
            cleanupOnComplete: false,
          });
        }

        await GenerationJobManager.initialize();

        const streamId = `consistency-${isRedis ? 'redis' : 'inmem'}-${Date.now()}`;

        // Test sequence
        const job = await GenerationJobManager.createJob(streamId, 'user-1');
        expect(job.streamId).toBe(streamId);
        expect(job.status).toBe('running');

        const hasJob = await GenerationJobManager.hasJob(streamId);
        expect(hasJob).toBe(true);

        await GenerationJobManager.updateMetadata(streamId, {
          sender: 'ConsistencyAgent',
          responseMessageId: 'resp-123',
        });

        const updated = await GenerationJobManager.getJob(streamId);
        expect(updated?.metadata?.sender).toBe('ConsistencyAgent');
        expect(updated?.metadata?.responseMessageId).toBe('resp-123');

        await GenerationJobManager.completeJob(streamId);

        const completed = await GenerationJobManager.getJob(streamId);
        expect(completed?.status).toBe('complete');

        await GenerationJobManager.destroy();
      };

      // Test in-memory mode
      await runTestWithMode(false);

      // Test Redis mode if available
      if (ioredisClient) {
        await runTestWithMode(true);
      }
    });
  });

  describe('Cross-Replica Support (Redis)', () => {
    /**
     * Problem: In k8s with Redis and multiple replicas, when a user sends a message:
     * 1. POST /api/agents/chat hits Replica A, creates job
     * 2. GET /api/agents/chat/stream/:streamId hits Replica B
     * 3. Replica B calls getJob() which returned undefined because runtimeState
     *    was only in Replica A's memory
     * 4. Stream endpoint returns 404
     *
     * Fix: getJob() and subscribe() now lazily create runtime state from Redis
     * when the job exists in Redis but not in local memory.
     */
    test('should NOT return 404 when stream endpoint hits different replica than job creator', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      const { RedisJobStore } = await import('../implementations/RedisJobStore');

      // === REPLICA A: Creates the job ===
      // Simulate Replica A creating the job directly in Redis
      // (In real scenario, this happens via GenerationJobManager.createJob on Replica A)
      const replicaAJobStore = new RedisJobStore(ioredisClient);
      await replicaAJobStore.initialize();

      const streamId = `cross-replica-404-test-${Date.now()}`;
      const userId = 'test-user';

      // Create job in Redis (simulates Replica A's createJob)
      await replicaAJobStore.createJob(streamId, userId);

      // === REPLICA B: Receives the stream request ===
      // Fresh GenerationJobManager that does NOT have this job in its local runtimeState
      jest.resetModules();
      const { GenerationJobManager } = await import('../GenerationJobManager');
      const { createStreamServices } = await import('../createStreamServices');

      const services = createStreamServices({
        useRedis: true,
        redisClient: ioredisClient,
      });

      GenerationJobManager.configure(services);
      await GenerationJobManager.initialize();

      // This is what the stream endpoint does:
      // const job = await GenerationJobManager.getJob(streamId);
      // if (!job) return res.status(404).json({ error: 'Stream not found' });

      const job = await GenerationJobManager.getJob(streamId);

      // BEFORE FIX: job would be undefined → 404
      // AFTER FIX: job should exist via lazy runtime state creation
      expect(job).not.toBeNull();
      expect(job).toBeDefined();
      expect(job?.streamId).toBe(streamId);

      // The stream endpoint then calls subscribe:
      // const result = await GenerationJobManager.subscribe(streamId, onChunk, onDone, onError);
      // if (!result) return res.status(404).json({ error: 'Failed to subscribe' });

      const subscription = await GenerationJobManager.subscribe(
        streamId,
        () => {}, // onChunk
        () => {}, // onDone
        () => {}, // onError
      );

      // BEFORE FIX: subscription would be null → 404
      // AFTER FIX: subscription should succeed
      expect(subscription).not.toBeNull();
      expect(subscription).toBeDefined();
      expect(typeof subscription?.unsubscribe).toBe('function');

      // Cleanup
      subscription?.unsubscribe();
      await GenerationJobManager.destroy();
      await replicaAJobStore.destroy();
    });

    test('should lazily create runtime state for jobs created on other replicas', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      // Simulate two instances - one creates job, other tries to get it
      const { createStreamServices } = await import('../createStreamServices');
      const { RedisJobStore } = await import('../implementations/RedisJobStore');

      // Instance 1: Create the job directly in Redis (simulating another replica)
      const jobStore = new RedisJobStore(ioredisClient);
      await jobStore.initialize();

      const streamId = `cross-replica-${Date.now()}`;
      const userId = 'test-user';

      // Create job data directly in jobStore (as if from another instance)
      await jobStore.createJob(streamId, userId);

      // Instance 2: Fresh GenerationJobManager that doesn't have this job in memory
      jest.resetModules();
      const { GenerationJobManager } = await import('../GenerationJobManager');

      const services = createStreamServices({
        useRedis: true,
        redisClient: ioredisClient,
      });

      GenerationJobManager.configure(services);
      await GenerationJobManager.initialize();

      // This should work even though the job was created by "another instance"
      // The manager should lazily create runtime state from Redis data
      const job = await GenerationJobManager.getJob(streamId);

      expect(job).not.toBeNull();
      expect(job?.streamId).toBe(streamId);
      expect(job?.status).toBe('running');

      // Should also be able to subscribe
      const chunks: unknown[] = [];
      const subscription = await GenerationJobManager.subscribe(streamId, (event) => {
        chunks.push(event);
      });

      expect(subscription).not.toBeNull();

      subscription?.unsubscribe();
      await GenerationJobManager.destroy();
      await jobStore.destroy();
    });

    test('should persist syncSent to Redis for cross-replica consistency', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      const { GenerationJobManager } = await import('../GenerationJobManager');
      const { createStreamServices } = await import('../createStreamServices');

      const services = createStreamServices({
        useRedis: true,
        redisClient: ioredisClient,
      });

      GenerationJobManager.configure(services);
      await GenerationJobManager.initialize();

      const streamId = `sync-sent-${Date.now()}`;
      await GenerationJobManager.createJob(streamId, 'user-1');

      // Initially syncSent should be false
      let wasSent = await GenerationJobManager.wasSyncSent(streamId);
      expect(wasSent).toBe(false);

      // Mark sync sent
      GenerationJobManager.markSyncSent(streamId);

      // Wait for async Redis update
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should now be true
      wasSent = await GenerationJobManager.wasSyncSent(streamId);
      expect(wasSent).toBe(true);

      // Verify it's actually in Redis by checking via jobStore
      const jobStore = services.jobStore;
      const jobData = await jobStore.getJob(streamId);
      expect(jobData?.syncSent).toBe(true);

      await GenerationJobManager.destroy();
    });

    test('should persist finalEvent to Redis for cross-replica access', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      const { GenerationJobManager } = await import('../GenerationJobManager');
      const { createStreamServices } = await import('../createStreamServices');

      const services = createStreamServices({
        useRedis: true,
        redisClient: ioredisClient,
      });

      GenerationJobManager.configure({
        ...services,
        cleanupOnComplete: false, // Keep job for verification
      });
      await GenerationJobManager.initialize();

      const streamId = `final-event-${Date.now()}`;
      await GenerationJobManager.createJob(streamId, 'user-1');

      // Emit done event with final data
      const finalEventData = {
        final: true,
        conversation: { conversationId: streamId },
        responseMessage: { text: 'Hello world' },
      };
      await GenerationJobManager.emitDone(streamId, finalEventData as never);

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify finalEvent is in Redis
      const jobStore = services.jobStore;
      const jobData = await jobStore.getJob(streamId);
      expect(jobData?.finalEvent).toBeDefined();

      const storedFinalEvent = JSON.parse(jobData!.finalEvent!);
      expect(storedFinalEvent.final).toBe(true);
      expect(storedFinalEvent.conversation.conversationId).toBe(streamId);

      await GenerationJobManager.destroy();
    });

    test('should emit cross-replica abort signal via Redis pub/sub', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      const { GenerationJobManager } = await import('../GenerationJobManager');
      const { createStreamServices } = await import('../createStreamServices');

      const services = createStreamServices({
        useRedis: true,
        redisClient: ioredisClient,
      });

      GenerationJobManager.configure(services);
      await GenerationJobManager.initialize();

      const streamId = `abort-signal-${Date.now()}`;
      const job = await GenerationJobManager.createJob(streamId, 'user-1');

      // Track if abort controller was signaled
      let abortSignaled = false;
      job.abortController.signal.addEventListener('abort', () => {
        abortSignaled = true;
      });

      // Wait for abort listener setup
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Abort the job - this should emit abort signal via Redis
      await GenerationJobManager.abortJob(streamId);

      // Wait for signal propagation
      await new Promise((resolve) => setTimeout(resolve, 100));

      // The local abort controller should be signaled
      expect(abortSignaled).toBe(true);
      expect(job.abortController.signal.aborted).toBe(true);

      await GenerationJobManager.destroy();
    });

    test('should handle abort for lazily-initialized cross-replica jobs', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      // This test validates that jobs created on Replica A and lazily-initialized
      // on Replica B can still receive and handle abort signals.

      const { createStreamServices } = await import('../createStreamServices');
      const { RedisJobStore } = await import('../implementations/RedisJobStore');

      // === Replica A: Create job directly in Redis ===
      const replicaAJobStore = new RedisJobStore(ioredisClient);
      await replicaAJobStore.initialize();

      const streamId = `lazy-abort-${Date.now()}`;
      await replicaAJobStore.createJob(streamId, 'user-1');

      // === Replica B: Fresh manager that lazily initializes the job ===
      jest.resetModules();
      const { GenerationJobManager } = await import('../GenerationJobManager');

      const services = createStreamServices({
        useRedis: true,
        redisClient: ioredisClient,
      });

      GenerationJobManager.configure(services);
      await GenerationJobManager.initialize();

      // Get job triggers lazy initialization of runtime state
      const job = await GenerationJobManager.getJob(streamId);
      expect(job).not.toBeNull();

      // Track abort signal
      let abortSignaled = false;
      job!.abortController.signal.addEventListener('abort', () => {
        abortSignaled = true;
      });

      // Wait for abort listener to be set up via Redis subscription
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Abort the job - this should emit abort signal via Redis pub/sub
      // The lazily-initialized runtime should receive it
      await GenerationJobManager.abortJob(streamId);

      // Wait for signal propagation
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Verify the lazily-initialized job received the abort signal
      expect(abortSignaled).toBe(true);
      expect(job!.abortController.signal.aborted).toBe(true);

      await GenerationJobManager.destroy();
      await replicaAJobStore.destroy();
    });

    test('should abort generation when abort signal received from another replica', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      // This test simulates:
      // 1. Replica A creates a job and starts generation
      // 2. Replica B receives abort request and emits abort signal
      // 3. Replica A receives signal and aborts its AbortController

      const { createStreamServices } = await import('../createStreamServices');
      const { RedisEventTransport } = await import('../implementations/RedisEventTransport');

      // Create the job on "Replica A"
      const { GenerationJobManager } = await import('../GenerationJobManager');

      const services = createStreamServices({
        useRedis: true,
        redisClient: ioredisClient,
      });

      GenerationJobManager.configure(services);
      await GenerationJobManager.initialize();

      const streamId = `cross-abort-${Date.now()}`;
      const job = await GenerationJobManager.createJob(streamId, 'user-1');

      let abortSignaled = false;
      job.abortController.signal.addEventListener('abort', () => {
        abortSignaled = true;
      });

      // Wait for abort listener to be set up via Redis subscription
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Simulate "Replica B" emitting abort signal directly via Redis
      // This is what would happen if abortJob was called on a different replica
      const subscriber2 = (ioredisClient as unknown as { duplicate: () => unknown }).duplicate();
      const replicaBTransport = new RedisEventTransport(
        ioredisClient as never,
        subscriber2 as never,
      );

      // Emit abort signal (as if from Replica B)
      replicaBTransport.emitAbort(streamId);

      // Wait for cross-replica signal propagation
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Replica A's abort controller should be signaled
      expect(abortSignaled).toBe(true);
      expect(job.abortController.signal.aborted).toBe(true);

      replicaBTransport.destroy();
      (subscriber2 as { disconnect: () => void }).disconnect();
      await GenerationJobManager.destroy();
    });

    test('should handle wasSyncSent for cross-replica scenarios', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      const { createStreamServices } = await import('../createStreamServices');
      const { RedisJobStore } = await import('../implementations/RedisJobStore');

      // Create job directly in Redis with syncSent: true
      const jobStore = new RedisJobStore(ioredisClient);
      await jobStore.initialize();

      const streamId = `cross-sync-${Date.now()}`;
      await jobStore.createJob(streamId, 'user-1');
      await jobStore.updateJob(streamId, { syncSent: true });

      // Fresh manager that doesn't have this job locally
      jest.resetModules();
      const { GenerationJobManager } = await import('../GenerationJobManager');

      const services = createStreamServices({
        useRedis: true,
        redisClient: ioredisClient,
      });

      GenerationJobManager.configure(services);
      await GenerationJobManager.initialize();

      // wasSyncSent should check Redis even without local runtime
      const wasSent = await GenerationJobManager.wasSyncSent(streamId);
      expect(wasSent).toBe(true);

      await GenerationJobManager.destroy();
      await jobStore.destroy();
    });
  });

  describe('Sequential Event Ordering (Redis)', () => {
    /**
     * These tests verify that events are delivered in strict sequential order
     * when using Redis mode. This is critical because:
     * 1. LLM streaming tokens must arrive in order for coherent output
     * 2. Tool call argument deltas must be concatenated in order
     * 3. Run step events must precede their deltas
     *
     * The fix: emitChunk now awaits Redis publish to ensure ordered delivery.
     */
    test('should maintain strict order for rapid sequential emits', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      jest.resetModules();
      const { GenerationJobManager } = await import('../GenerationJobManager');
      const { createStreamServices } = await import('../createStreamServices');

      const services = createStreamServices({
        useRedis: true,
        redisClient: ioredisClient,
      });

      GenerationJobManager.configure(services);
      await GenerationJobManager.initialize();

      const streamId = `order-rapid-${Date.now()}`;
      await GenerationJobManager.createJob(streamId, 'user-1');

      const receivedIndices: number[] = [];

      const subscription = await GenerationJobManager.subscribe(streamId, (event) => {
        const data = event as { event: string; data: { index: number } };
        if (data.event === 'test') {
          receivedIndices.push(data.data.index);
        }
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Emit 30 events rapidly - with await, they must arrive in order
      for (let i = 0; i < 30; i++) {
        await GenerationJobManager.emitChunk(streamId, {
          event: 'test',
          data: { index: i },
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify all events arrived in correct order
      expect(receivedIndices.length).toBe(30);
      for (let i = 0; i < 30; i++) {
        expect(receivedIndices[i]).toBe(i);
      }

      subscription?.unsubscribe();
      await GenerationJobManager.destroy();
    });

    test('should maintain order for tool call argument deltas', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      jest.resetModules();
      const { GenerationJobManager } = await import('../GenerationJobManager');
      const { createStreamServices } = await import('../createStreamServices');

      const services = createStreamServices({
        useRedis: true,
        redisClient: ioredisClient,
      });

      GenerationJobManager.configure(services);
      await GenerationJobManager.initialize();

      const streamId = `tool-args-${Date.now()}`;
      await GenerationJobManager.createJob(streamId, 'user-1');

      const receivedArgs: string[] = [];

      const subscription = await GenerationJobManager.subscribe(streamId, (event) => {
        const data = event as {
          event: string;
          data: { delta: { tool_calls: { args: string }[] } };
        };
        if (data.event === 'on_run_step_delta') {
          receivedArgs.push(data.data.delta.tool_calls[0].args);
        }
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Simulate streaming JSON args: {"code": "print('hello')"}
      const argChunks = ['{"', 'code', '": "', 'print', "('", 'hello', "')", '"}'];

      for (const chunk of argChunks) {
        await GenerationJobManager.emitChunk(streamId, {
          event: 'on_run_step_delta',
          data: {
            id: 'step-1',
            delta: {
              type: 'tool_calls',
              tool_calls: [{ index: 0, args: chunk }],
            },
          },
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 300));

      // This was the original bug - args would arrive scrambled without await
      expect(receivedArgs).toEqual(argChunks);
      expect(receivedArgs.join('')).toBe(`{"code": "print('hello')"}`);

      subscription?.unsubscribe();
      await GenerationJobManager.destroy();
    });

    test('should maintain order: on_run_step before on_run_step_delta', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      jest.resetModules();
      const { GenerationJobManager } = await import('../GenerationJobManager');
      const { createStreamServices } = await import('../createStreamServices');

      const services = createStreamServices({
        useRedis: true,
        redisClient: ioredisClient,
      });

      GenerationJobManager.configure(services);
      await GenerationJobManager.initialize();

      const streamId = `step-order-${Date.now()}`;
      await GenerationJobManager.createJob(streamId, 'user-1');

      const receivedEvents: string[] = [];

      const subscription = await GenerationJobManager.subscribe(streamId, (event) => {
        const data = event as { event: string };
        receivedEvents.push(data.event);
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Emit in correct order: step first, then deltas
      await GenerationJobManager.emitChunk(streamId, {
        event: 'on_run_step',
        data: { id: 'step-1', type: 'tool_calls', index: 0 },
      });

      await GenerationJobManager.emitChunk(streamId, {
        event: 'on_run_step_delta',
        data: { id: 'step-1', delta: { type: 'tool_calls', tool_calls: [{ args: '{' }] } },
      });

      await GenerationJobManager.emitChunk(streamId, {
        event: 'on_run_step_delta',
        data: { id: 'step-1', delta: { type: 'tool_calls', tool_calls: [{ args: '}' }] } },
      });

      await GenerationJobManager.emitChunk(streamId, {
        event: 'on_run_step_completed',
        data: { id: 'step-1', result: { content: '{}' } },
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify ordering: step -> deltas -> completed
      expect(receivedEvents).toEqual([
        'on_run_step',
        'on_run_step_delta',
        'on_run_step_delta',
        'on_run_step_completed',
      ]);

      subscription?.unsubscribe();
      await GenerationJobManager.destroy();
    });

    test('should not block other streams when awaiting emitChunk', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      jest.resetModules();
      const { GenerationJobManager } = await import('../GenerationJobManager');
      const { createStreamServices } = await import('../createStreamServices');

      const services = createStreamServices({
        useRedis: true,
        redisClient: ioredisClient,
      });

      GenerationJobManager.configure(services);
      await GenerationJobManager.initialize();

      const streamId1 = `concurrent-1-${Date.now()}`;
      const streamId2 = `concurrent-2-${Date.now()}`;

      await GenerationJobManager.createJob(streamId1, 'user-1');
      await GenerationJobManager.createJob(streamId2, 'user-2');

      const stream1Events: number[] = [];
      const stream2Events: number[] = [];

      const sub1 = await GenerationJobManager.subscribe(streamId1, (event) => {
        const data = event as { event: string; data: { index: number } };
        if (data.event === 'test') {
          stream1Events.push(data.data.index);
        }
      });

      const sub2 = await GenerationJobManager.subscribe(streamId2, (event) => {
        const data = event as { event: string; data: { index: number } };
        if (data.event === 'test') {
          stream2Events.push(data.data.index);
        }
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Emit to both streams concurrently (simulating two LLM responses)
      const emitPromises: Promise<void>[] = [];
      for (let i = 0; i < 10; i++) {
        emitPromises.push(
          GenerationJobManager.emitChunk(streamId1, { event: 'test', data: { index: i } }),
        );
        emitPromises.push(
          GenerationJobManager.emitChunk(streamId2, { event: 'test', data: { index: i * 100 } }),
        );
      }
      await Promise.all(emitPromises);

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Each stream should have all events, in order within their stream
      expect(stream1Events.length).toBe(10);
      expect(stream2Events.length).toBe(10);

      // Verify each stream's internal order
      for (let i = 0; i < 10; i++) {
        expect(stream1Events[i]).toBe(i);
        expect(stream2Events[i]).toBe(i * 100);
      }

      sub1?.unsubscribe();
      sub2?.unsubscribe();
      await GenerationJobManager.destroy();
    });
  });

  describe('Error Preservation for Late Subscribers', () => {
    /**
     * These tests verify the fix for the race condition where errors
     * (like INPUT_LENGTH) occur before the SSE client connects.
     *
     * Problem: Error → emitError → completeJob → job deleted → client connects → 404
     * Fix: Store error, don't delete job immediately, send error to late subscriber
     */

    test('should store error in emitError for late-connecting subscribers', async () => {
      const { GenerationJobManager } = await import('../GenerationJobManager');
      const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
      const { InMemoryEventTransport } = await import('../implementations/InMemoryEventTransport');

      GenerationJobManager.configure({
        jobStore: new InMemoryJobStore({ ttlAfterComplete: 60000 }),
        eventTransport: new InMemoryEventTransport(),
        isRedis: false,
        cleanupOnComplete: false,
      });

      await GenerationJobManager.initialize();

      const streamId = `error-store-${Date.now()}`;
      await GenerationJobManager.createJob(streamId, 'user-1');

      const errorMessage = '{ "type": "INPUT_LENGTH", "info": "234856 / 172627" }';

      // Emit error (no subscribers yet - simulates race condition)
      await GenerationJobManager.emitError(streamId, errorMessage);

      // Wait for async job store update
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify error is stored in job store
      const job = await GenerationJobManager.getJob(streamId);
      expect(job?.error).toBe(errorMessage);

      await GenerationJobManager.destroy();
    });

    test('should NOT delete job immediately when completeJob is called with error', async () => {
      const { GenerationJobManager } = await import('../GenerationJobManager');
      const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
      const { InMemoryEventTransport } = await import('../implementations/InMemoryEventTransport');

      GenerationJobManager.configure({
        jobStore: new InMemoryJobStore({ ttlAfterComplete: 60000 }),
        eventTransport: new InMemoryEventTransport(),
        isRedis: false,
        cleanupOnComplete: true, // Default behavior
      });

      await GenerationJobManager.initialize();

      const streamId = `error-no-delete-${Date.now()}`;
      await GenerationJobManager.createJob(streamId, 'user-1');

      const errorMessage = 'Test error message';

      // Complete with error
      await GenerationJobManager.completeJob(streamId, errorMessage);

      // Job should still exist (not deleted)
      const hasJob = await GenerationJobManager.hasJob(streamId);
      expect(hasJob).toBe(true);

      // Job should have error status
      const job = await GenerationJobManager.getJob(streamId);
      expect(job?.status).toBe('error');
      expect(job?.error).toBe(errorMessage);

      await GenerationJobManager.destroy();
    });

    test('should send stored error to late-connecting subscriber', async () => {
      const { GenerationJobManager } = await import('../GenerationJobManager');
      const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
      const { InMemoryEventTransport } = await import('../implementations/InMemoryEventTransport');

      GenerationJobManager.configure({
        jobStore: new InMemoryJobStore({ ttlAfterComplete: 60000 }),
        eventTransport: new InMemoryEventTransport(),
        isRedis: false,
        cleanupOnComplete: true,
      });

      await GenerationJobManager.initialize();

      const streamId = `error-late-sub-${Date.now()}`;
      await GenerationJobManager.createJob(streamId, 'user-1');

      const errorMessage = '{ "type": "INPUT_LENGTH", "info": "234856 / 172627" }';

      // Simulate race condition: error occurs before client connects
      await GenerationJobManager.emitError(streamId, errorMessage);
      await GenerationJobManager.completeJob(streamId, errorMessage);

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Now client connects (late subscriber)
      let receivedError: string | undefined;
      const subscription = await GenerationJobManager.subscribe(
        streamId,
        () => {}, // onChunk
        () => {}, // onDone
        (error) => {
          receivedError = error;
        }, // onError
      );

      expect(subscription).not.toBeNull();

      // Wait for setImmediate in subscribe to fire
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Late subscriber should receive the stored error
      expect(receivedError).toBe(errorMessage);

      subscription?.unsubscribe();
      await GenerationJobManager.destroy();
    });

    test('should prioritize error status over finalEvent in subscribe', async () => {
      const { GenerationJobManager } = await import('../GenerationJobManager');
      const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
      const { InMemoryEventTransport } = await import('../implementations/InMemoryEventTransport');

      GenerationJobManager.configure({
        jobStore: new InMemoryJobStore({ ttlAfterComplete: 60000 }),
        eventTransport: new InMemoryEventTransport(),
        isRedis: false,
        cleanupOnComplete: false,
      });

      await GenerationJobManager.initialize();

      const streamId = `error-priority-${Date.now()}`;
      await GenerationJobManager.createJob(streamId, 'user-1');

      const errorMessage = 'Error should take priority';

      // Emit error and complete with error
      await GenerationJobManager.emitError(streamId, errorMessage);
      await GenerationJobManager.completeJob(streamId, errorMessage);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Subscribe and verify error is received (not a done event)
      let receivedError: string | undefined;
      let receivedDone = false;

      const subscription = await GenerationJobManager.subscribe(
        streamId,
        () => {},
        () => {
          receivedDone = true;
        },
        (error) => {
          receivedError = error;
        },
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Error should be received, not done
      expect(receivedError).toBe(errorMessage);
      expect(receivedDone).toBe(false);

      subscription?.unsubscribe();
      await GenerationJobManager.destroy();
    });

    test('should handle error preservation in Redis mode (cross-replica)', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      const { createStreamServices } = await import('../createStreamServices');
      const { RedisJobStore } = await import('../implementations/RedisJobStore');

      // === Replica A: Creates job and emits error ===
      const replicaAJobStore = new RedisJobStore(ioredisClient);
      await replicaAJobStore.initialize();

      const streamId = `redis-error-${Date.now()}`;
      const errorMessage = '{ "type": "INPUT_LENGTH", "info": "234856 / 172627" }';

      await replicaAJobStore.createJob(streamId, 'user-1');
      await replicaAJobStore.updateJob(streamId, {
        status: 'error',
        error: errorMessage,
        completedAt: Date.now(),
      });

      // === Replica B: Fresh manager receives client connection ===
      jest.resetModules();
      const { GenerationJobManager } = await import('../GenerationJobManager');

      const services = createStreamServices({
        useRedis: true,
        redisClient: ioredisClient,
      });

      GenerationJobManager.configure({
        ...services,
        cleanupOnComplete: false,
      });
      await GenerationJobManager.initialize();

      // Client connects to Replica B (job created on Replica A)
      let receivedError: string | undefined;
      const subscription = await GenerationJobManager.subscribe(
        streamId,
        () => {},
        () => {},
        (error) => {
          receivedError = error;
        },
      );

      expect(subscription).not.toBeNull();

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Error should be loaded from Redis and sent to subscriber
      expect(receivedError).toBe(errorMessage);

      subscription?.unsubscribe();
      await GenerationJobManager.destroy();
      await replicaAJobStore.destroy();
    });

    test('error jobs should be cleaned up by periodic cleanup after TTL', async () => {
      const { GenerationJobManager } = await import('../GenerationJobManager');
      const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
      const { InMemoryEventTransport } = await import('../implementations/InMemoryEventTransport');

      // Use a very short TTL for testing
      const jobStore = new InMemoryJobStore({ ttlAfterComplete: 100 });

      GenerationJobManager.configure({
        jobStore,
        eventTransport: new InMemoryEventTransport(),
        isRedis: false,
        cleanupOnComplete: true,
      });

      await GenerationJobManager.initialize();

      const streamId = `error-cleanup-${Date.now()}`;
      await GenerationJobManager.createJob(streamId, 'user-1');

      // Complete with error
      await GenerationJobManager.completeJob(streamId, 'Test error');

      // Job should exist immediately after error
      let hasJob = await GenerationJobManager.hasJob(streamId);
      expect(hasJob).toBe(true);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Trigger cleanup
      await jobStore.cleanup();

      // Job should be cleaned up after TTL
      hasJob = await GenerationJobManager.hasJob(streamId);
      expect(hasJob).toBe(false);

      await GenerationJobManager.destroy();
    });
  });

  describe('createStreamServices Auto-Detection', () => {
    test('should auto-detect Redis when USE_REDIS is true', async () => {
      if (!ioredisClient) {
        console.warn('Redis not available, skipping test');
        return;
      }

      // Force USE_REDIS to true
      process.env.USE_REDIS = 'true';
      jest.resetModules();

      const { createStreamServices } = await import('../createStreamServices');
      const services = createStreamServices();

      // Should detect Redis
      expect(services.isRedis).toBe(true);
    });

    test('should fall back to in-memory when USE_REDIS is false', async () => {
      process.env.USE_REDIS = 'false';
      jest.resetModules();

      const { createStreamServices } = await import('../createStreamServices');
      const services = createStreamServices();

      expect(services.isRedis).toBe(false);
    });

    test('should allow forcing in-memory via config override', async () => {
      const { createStreamServices } = await import('../createStreamServices');
      const services = createStreamServices({ useRedis: false });

      expect(services.isRedis).toBe(false);
    });
  });
});
