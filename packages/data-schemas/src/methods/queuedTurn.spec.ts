import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Model } from 'mongoose';
import type {
  IAgentQueuedTurnDocument,
  IAgentQueuedTurnSequenceDocument,
} from '~/types/queuedTurn';
import {
  AgentQueuedTurnConflictError,
  createAgentQueuedTurnMethods,
  type AgentQueuedTurnMethods,
} from './queuedTurn';
import {
  createAgentQueuedTurnModel,
  createAgentQueuedTurnSequenceModel,
} from '../models/queuedTurn';

const DB_SETUP_TIMEOUT_MS = 60_000;
const START = new Date('2026-08-30T12:00:00.000Z');
const LATER = new Date(START.getTime() + 60_000);
let mongoServer: MongoMemoryServer;
let Turn: Model<IAgentQueuedTurnDocument>;
let Sequence: Model<IAgentQueuedTurnSequenceDocument>;
let methods: AgentQueuedTurnMethods;
let user: mongoose.Types.ObjectId;
let counter = 0;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  Turn = createAgentQueuedTurnModel(mongoose);
  Sequence = createAgentQueuedTurnSequenceModel(mongoose);
  await Promise.all([Turn.init(), Sequence.init()]);
  methods = createAgentQueuedTurnMethods(mongoose);
}, DB_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
}, DB_SETUP_TIMEOUT_MS);

beforeEach(async () => {
  await Promise.all([Turn.deleteMany({}), Sequence.deleteMany({})]);
  user = new mongoose.Types.ObjectId();
  counter += 1;
});

function enqueueInput(
  overrides: Partial<Parameters<typeof methods.enqueueAgentQueuedTurn>[0]> = {},
) {
  return {
    user,
    tenantId: 'tenant-1',
    conversationId: 'conversation-1',
    agentId: 'agent-1',
    parentMessageId: 'parent-1',
    clientRequestId: `request-${counter}`,
    text: 'follow up',
    availableAt: START,
    ...overrides,
  };
}

function claimInput(
  queuedTurnId: string,
  overrides: Partial<Parameters<typeof methods.claimNextAgentQueuedTurn>[0]> = {},
) {
  return {
    user,
    tenantId: 'tenant-1',
    conversationId: 'conversation-1',
    queuedTurnId,
    claimId: 'claim-1',
    claimBy: 'worker-1',
    now: START,
    leaseUntil: LATER,
    ...overrides,
  };
}

describe('agent queued turn methods', () => {
  it('normalizes payloads, replays the same request, and conflicts on changed content', async () => {
    const input = enqueueInput({
      text: '  follow up  ',
      files: [
        { file_id: ' file-1 ', filename: ' report.pdf ' },
        { file_id: 'file-1', filename: 'ignored duplicate' },
      ],
      quotes: [' quote ', '', 'second'],
      manualSkills: [' skill-a ', 'skill-a'],
      expectedPredecessorCreatedAt: 42,
    });

    const first = await methods.enqueueAgentQueuedTurn(input);
    const replay = await methods.enqueueAgentQueuedTurn({
      ...input,
      text: 'follow up',
      files: [{ file_id: 'file-1', filename: 'report.pdf' }],
      quotes: ['quote', 'second'],
      manualSkills: ['skill-a'],
    });

    expect(first.replayed).toBe(false);
    expect(first.turn).toMatchObject({
      queuedTurnId: expect.any(String),
      agentId: 'agent-1',
      parentMessageId: 'parent-1',
      sequence: 1,
      status: 'queued',
      text: 'follow up',
      files: [{ file_id: 'file-1', filename: 'report.pdf' }],
      quotes: ['quote', 'second'],
      manualSkills: ['skill-a'],
      expectedPredecessorCreatedAt: 42,
    });
    expect(replay).toMatchObject({
      replayed: true,
      turn: { queuedTurnId: first.turn.queuedTurnId },
    });
    await expect(
      methods.enqueueAgentQueuedTurn({ ...input, agentId: 'agent-2' }),
    ).rejects.toBeInstanceOf(AgentQueuedTurnConflictError);
    await expect(
      methods.enqueueAgentQueuedTurn({
        ...input,
        parentMessageId: 'different-parent',
      }),
    ).rejects.toBeInstanceOf(AgentQueuedTurnConflictError);
    expect(await Turn.countDocuments()).toBe(1);
  });

  it('looks up terminal receipts by owner-scoped request identity', async () => {
    const created = await methods.enqueueAgentQueuedTurn(enqueueInput());

    await expect(
      methods.getAgentQueuedTurnByClientRequestId({
        user,
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        clientRequestId: created.turn.clientRequestId,
      }),
    ).resolves.toMatchObject({ queuedTurnId: created.turn.queuedTurnId });
    await expect(
      methods.getAgentQueuedTurnByClientRequestId({
        user,
        tenantId: 'tenant-1',
        conversationId: 'another-conversation',
        clientRequestId: created.turn.clientRequestId,
      }),
    ).resolves.toBeNull();
  });

  it('allocates monotonic conversation sequences under concurrent enqueue', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        methods.enqueueAgentQueuedTurn(
          enqueueInput({
            clientRequestId: `concurrent-${index}`,
            text: `turn ${index}`,
          }),
        ),
      ),
    );

    expect(results.map(({ turn }) => turn.sequence).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it('keeps untenant records in the untenant owner scope', async () => {
    const queued = await methods.enqueueAgentQueuedTurn(
      enqueueInput({ tenantId: undefined, clientRequestId: 'untenant' }),
    );

    expect(queued.turn.tenantId).toBeUndefined();
    await expect(
      methods.listActiveAgentQueuedTurns({
        user,
        conversationId: 'conversation-1',
      }),
    ).resolves.toMatchObject([{ queuedTurnId: queued.turn.queuedTurnId }]);
    await expect(
      methods.listActiveAgentQueuedTurns({
        user,
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
      }),
    ).resolves.toEqual([]);
  });

  it('lists and claims priority then FIFO without skipping the expected head', async () => {
    const first = await methods.enqueueAgentQueuedTurn(
      enqueueInput({ clientRequestId: 'first', text: 'first' }),
    );
    const second = await methods.enqueueAgentQueuedTurn(
      enqueueInput({ clientRequestId: 'second', text: 'second' }),
    );
    const priority = await methods.enqueueAgentQueuedTurn(
      enqueueInput({
        clientRequestId: 'priority',
        text: 'priority',
        priority: true,
      }),
    );

    const active = await methods.listActiveAgentQueuedTurns(enqueueInput());
    expect(active.map((turn) => turn.clientRequestId)).toEqual(['priority', 'first', 'second']);
    await expect(
      methods.claimNextAgentQueuedTurn(claimInput(first.turn.queuedTurnId)),
    ).resolves.toEqual({
      outcome: 'blocked',
      claim: null,
    });

    const acquired = await methods.claimNextAgentQueuedTurn(claimInput(priority.turn.queuedTurnId));
    expect(acquired).toMatchObject({
      outcome: 'acquired',
      claim: { queuedTurnId: priority.turn.queuedTurnId, attempts: 1 },
    });
    const replayed = await methods.claimNextAgentQueuedTurn(claimInput(priority.turn.queuedTurnId));
    expect(replayed).toMatchObject({
      outcome: 'replayed',
      claim: { queuedTurnId: priority.turn.queuedTurnId, attempts: 1 },
    });
    await expect(
      methods.claimNextAgentQueuedTurn(
        claimInput(second.turn.queuedTurnId, {
          claimId: 'other',
          claimBy: 'worker-2',
        }),
      ),
    ).resolves.toEqual({ outcome: 'blocked', claim: null });
  });

  it('reclaims an expired exact lease but never replays a different claim identity', async () => {
    const queued = await methods.enqueueAgentQueuedTurn(enqueueInput());
    const first = await methods.claimNextAgentQueuedTurn(
      claimInput(queued.turn.queuedTurnId, {
        now: START,
        leaseUntil: new Date(START.getTime() + 1),
      }),
    );
    expect(first.outcome).toBe('acquired');

    const reclaimed = await methods.claimNextAgentQueuedTurn(
      claimInput(queued.turn.queuedTurnId, {
        claimId: 'claim-2',
        claimBy: 'worker-2',
        now: new Date(START.getTime() + 2),
        leaseUntil: LATER,
      }),
    );
    expect(reclaimed).toMatchObject({
      outcome: 'acquired',
      claim: { attempts: 2 },
    });
  });

  it('repairs delivery scheduling idempotently and leaves unscheduled replays discoverable', async () => {
    const queued = await methods.enqueueAgentQueuedTurn(enqueueInput());
    expect(await methods.findQueuedTurnsNeedingDelivery()).toMatchObject([
      { queuedTurnId: queued.turn.queuedTurnId },
    ]);
    const replay = await methods.enqueueAgentQueuedTurn(enqueueInput());
    expect(replay.replayed).toBe(true);
    expect(replay.turn).not.toHaveProperty('scheduledAt');

    const scheduled = await methods.markQueuedTurnScheduled({
      user,
      tenantId: 'tenant-1',
      conversationId: 'conversation-1',
      queuedTurnId: queued.turn.queuedTurnId,
      deliveryKey: 'delivery-1',
      scheduledAt: START,
    });
    expect(scheduled).toMatchObject({
      outcome: 'scheduled',
      turn: { deliveryKey: 'delivery-1', scheduledAt: START },
    });
    await expect(
      methods.markQueuedTurnScheduled({
        user,
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        queuedTurnId: queued.turn.queuedTurnId,
        deliveryKey: 'delivery-1',
      }),
    ).resolves.toMatchObject({ outcome: 'already_scheduled' });
    await expect(
      methods.markQueuedTurnScheduled({
        user,
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        queuedTurnId: queued.turn.queuedTurnId,
        deliveryKey: 'delivery-2',
      }),
    ).resolves.toMatchObject({ outcome: 'conflict' });
    expect(await methods.findQueuedTurnsNeedingDelivery()).toEqual([]);
  });

  it('cancels queued work idempotently but does not cancel a claimed turn', async () => {
    const cancellable = await methods.enqueueAgentQueuedTurn(enqueueInput());
    const cancelled = await methods.cancelAgentQueuedTurn({
      user,
      tenantId: 'tenant-1',
      conversationId: 'conversation-1',
      queuedTurnId: cancellable.turn.queuedTurnId,
      settledAt: START,
    });
    expect(cancelled).toMatchObject({
      outcome: 'cancelled',
      turn: { status: 'cancelled' },
    });
    await expect(
      methods.cancelAgentQueuedTurn({
        user,
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        queuedTurnId: cancellable.turn.queuedTurnId,
      }),
    ).resolves.toMatchObject({ outcome: 'already_cancelled' });
    await expect(
      methods.claimNextAgentQueuedTurn(claimInput(cancellable.turn.queuedTurnId)),
    ).resolves.toEqual({ outcome: 'missing', claim: null });

    const claimed = await methods.enqueueAgentQueuedTurn(
      enqueueInput({ clientRequestId: 'claimed', text: 'claimed' }),
    );
    await methods.claimNextAgentQueuedTurn(claimInput(claimed.turn.queuedTurnId));
    await expect(
      methods.cancelAgentQueuedTurn({
        user,
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        queuedTurnId: claimed.turn.queuedTurnId,
      }),
    ).resolves.toMatchObject({ outcome: 'not_cancellable' });
  });

  it('retries, dead-letters, and admits only through the exact claim fence', async () => {
    const retry = await methods.enqueueAgentQueuedTurn(enqueueInput());
    await methods.claimNextAgentQueuedTurn(claimInput(retry.turn.queuedTurnId));
    await expect(
      methods.releaseAgentQueuedTurn({
        ...claimInput(retry.turn.queuedTurnId),
        disposition: 'retry',
        availableAt: LATER,
      }),
    ).resolves.toMatchObject({
      outcome: 'released',
      turn: { status: 'queued', availableAt: LATER },
    });

    const dead = await methods.enqueueAgentQueuedTurn(
      enqueueInput({ clientRequestId: 'dead', text: 'dead', priority: true }),
    );
    await methods.claimNextAgentQueuedTurn(claimInput(dead.turn.queuedTurnId));
    await expect(
      methods.releaseAgentQueuedTurn({
        ...claimInput(dead.turn.queuedTurnId),
        disposition: 'dead',
        settledAt: START,
        failure: { code: 'BROKEN', message: 'cannot continue' },
      }),
    ).resolves.toMatchObject({
      outcome: 'dead',
      turn: {
        status: 'dead',
        terminalReceipt: { outcome: 'dead', failure: { code: 'BROKEN' } },
      },
    });

    const admitted = await methods.enqueueAgentQueuedTurn(
      enqueueInput({
        clientRequestId: 'admitted',
        text: 'admitted',
        priority: true,
      }),
    );
    await methods.claimNextAgentQueuedTurn(claimInput(admitted.turn.queuedTurnId));
    const admissionInput = {
      ...claimInput(admitted.turn.queuedTurnId),
      admissionId: 'admission-1',
      admissionMode: 'ordinary' as const,
      generationId: 'generation-1',
      generationCreatedAt: 84,
      settledAt: START,
    };
    await expect(methods.markAgentQueuedTurnAdmitted(admissionInput)).resolves.toMatchObject({
      outcome: 'admitted',
      turn: {
        status: 'admitted',
        terminalReceipt: { admissionId: 'admission-1' },
      },
    });
    await expect(methods.markAgentQueuedTurnAdmitted(admissionInput)).resolves.toMatchObject({
      outcome: 'already_admitted',
    });
    await expect(
      methods.markAgentQueuedTurnAdmitted({
        ...admissionInput,
        admissionId: 'different',
      }),
    ).resolves.toMatchObject({ outcome: 'conflict' });
  });

  it('isolates owner, tenant, and conversation scopes and drains or deletes exact scopes', async () => {
    const otherUser = new mongoose.Types.ObjectId();
    await Promise.all([
      methods.enqueueAgentQueuedTurn(enqueueInput({ clientRequestId: 'keep', text: 'keep' })),
      methods.enqueueAgentQueuedTurn(
        enqueueInput({
          clientRequestId: 'other-conversation',
          conversationId: 'conversation-2',
          text: 'other conversation',
        }),
      ),
      methods.enqueueAgentQueuedTurn(
        enqueueInput({
          clientRequestId: 'other-user',
          user: otherUser,
          text: 'other user',
        }),
      ),
    ]);

    expect(
      await methods.drainAgentQueuedTurns({
        user,
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        settledAt: START,
      }),
    ).toBe(1);
    expect(
      await methods.deleteAgentQueuedTurns({
        user,
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
      }),
    ).toBe(1);
    expect(await Turn.countDocuments()).toBe(2);
    expect(await Sequence.countDocuments()).toBe(2);
  });
});
