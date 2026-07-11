import type { TPendingSteer } from 'librechat-data-provider';
import type { SteerQueueItem } from '~/stream/interfaces/IJobStore';
import {
  STEER_ENQUEUE_NOT_RUNNING,
  STEER_ENQUEUE_QUEUE_FULL,
  STEER_QUEUE_MAX_DEPTH,
} from '~/stream/interfaces/IJobStore';
import { InMemoryEventTransport } from '~/stream/implementations/InMemoryEventTransport';
import { buildPendingAction, buildToolApprovalPayload } from '~/agents/hitl/policy';
import { InMemoryJobStore } from '~/stream/implementations/InMemoryJobStore';
import { GenerationJobManagerClass } from '~/stream/GenerationJobManager';

jest.spyOn(console, 'log').mockImplementation();

describe('SteeringLifecycle via GenerationJobManager.steering (in-memory)', () => {
  let manager: GenerationJobManagerClass;

  beforeEach(() => {
    manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore: new InMemoryJobStore({ ttlAfterComplete: 60000 }),
      eventTransport: new InMemoryEventTransport(),
      isRedis: false,
      cleanupOnComplete: false,
    });
    manager.initialize();
  });

  afterEach(async () => {
    await manager.destroy();
  });

  let steerCounter = 0;
  function buildSteer(text: string, userId = 'user-1'): SteerQueueItem {
    steerCounter += 1;
    return {
      steerId: `steer-${steerCounter}`,
      text,
      userId,
      createdAt: Date.now(),
    };
  }

  describe('enqueue', () => {
    test('appends to a running job and returns the queue depth', async () => {
      const streamId = 'steer-enqueue';
      await manager.createJob(streamId, 'user-1');

      expect(await manager.steering.enqueue(streamId, buildSteer('one'))).toBe(1);
      expect(await manager.steering.enqueue(streamId, buildSteer('two'))).toBe(2);
    });

    test('rejects when the job does not exist', async () => {
      expect(await manager.steering.enqueue('nonexistent', buildSteer('x'))).toBe(
        STEER_ENQUEUE_NOT_RUNNING,
      );
    });

    test('rejects when the job is paused for human review', async () => {
      const streamId = 'steer-paused';
      await manager.createJob(streamId, 'user-1');
      const payload = buildToolApprovalPayload([
        { name: 'shell', arguments: { command: 'ls' }, tool_call_id: 'call_abc' },
      ]);
      const action = buildPendingAction(payload, {
        streamId,
        conversationId: streamId,
        runId: 'run-1',
        responseMessageId: 'msg-1',
      });
      expect(await manager.approvals.pause(streamId, action)).toBe(true);

      expect(await manager.steering.enqueue(streamId, buildSteer('late'))).toBe(
        STEER_ENQUEUE_NOT_RUNNING,
      );
    });

    test('rejects when the job is terminal', async () => {
      const streamId = 'steer-terminal';
      await manager.createJob(streamId, 'user-1');
      await manager.completeJob(streamId, 'boom');

      expect(await manager.steering.enqueue(streamId, buildSteer('late'))).toBe(
        STEER_ENQUEUE_NOT_RUNNING,
      );
    });

    test('rejects past the max queue depth', async () => {
      const streamId = 'steer-full';
      await manager.createJob(streamId, 'user-1');

      for (let i = 0; i < STEER_QUEUE_MAX_DEPTH; i++) {
        expect(await manager.steering.enqueue(streamId, buildSteer(`s${i}`))).toBe(i + 1);
      }
      expect(await manager.steering.enqueue(streamId, buildSteer('overflow'))).toBe(
        STEER_ENQUEUE_QUEUE_FULL,
      );
    });
  });

  describe('drain / peek', () => {
    test('drain takes all items FIFO and empties the queue', async () => {
      const streamId = 'steer-drain';
      await manager.createJob(streamId, 'user-1');
      await manager.steering.enqueue(streamId, buildSteer('first'));
      await manager.steering.enqueue(streamId, buildSteer('second'));

      const drained = await manager.steering.drain(streamId);
      expect(drained.map((s) => s.text)).toEqual(['first', 'second']);
      expect(await manager.steering.drain(streamId)).toEqual([]);
    });

    test('peek is non-destructive', async () => {
      const streamId = 'steer-peek';
      await manager.createJob(streamId, 'user-1');
      await manager.steering.enqueue(streamId, buildSteer('kept'));

      expect((await manager.steering.peek(streamId)).map((s) => s.text)).toEqual(['kept']);
      expect((await manager.steering.peek(streamId)).map((s) => s.text)).toEqual(['kept']);
      expect((await manager.steering.drain(streamId)).map((s) => s.text)).toEqual(['kept']);
    });
  });

  describe('terminal cleanup', () => {
    test('completeJob clears any leftover steers', async () => {
      const streamId = 'steer-complete';
      await manager.createJob(streamId, 'user-1');
      await manager.steering.enqueue(streamId, buildSteer('leftover'));

      await manager.completeJob(streamId);
      expect(await manager.steering.peek(streamId)).toEqual([]);
    });

    test('abortJob drains leftovers into pendingSteers on the result and final event', async () => {
      const streamId = 'steer-abort';
      await manager.createJob(streamId, 'user-1');
      await manager.steering.enqueue(streamId, buildSteer('unsent one'));
      await manager.steering.enqueue(streamId, buildSteer('unsent two'));

      const result = await manager.abortJob(streamId);
      expect(result.success).toBe(true);
      const steers = result.pendingSteers as TPendingSteer[];
      expect(steers.map((s) => s.text)).toEqual(['unsent one', 'unsent two']);
      expect(steers.every((s) => !('userId' in s))).toBe(true);
      expect(
        (result.finalEvent as { pendingSteers?: TPendingSteer[] }).pendingSteers?.map(
          (s) => s.text,
        ),
      ).toEqual(['unsent one', 'unsent two']);
      expect(await manager.steering.peek(streamId)).toEqual([]);
    });
  });

  describe('resume state', () => {
    test('getResumeState carries still-queued steers as a client-safe projection', async () => {
      const streamId = 'steer-resume';
      await manager.createJob(streamId, 'user-1');
      await manager.steering.enqueue(streamId, buildSteer('pending on reconnect'));

      const state = await manager.getResumeState(streamId);
      expect(state?.pendingSteers?.map((s) => s.text)).toEqual(['pending on reconnect']);
      expect(state?.pendingSteers?.every((s) => !('userId' in s))).toBe(true);
    });

    test('getResumeState omits pendingSteers when the queue is empty', async () => {
      const streamId = 'steer-resume-empty';
      await manager.createJob(streamId, 'user-1');

      const state = await manager.getResumeState(streamId);
      expect(state?.pendingSteers).toBeUndefined();
    });
  });
});
