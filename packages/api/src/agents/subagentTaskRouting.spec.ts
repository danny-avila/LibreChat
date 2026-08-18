import type {
  SubagentTaskControlCommand,
  SubagentTaskControlResult,
  SubagentTaskSnapshot,
} from '@librechat/agents';
import type { Cluster, Redis } from 'ioredis';
import {
  RedisSubagentTaskControlTransport,
  SubagentTaskOwnerUnavailableError,
} from './subagentTaskRouting';

type MessageListener = (channel: string, message: string) => void;

class FakeRedisBus {
  readonly hashes = new Map<string, Map<string, string>>();
  readonly clients = new Set<FakeRedisClient>();
  dropNextResponse = false;
  registrationFailures = 0;

  createClient(): FakeRedisClient {
    const client = new FakeRedisClient(this);
    this.clients.add(client);
    return client;
  }

  publish(channel: string, message: string): number {
    if (this.dropNextResponse && channel.endsWith(':requester')) {
      this.dropNextResponse = false;
      return 1;
    }
    let delivered = 0;
    for (const client of this.clients) {
      if (!client.disconnected && client.channels.has(channel)) {
        delivered += 1;
        for (const listener of client.listeners) {
          queueMicrotask(() => listener(channel, message));
        }
      }
    }
    return delivered;
  }
}

class FakeRedisClient {
  readonly channels = new Set<string>();
  readonly listeners = new Set<MessageListener>();
  disconnected = false;

  constructor(private readonly bus: FakeRedisBus) {}

  on(event: string, listener: MessageListener): this {
    if (event === 'message') {
      this.listeners.add(listener);
    }
    return this;
  }

  off(event: string, listener: MessageListener): this {
    if (event === 'message') {
      this.listeners.delete(listener);
    }
    return this;
  }

  async subscribe(channel: string): Promise<number> {
    this.channels.add(channel);
    return this.channels.size;
  }

  async unsubscribe(channel: string): Promise<number> {
    this.channels.delete(channel);
    return this.channels.size;
  }

  disconnect(): void {
    this.disconnected = true;
    this.channels.clear();
  }

  async publish(channel: string, message: string): Promise<number> {
    return this.bus.publish(channel, message);
  }

  async eval(
    _script: string,
    _keyCount: number,
    key: string,
    ...args: string[]
  ): Promise<number | string | string[] | null> {
    const hash = this.bus.hashes.get(key) ?? new Map<string, string>();
    if (args.length === 3) {
      if (this.bus.registrationFailures > 0) {
        this.bus.registrationFailures -= 1;
        throw new Error('temporary registration failure');
      }
      const [taskId, ownerId, ttlMs] = args;
      hash.set(taskId, `${Date.now() + Number(ttlMs)}|${ownerId}`);
      this.bus.hashes.set(key, hash);
      return 1;
    }
    const readOwner = (taskId: string): string | null => {
      const value = hash.get(taskId);
      const separator = value?.indexOf('|') ?? -1;
      const expiresAt = separator < 0 ? Number.NaN : Number(value?.slice(0, separator));
      if (value == null || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        hash.delete(taskId);
        return null;
      }
      return value.slice(separator + 1);
    };
    if (args.length === 1) {
      return readOwner(args[0]);
    }
    return [...hash.keys()].flatMap((taskId) => {
      const ownerId = readOwner(taskId);
      return ownerId == null ? [] : [taskId, ownerId];
    });
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.bus.hashes.get(key)?.get(field) ?? null;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return Object.fromEntries(this.bus.hashes.get(key) ?? []);
  }

  async hlen(key: string): Promise<number> {
    return this.bus.hashes.get(key)?.size ?? 0;
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    let deleted = 0;
    for (const field of fields) {
      deleted += this.bus.hashes.get(key)?.delete(field) ? 1 : 0;
    }
    return deleted;
  }
}

function asRedis(client: FakeRedisClient): Redis | Cluster {
  return client as unknown as Redis;
}

function snapshot(overrides: Partial<SubagentTaskSnapshot> = {}): SubagentTaskSnapshot {
  return {
    taskId: 'task-1',
    threadId: 'thread-1',
    subagentType: 'researcher',
    status: 'running',
    createdAt: 1,
    updatedAt: 1,
    resultAvailable: false,
    resultClaimed: false,
    pendingControls: 0,
    ...overrides,
  };
}

describe('RedisSubagentTaskControlTransport', () => {
  it('routes list, claim, and controls to the owner and deduplicates a retried command', async () => {
    const bus = new FakeRedisBus();
    const owner = new RedisSubagentTaskControlTransport(
      asRedis(bus.createClient()),
      asRedis(bus.createClient()),
      { namespace: 'test', instanceId: 'owner', requestTimeoutMs: 200, retryDelayMs: 10 },
    );
    const requester = new RedisSubagentTaskControlTransport(
      asRedis(bus.createClient()),
      asRedis(bus.createClient()),
      { namespace: 'test', instanceId: 'requester', requestTimeoutMs: 200, retryDelayMs: 10 },
    );
    const control = jest.fn(
      (_scopeId: string, _taskId: string, _command: SubagentTaskControlCommand) =>
        ({
          status: 'accepted',
          task: snapshot(),
          controlId: 'control-1',
        }) satisfies SubagentTaskControlResult,
    );
    const claim = jest.fn(() => ({ status: 'running', task: snapshot() }) as const);
    await owner.bind({ claim, control, list: () => [snapshot()] });
    await requester.bind({ claim, control, list: () => [] });
    await owner.registerTask('scope-1', 'task-1', 60_000);

    await expect(requester.hasTasks('scope-1')).resolves.toBe(true);
    await expect(requester.list('scope-1')).resolves.toEqual([snapshot()]);
    await expect(requester.claim('scope-1', 'task-1')).resolves.toMatchObject({
      status: 'running',
    });

    bus.dropNextResponse = true;
    await expect(
      requester.control('scope-1', 'task-1', {
        action: 'queue',
        message: 'Check one more source.',
      }),
    ).resolves.toMatchObject({ status: 'accepted', controlId: 'control-1' });
    expect(control).toHaveBeenCalledTimes(1);

    await Promise.all([owner.destroy(), requester.destroy()]);
  });

  it('reports a registered but unreachable task owner as unavailable', async () => {
    const bus = new FakeRedisBus();
    const owner = new RedisSubagentTaskControlTransport(
      asRedis(bus.createClient()),
      asRedis(bus.createClient()),
      { namespace: 'test', instanceId: 'owner', requestTimeoutMs: 30, retryDelayMs: 5 },
    );
    const requester = new RedisSubagentTaskControlTransport(
      asRedis(bus.createClient()),
      asRedis(bus.createClient()),
      { namespace: 'test', instanceId: 'requester', requestTimeoutMs: 30, retryDelayMs: 5 },
    );
    const handler = {
      claim: () => ({ status: 'not_found' }) as const,
      control: () => ({ status: 'not_found' }) as const,
      list: () => [],
    };
    await owner.bind(handler);
    await requester.bind(handler);
    await owner.registerTask('scope-1', 'task-1', 60_000);
    await owner.destroy();

    await expect(
      requester.control('scope-1', 'task-1', { action: 'cancel' }),
    ).rejects.toBeInstanceOf(SubagentTaskOwnerUnavailableError);
    await requester.destroy();
  });

  it('delivers the largest default task result without consuming it on the owner', async () => {
    const bus = new FakeRedisBus();
    const owner = new RedisSubagentTaskControlTransport(
      asRedis(bus.createClient()),
      asRedis(bus.createClient()),
      { namespace: 'test', instanceId: 'owner', requestTimeoutMs: 200, retryDelayMs: 10 },
    );
    const requester = new RedisSubagentTaskControlTransport(
      asRedis(bus.createClient()),
      asRedis(bus.createClient()),
      { namespace: 'test', instanceId: 'requester', requestTimeoutMs: 200, retryDelayMs: 10 },
    );
    const result = '\u0000'.repeat(100_000);
    const claim = jest.fn(() => ({
      status: 'completed' as const,
      task: snapshot({ status: 'completed', resultAvailable: true }),
      result,
    }));
    const handler = {
      claim,
      control: () => ({ status: 'not_found' }) as const,
      list: () => [snapshot({ status: 'completed', resultAvailable: true })],
    };
    await owner.bind(handler);
    await requester.bind({ ...handler, list: () => [] });
    await owner.registerTask('scope-1', 'task-1', 60_000);

    await expect(requester.claim('scope-1', 'task-1')).resolves.toMatchObject({
      status: 'completed',
      result,
    });
    expect(claim).toHaveBeenCalledTimes(1);

    await Promise.all([owner.destroy(), requester.destroy()]);
  });

  it('retries and refreshes owner registration while the local task is retained', async () => {
    const bus = new FakeRedisBus();
    bus.registrationFailures = 1;
    const owner = new RedisSubagentTaskControlTransport(
      asRedis(bus.createClient()),
      asRedis(bus.createClient()),
      { namespace: 'test', instanceId: 'owner', registrationHeartbeatMs: 5 },
    );
    const requester = new RedisSubagentTaskControlTransport(
      asRedis(bus.createClient()),
      asRedis(bus.createClient()),
      { namespace: 'test', instanceId: 'requester' },
    );
    const handler = {
      claim: () => ({ status: 'running', task: snapshot() }) as const,
      control: () => ({ status: 'not_found' }) as const,
      list: () => [snapshot()],
    };
    await owner.bind(handler);
    await requester.bind({ ...handler, list: () => [] });
    await expect(owner.registerTask('scope-1', 'task-1', 60_000)).rejects.toThrow(
      'temporary registration failure',
    );

    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (await requester.hasTasks('scope-1')) {
        break;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
    }
    await expect(requester.hasTasks('scope-1')).resolves.toBe(true);

    bus.hashes.clear();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (await requester.hasTasks('scope-1')) {
        break;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
    }
    await expect(requester.hasTasks('scope-1')).resolves.toBe(true);

    await Promise.all([owner.destroy(), requester.destroy()]);
  });

  it('expires a dead owner independently while another owner keeps the scope active', async () => {
    const bus = new FakeRedisBus();
    const deadOwner = new RedisSubagentTaskControlTransport(
      asRedis(bus.createClient()),
      asRedis(bus.createClient()),
      { namespace: 'test', instanceId: 'dead-owner', registrationHeartbeatMs: 5 },
    );
    const liveOwner = new RedisSubagentTaskControlTransport(
      asRedis(bus.createClient()),
      asRedis(bus.createClient()),
      { namespace: 'test', instanceId: 'live-owner', registrationHeartbeatMs: 5 },
    );
    const requester = new RedisSubagentTaskControlTransport(
      asRedis(bus.createClient()),
      asRedis(bus.createClient()),
      { namespace: 'test', instanceId: 'requester', requestTimeoutMs: 30, retryDelayMs: 5 },
    );
    const deadTask = snapshot({ taskId: 'dead-task' });
    const liveTask = snapshot({ taskId: 'live-task' });
    await deadOwner.bind({
      claim: () => ({ status: 'running', task: deadTask }),
      control: () => ({ status: 'not_found' }),
      list: () => [deadTask],
    });
    await liveOwner.bind({
      claim: () => ({ status: 'running', task: liveTask }),
      control: () => ({ status: 'not_found' }),
      list: () => [liveTask],
    });
    await requester.bind({
      claim: () => ({ status: 'not_found' }),
      control: () => ({ status: 'not_found' }),
      list: () => [],
    });
    await deadOwner.registerTask('scope-1', deadTask.taskId, 20);
    await liveOwner.registerTask('scope-1', liveTask.taskId, 20);
    await deadOwner.destroy();

    await new Promise<void>((resolve) => setTimeout(resolve, 35));

    await expect(requester.list('scope-1')).resolves.toEqual([liveTask]);
    await Promise.all([liveOwner.destroy(), requester.destroy()]);
  });

  it('does not prune registered tasks omitted from a capped owner response', async () => {
    const bus = new FakeRedisBus();
    const owner = new RedisSubagentTaskControlTransport(
      asRedis(bus.createClient()),
      asRedis(bus.createClient()),
      { namespace: 'test', instanceId: 'owner', requestTimeoutMs: 200, retryDelayMs: 10 },
    );
    const requester = new RedisSubagentTaskControlTransport(
      asRedis(bus.createClient()),
      asRedis(bus.createClient()),
      { namespace: 'test', instanceId: 'requester', requestTimeoutMs: 200, retryDelayMs: 10 },
    );
    const tasks = Array.from({ length: 201 }, (_, index) =>
      snapshot({ taskId: `task-${index + 1}` }),
    );
    const handler = {
      claim: (_scopeId: string, taskId: string) => ({
        status: 'running' as const,
        task: snapshot({ taskId }),
      }),
      control: () => ({ status: 'not_found' }) as const,
      list: () => tasks,
    };
    await owner.bind(handler);
    await requester.bind({ ...handler, list: () => [] });
    await Promise.all(tasks.map((task) => owner.registerTask('scope-1', task.taskId, 60_000)));

    await expect(requester.list('scope-1')).resolves.toHaveLength(200);
    await expect(requester.claim('scope-1', 'task-201')).resolves.toMatchObject({
      status: 'running',
      task: { taskId: 'task-201' },
    });

    await Promise.all([owner.destroy(), requester.destroy()]);
  });
});
