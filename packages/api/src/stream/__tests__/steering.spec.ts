import { SteerEvents } from 'librechat-data-provider';
import type { TPendingSteer, Agents } from 'librechat-data-provider';
import type { SteerQueueItem } from '~/stream/interfaces/IJobStore';
import type { ResumeState, ServerSentEvent } from '~/types';
import {
  STEER_ENQUEUE_NOT_RUNNING,
  STEER_ENQUEUE_QUEUE_FULL,
  STEER_QUEUE_MAX_DEPTH,
} from '~/stream/interfaces/IJobStore';
import { PARKED_STEERS_TTL_MS, InMemoryJobStore } from '~/stream/implementations/InMemoryJobStore';
import { synthesizeAppliedSteerEvents, toPendingSteer } from '~/stream/SteeringLifecycle';
import { InMemoryEventTransport } from '~/stream/implementations/InMemoryEventTransport';
import { buildPendingAction, buildToolApprovalPayload } from '~/agents/hitl/policy';
import { GenerationJobManagerClass } from '~/stream/GenerationJobManager';

jest.spyOn(console, 'log').mockImplementation();

describe('SteeringLifecycle via GenerationJobManager.steering (in-memory)', () => {
  let manager: GenerationJobManagerClass;
  let jobStore: InMemoryJobStore;

  beforeEach(() => {
    manager = new GenerationJobManagerClass();
    jobStore = new InMemoryJobStore({ ttlAfterComplete: 60000 });
    manager.configure({
      jobStore,
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

    test('drain with a stale expectedCreatedAt refuses and preserves the queue', async () => {
      const streamId = 'steer-drain-stale';
      const job = await manager.createJob(streamId, 'user-1');
      await manager.steering.enqueue(streamId, buildSteer('kept for the live run'));

      expect(await manager.steering.drain(streamId, job.createdAt - 1)).toEqual([]);
      expect((await manager.steering.peek(streamId)).map((s) => s.text)).toEqual([
        'kept for the live run',
      ]);
      expect((await manager.steering.drain(streamId, job.createdAt)).map((s) => s.text)).toEqual([
        'kept for the live run',
      ]);
    });
  });

  describe('cancel', () => {
    test('removes exactly the cancelled steer and preserves queue order', async () => {
      const streamId = 'steer-cancel';
      await manager.createJob(streamId, 'user-1');
      const first = buildSteer('first');
      const second = buildSteer('second');
      await manager.steering.enqueue(streamId, first);
      await manager.steering.enqueue(streamId, second);

      expect(await manager.steering.cancel(streamId, first.steerId)).toBe(true);
      expect((await manager.steering.peek(streamId)).map((s) => s.text)).toEqual(['second']);
    });

    test('returns false when the steer already left the queue', async () => {
      const streamId = 'steer-cancel-late';
      await manager.createJob(streamId, 'user-1');
      const steer = buildSteer('drained before cancel');
      await manager.steering.enqueue(streamId, steer);
      await manager.steering.drain(streamId);

      expect(await manager.steering.cancel(streamId, steer.steerId)).toBe(false);
      expect(await manager.steering.cancel('nonexistent', steer.steerId)).toBe(false);
    });
  });

  describe('closeAndDrain', () => {
    test('takes all items and rejects later enqueues until the stream id is reused', async () => {
      const streamId = 'steer-close';
      await manager.createJob(streamId, 'user-1');
      await manager.steering.enqueue(streamId, buildSteer('drained'));

      const drained = await manager.steering.closeAndDrain(streamId);
      expect(drained.map((s) => s.text)).toEqual(['drained']);

      // The job is still `running`, but the queue is closed — a steer racing
      // finalization must be rejected, not ACKed and then silently cleared.
      expect(await manager.steering.enqueue(streamId, buildSteer('raced'))).toBe(
        STEER_ENQUEUE_NOT_RUNNING,
      );

      // A replacement job on the same stream id reopens the channel.
      await manager.createJob(streamId, 'user-1');
      expect(await manager.steering.enqueue(streamId, buildSteer('fresh'))).toBe(1);
    });

    test('createJob clears steers inherited from a replaced job', async () => {
      const streamId = 'steer-replace';
      await manager.createJob(streamId, 'user-1');
      await manager.steering.enqueue(streamId, buildSteer('old run steer'));

      await manager.createJob(streamId, 'user-1');
      expect(await manager.steering.peek(streamId)).toEqual([]);
    });

    test('a stale run cannot close or steal a replacement queue', async () => {
      const streamId = 'steer-close-stale';
      const oldJob = await manager.createJob(streamId, 'user-1');
      // Distinct createdAt: replacement in the same millisecond is
      // indistinguishable by design (the guard keys on creation time).
      await new Promise((resolve) => setTimeout(resolve, 2));
      const newJob = await manager.createJob(streamId, 'user-1');
      await manager.steering.enqueue(streamId, buildSteer('belongs to the new run'));

      // Old run finalizes late: guarded close must neither drain nor close.
      expect(await manager.steering.closeAndDrain(streamId, oldJob.createdAt)).toEqual([]);
      expect((await manager.steering.peek(streamId)).map((s) => s.text)).toEqual([
        'belongs to the new run',
      ]);
      expect(await manager.steering.enqueue(streamId, buildSteer('still open'))).toBe(2);

      expect(
        (await manager.steering.closeAndDrain(streamId, newJob.createdAt)).map((s) => s.text),
      ).toEqual(['belongs to the new run', 'still open']);
    });
  });

  describe('park / claim (no-subscriber recovery)', () => {
    const owner = { userId: 'user-1' };

    test('parked leftovers are claimable exactly once', async () => {
      const streamId = 'steer-park';
      await manager.createJob(streamId, 'user-1');
      const leftovers: TPendingSteer[] = [
        { steerId: 'p1', text: 'unreceived words', createdAt: Date.now() },
      ];
      await manager.steering.park(streamId, leftovers, owner);

      expect(await manager.steering.claim(streamId, owner)).toEqual(leftovers);
      // Claim-on-read: a second reload cannot re-mint dismissed chips.
      expect(await manager.steering.claim(streamId, owner)).toEqual([]);
    });

    test('parked leftovers survive completeJob within the terminal TTL', async () => {
      const streamId = 'steer-park-terminal';
      await manager.createJob(streamId, 'user-1');
      await manager.steering.park(
        streamId,
        [{ steerId: 'p2', text: 'post-terminal recovery', createdAt: Date.now() }],
        owner,
      );
      await manager.completeJob(streamId);

      expect((await manager.steering.claim(streamId, owner)).map((s) => s.steerId)).toEqual(['p2']);
    });

    test('parked leftovers survive the DEFAULT completeJob cleanup (job record deleted)', async () => {
      // Production default: cleanupOnComplete deletes the job record the
      // moment the run succeeds — recovery must not depend on it existing.
      const defaultManager = new GenerationJobManagerClass();
      defaultManager.configure({
        jobStore: new InMemoryJobStore({ ttlAfterComplete: 0 }),
        eventTransport: new InMemoryEventTransport(),
        isRedis: false,
        cleanupOnComplete: true,
      });
      defaultManager.initialize();
      try {
        const streamId = 'steer-park-deleted-job';
        await defaultManager.createJob(streamId, 'user-1');
        await defaultManager.steering.park(
          streamId,
          [{ steerId: 'p4', text: 'survives job deletion', createdAt: Date.now() }],
          owner,
        );
        await defaultManager.completeJob(streamId);

        expect(await defaultManager.getJob(streamId)).toBeFalsy();
        expect(
          (await defaultManager.steering.claim(streamId, owner)).map((s) => s.steerId),
        ).toEqual(['p4']);
      } finally {
        await defaultManager.destroy();
      }
    });

    test('a non-owner claim returns nothing and preserves the payload for the owner', async () => {
      const streamId = 'steer-park-foreign';
      await manager.createJob(streamId, 'user-1');
      await manager.steering.park(
        streamId,
        [{ steerId: 'p5', text: 'not yours', createdAt: Date.now() }],
        owner,
      );

      expect(await manager.steering.claim(streamId, { userId: 'intruder' })).toEqual([]);
      expect((await manager.steering.claim(streamId, owner)).map((s) => s.steerId)).toEqual(['p5']);
    });

    test('a non-owner claim never deletes the payload, even transiently (no re-park)', async () => {
      const streamId = 'steer-park-atomic';
      await manager.createJob(streamId, 'user-1');
      await manager.steering.park(
        streamId,
        [{ steerId: 'p6', text: 'owner only', createdAt: Date.now() }],
        owner,
      );

      // The owner gate runs INSIDE the store's atomic claim: a rejected probe
      // must not go through the old delete-then-re-park path, which briefly
      // left nothing for a concurrent owner claim.
      const parkSpy = jest.spyOn(manager.getJobStore(), 'parkSteers');
      expect(await manager.steering.claim(streamId, { userId: 'intruder' })).toEqual([]);
      expect(parkSpy).not.toHaveBeenCalled();
      expect((await manager.steering.claim(streamId, owner)).map((s) => s.steerId)).toEqual(['p6']);
      parkSpy.mockRestore();
    });

    test('periodic store cleanup sweeps expired parked steers', async () => {
      const store = new InMemoryJobStore({ ttlAfterComplete: 60000 });
      const base = Date.now();
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(base);
      try {
        await store.parkSteers(
          'steer-park-sweep',
          JSON.stringify({ userId: 'user-1', steers: [{ steerId: 'p7', text: 'stale' }] }),
        );
        nowSpy.mockReturnValue(base + PARKED_STEERS_TTL_MS + 1);
        await store.cleanup();
        // Back inside the window: had the sweep NOT removed the entry, this
        // claim would return it (expiry is otherwise only checked at read).
        nowSpy.mockReturnValue(base);
        expect(await store.claimParkedSteers('steer-park-sweep', '"userId":"user-1"')).toBe(
          undefined,
        );
      } finally {
        nowSpy.mockRestore();
        await store.destroy();
      }
    });

    test('a replacement run clears parked leftovers', async () => {
      const streamId = 'steer-park-replaced';
      await manager.createJob(streamId, 'user-1');
      await manager.steering.park(
        streamId,
        [{ steerId: 'p3', text: 'stale', createdAt: Date.now() }],
        owner,
      );
      await manager.createJob(streamId, 'user-1');

      expect(await manager.steering.claim(streamId, owner)).toEqual([]);
    });

    test('approval expiry parks queued steers instead of deleting them', async () => {
      const streamId = 'steer-expire-park';
      await manager.createJob(streamId, 'user-1');
      await manager.steering.enqueue(streamId, buildSteer('frozen across the pause'));

      const payload = buildToolApprovalPayload([
        { name: 'shell', arguments: { command: 'ls' }, tool_call_id: 'call_exp' },
      ]);
      const action = buildPendingAction(payload, {
        streamId,
        conversationId: streamId,
        runId: 'run-exp',
        responseMessageId: 'msg-exp',
      });
      expect(await manager.approvals.pause(streamId, action)).toBe(true);

      expect(await manager.expireApproval(streamId, action.actionId)).toBe(true);
      expect((await manager.steering.claim(streamId, owner)).map((s) => s.text)).toEqual([
        'frozen across the pause',
      ]);
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

    test('completeJob backstop parks 202-accepted steers instead of dropping them', async () => {
      // Direct error-path callers (init failures, unhandled generation errors)
      // reach completeJob WITHOUT the controllers' close-and-park — the
      // backstop itself must leave the words claimable via /chat/status.
      const streamId = 'steer-complete-error';
      await manager.createJob(streamId, 'user-1');
      const steer = buildSteer('survives the boom');
      await manager.steering.enqueue(streamId, steer);

      await manager.completeJob(streamId, 'boom');

      expect(await manager.steering.peek(streamId)).toEqual([]);
      expect(
        (await manager.steering.claim(streamId, { userId: 'user-1' })).map((s) => s.steerId),
      ).toEqual([steer.steerId]);
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

  describe('synthesizeAppliedSteerEvents (snapshot→subscribe gap)', () => {
    const meta = { conversationId: 'convo-gap', responseMessageId: 'msg-gap' };
    const queued = (steerId: string): SteerQueueItem => ({
      steerId,
      text: 'still queued',
      userId: 'user-1',
      createdAt: Date.now(),
    });

    test('re-surfaces the applied part for a steer that left the queue in the gap', () => {
      const appliedPart = { type: 'steer', steerId: 'g1', steer: 'applied in gap' };
      const fresh = [{ type: 'text' }, appliedPart, { type: 'text' }];

      const events = synthesizeAppliedSteerEvents([], [queued('g2')], fresh, meta);

      expect(events).toHaveLength(1);
      const event = events[0] as { event: string; data: Record<string, unknown> };
      expect(event.event).toBe(SteerEvents.ON_STEER_APPLIED);
      expect(event.data.steerId).toBe('g1');
      expect(event.data.index).toBe(1);
      expect(event.data.part).toBe(appliedPart);
      expect(event.data.conversationId).toBe('convo-gap');
      expect(event.data.responseMessageId).toBe('msg-gap');
    });

    test('synthesizes a steer accepted AND applied in the gap (no snapshot id at all)', () => {
      const appliedPart = { type: 'steer', steerId: 'g5', steer: 'gap only' };

      const events = synthesizeAppliedSteerEvents([], [], [appliedPart], meta);

      expect(events).toHaveLength(1);
      const event = events[0] as { event: string; data: Record<string, unknown> };
      expect(event.data.steerId).toBe('g5');
      expect(event.data.index).toBe(0);
    });

    test('emits nothing when no steer part landed in the gap (terminally drained instead)', () => {
      expect(synthesizeAppliedSteerEvents([], [], [{ type: 'text' }], meta)).toEqual([]);
    });

    test('skips a part already in the snapshot applied set (it rode the sync payload)', () => {
      const part = { type: 'steer', steerId: 'g6' };

      expect(synthesizeAppliedSteerEvents([part], [], [{ type: 'text' }, part], meta)).toEqual([]);
    });

    test('skips a steer still in the live queue', () => {
      const fresh = [{ type: 'steer', steerId: 'g4' }];

      expect(synthesizeAppliedSteerEvents([], [queued('g4')], fresh, meta)).toEqual([]);
    });
  });

  describe('subscribeWithResume steer-gap reconciliation', () => {
    function staleSnapshot(streamId: string, pendingSteers?: TPendingSteer[]): ResumeState {
      return {
        runSteps: [],
        aggregatedContent: [],
        conversationId: streamId,
        responseMessageId: 'msg-gap',
        ...(pendingSteers && { pendingSteers }),
      };
    }

    test('refreshes the snapshot when a steer was ADDED in the gap', async () => {
      const streamId = 'steer-gap-added';
      await manager.createJob(streamId, 'user-1');
      const kept = buildSteer('kept');
      const added = buildSteer('added in gap');
      await manager.steering.enqueue(streamId, kept);
      await manager.steering.enqueue(streamId, added);

      jest
        .spyOn(manager, 'getResumeState')
        .mockResolvedValue(staleSnapshot(streamId, [toPendingSteer(kept)]));

      const result = await manager.subscribeWithResume(streamId, jest.fn());
      expect(result.resumeState?.pendingSteers?.map((s) => s.steerId)).toEqual([
        kept.steerId,
        added.steerId,
      ]);
      expect(result.pendingEvents).toEqual([]);
    });

    test('reconciles an equal-length id swap (one drained + one added)', async () => {
      const streamId = 'steer-gap-swap';
      await manager.createJob(streamId, 'user-1');
      const drained = buildSteer('drained in gap');
      const added = buildSteer('added in gap');
      await manager.steering.enqueue(streamId, added);

      const appliedPart = {
        type: 'steer',
        steer: drained.text,
        steerId: drained.steerId,
      };
      manager.setContentParts(streamId, [appliedPart] as unknown as Agents.MessageContentComplex[]);

      jest
        .spyOn(manager, 'getResumeState')
        .mockResolvedValue(staleSnapshot(streamId, [toPendingSteer(drained)]));

      const result = await manager.subscribeWithResume(streamId, jest.fn());
      // Same length, different ids: the live projection must win…
      expect(result.resumeState?.pendingSteers?.map((s) => s.steerId)).toEqual([added.steerId]);
      // …and the drained steer's applied part is re-surfaced as a gap event.
      expect(result.pendingEvents).toHaveLength(1);
      const event = result.pendingEvents[0] as { event: string; data: Record<string, unknown> };
      expect(event.event).toBe(SteerEvents.ON_STEER_APPLIED);
      expect(event.data.steerId).toBe(drained.steerId);
      expect(event.data.index).toBe(0);
    });

    test('refreshes an EMPTY snapshot when a steer was accepted in the gap', async () => {
      const streamId = 'steer-gap-empty-accept';
      await manager.createJob(streamId, 'user-1');
      const accepted = buildSteer('accepted in gap');
      await manager.steering.enqueue(streamId, accepted);

      jest.spyOn(manager, 'getResumeState').mockResolvedValue(staleSnapshot(streamId));

      const result = await manager.subscribeWithResume(streamId, jest.fn());
      expect(result.resumeState?.pendingSteers?.map((s) => s.steerId)).toEqual([accepted.steerId]);
      expect(result.pendingEvents).toEqual([]);
    });

    test('synthesizes the applied part for a gap steer the snapshot never saw', async () => {
      const streamId = 'steer-gap-empty-applied';
      await manager.createJob(streamId, 'user-1');
      // Gap activity on an empty snapshot: the take-all drain applied one
      // steer, then another was accepted. The queue delta triggers the
      // content re-read that surfaces the never-snapshotted applied part.
      const applied = buildSteer('accepted and applied in gap');
      const queuedAfter = buildSteer('accepted after the drain');
      await manager.steering.enqueue(streamId, queuedAfter);
      manager.setContentParts(streamId, [
        { type: 'steer', steer: applied.text, steerId: applied.steerId },
      ] as unknown as Agents.MessageContentComplex[]);

      jest.spyOn(manager, 'getResumeState').mockResolvedValue(staleSnapshot(streamId));

      const result = await manager.subscribeWithResume(streamId, jest.fn());
      expect(result.resumeState?.pendingSteers?.map((s) => s.steerId)).toEqual([
        queuedAfter.steerId,
      ]);
      expect(result.pendingEvents).toHaveLength(1);
      const event = result.pendingEvents[0] as { event: string; data: Record<string, unknown> };
      expect(event.event).toBe(SteerEvents.ON_STEER_APPLIED);
      expect(event.data.steerId).toBe(applied.steerId);
      expect(event.data.index).toBe(0);
    });

    test('an unchanged empty queue skips the content re-read', async () => {
      const streamId = 'steer-gap-quiet';
      await manager.createJob(streamId, 'user-1');

      jest.spyOn(manager, 'getResumeState').mockResolvedValue(staleSnapshot(streamId));
      const readSpy = jest.spyOn(jobStore, 'getContentParts');

      const result = await manager.subscribeWithResume(streamId, jest.fn());
      expect(readSpy).not.toHaveBeenCalled();
      expect(result.resumeState?.pendingSteers).toBeUndefined();
      expect(result.pendingEvents).toEqual([]);
    });

    test('a terminal job skips steer reconciliation (the final event owns delivery)', async () => {
      const streamId = 'steer-gap-terminal';
      await manager.createJob(streamId, 'user-1');
      await manager.completeJob(streamId, 'done');

      jest.spyOn(manager, 'getResumeState').mockResolvedValue(staleSnapshot(streamId));
      const peekSpy = jest.spyOn(jobStore, 'peekSteers');

      const result = await manager.subscribeWithResume(streamId, jest.fn());
      expect(peekSpy).not.toHaveBeenCalled();
      expect(result.resumeState?.pendingSteers).toBeUndefined();
      expect(result.pendingEvents).toEqual([]);
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

describe('emitChunk durability (Redis-mode chunk log)', () => {
  const steerEvent: ServerSentEvent = {
    event: SteerEvents.ON_STEER_APPLIED,
    data: { steerId: 'durable-1', index: 0, part: { type: 'steer', steer: 'now' } },
  };

  function buildRedisModeManager(store: InMemoryJobStore, transport: InMemoryEventTransport) {
    const redisModeManager = new GenerationJobManagerClass();
    redisModeManager.configure({
      jobStore: store,
      eventTransport: transport,
      isRedis: true,
      cleanupOnComplete: false,
    });
    redisModeManager.initialize();
    return redisModeManager;
  }

  async function flushMicrotasks(times = 20): Promise<void> {
    for (let i = 0; i < times; i++) {
      await Promise.resolve();
    }
  }

  test('durable: true resolves only after the chunk append committed, before the publish', async () => {
    const store = new InMemoryJobStore({ ttlAfterComplete: 60000 });
    const transport = new InMemoryEventTransport();
    const redisModeManager = buildRedisModeManager(store, transport);
    try {
      const streamId = 'steer-durable';
      await redisModeManager.createJob(streamId, 'user-1');

      let resolveAppend!: () => void;
      const appendGate = new Promise<void>((resolve) => {
        resolveAppend = resolve;
      });
      jest.spyOn(store, 'appendChunk').mockReturnValue(appendGate);
      const publishSpy = jest.spyOn(transport, 'emitChunk');

      let settled = false;
      const emit = redisModeManager.emitChunk(streamId, steerEvent, { durable: true }).then(() => {
        settled = true;
      });

      await flushMicrotasks();
      expect(settled).toBe(false);
      expect(publishSpy).not.toHaveBeenCalled();

      resolveAppend();
      await emit;
      expect(settled).toBe(true);
      expect(publishSpy).toHaveBeenCalledWith(streamId, steerEvent);
    } finally {
      await redisModeManager.destroy();
    }
  });

  test('default emitChunk stays fire-and-forget (publishes without awaiting the append)', async () => {
    const store = new InMemoryJobStore({ ttlAfterComplete: 60000 });
    const transport = new InMemoryEventTransport();
    const redisModeManager = buildRedisModeManager(store, transport);
    try {
      const streamId = 'steer-fire-and-forget';
      await redisModeManager.createJob(streamId, 'user-1');

      // Never resolves: the per-delta hot path must not gate on durability.
      jest.spyOn(store, 'appendChunk').mockReturnValue(new Promise<void>(() => undefined));
      const publishSpy = jest.spyOn(transport, 'emitChunk');

      await redisModeManager.emitChunk(streamId, steerEvent);
      expect(publishSpy).toHaveBeenCalledWith(streamId, steerEvent);
    } finally {
      await redisModeManager.destroy();
    }
  });
});
