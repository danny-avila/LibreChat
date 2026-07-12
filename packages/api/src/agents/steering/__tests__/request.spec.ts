import { InMemoryEventTransport } from '~/stream/implementations/InMemoryEventTransport';
import { buildPendingAction, buildToolApprovalPayload } from '~/agents/hitl/policy';
import { InMemoryJobStore } from '~/stream/implementations/InMemoryJobStore';
import { STEER_QUEUE_MAX_DEPTH } from '~/stream/interfaces/IJobStore';
import { GenerationJobManager } from '~/stream/GenerationJobManager';
import { isSteeringSupported } from '../runtime';
import { handleSteerRequest } from '../request';

jest.mock('../runtime', () => ({
  ...jest.requireActual('../runtime'),
  isSteeringSupported: jest.fn(() => true),
}));

jest.spyOn(console, 'log').mockImplementation();

const mockIsSupported = isSteeringSupported as jest.Mock;
const user = { id: 'user-1' };

describe('handleSteerRequest (real in-memory job manager)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsSupported.mockReturnValue(true);
    GenerationJobManager.configure({
      jobStore: new InMemoryJobStore({ ttlAfterComplete: 60000 }),
      eventTransport: new InMemoryEventTransport(),
      isRedis: false,
      cleanupOnComplete: false,
    });
    GenerationJobManager.initialize();
  });

  afterEach(async () => {
    await GenerationJobManager.destroy();
  });

  it('400s on a missing or placeholder conversationId', async () => {
    expect((await handleSteerRequest(user, { text: 'hello' })).status).toBe(400);
    const placeholder = await handleSteerRequest(user, { conversationId: 'new', text: 'hello' });
    expect(placeholder.status).toBe(400);
    expect(placeholder.body.code).toBe('INVALID_CONVERSATION');
  });

  it('400s on empty or whitespace-only text', async () => {
    const result = await handleSteerRequest(user, { conversationId: 'c1', text: '   ' });
    expect(result.status).toBe(400);
    expect(result.body.code).toBe('EMPTY_TEXT');
  });

  it('413s past the length cap', async () => {
    const result = await handleSteerRequest(user, {
      conversationId: 'c1',
      text: 'x'.repeat(16001),
    });
    expect(result.status).toBe(413);
    expect(result.body.code).toBe('STEER_TOO_LONG');
  });

  it('400s on malformed or oversized file lists', async () => {
    const malformed = await handleSteerRequest(user, {
      conversationId: 'c1',
      text: 'x',
      files: [{ nope: true }],
    });
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe('INVALID_FILES');

    const oversized = await handleSteerRequest(user, {
      conversationId: 'c1',
      text: 'x',
      files: Array.from({ length: 11 }, (_, i) => ({ file_id: `f${i}` })),
    });
    expect(oversized.status).toBe(400);
    expect(oversized.body.code).toBe('TOO_MANY_FILES');
  });

  it('501s when the installed SDK cannot inject hook messages (running job)', async () => {
    mockIsSupported.mockReturnValue(false);
    const streamId = 'steer-req-unsupported';
    await GenerationJobManager.createJob(streamId, user.id);
    const result = await handleSteerRequest(user, { conversationId: streamId, text: 'hello' });
    expect(result.status).toBe(501);
    expect(result.body.code).toBe('STEER_UNSUPPORTED');
  });

  it('404s before the capability gate when the run already finished', async () => {
    // A steer racing completion on an unsupported SDK must send-now (404),
    // not strand text in a queue with no run-end signal left to drain it.
    mockIsSupported.mockReturnValue(false);
    const result = await handleSteerRequest(user, { conversationId: 'finished', text: 'x' });
    expect(result.status).toBe(404);
    expect(result.body.code).toBe('NO_ACTIVE_RUN');
  });

  it('404s when the job is missing or terminal', async () => {
    const missing = await handleSteerRequest(user, { conversationId: 'gone', text: 'x' });
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('NO_ACTIVE_RUN');

    const streamId = 'steer-req-terminal';
    await GenerationJobManager.createJob(streamId, user.id);
    await GenerationJobManager.completeJob(streamId);
    const terminal = await handleSteerRequest(user, { conversationId: streamId, text: 'x' });
    expect(terminal.status).toBe(404);
  });

  it('403s for another user', async () => {
    const streamId = 'steer-req-owner';
    await GenerationJobManager.createJob(streamId, 'someone-else');
    const result = await handleSteerRequest(user, { conversationId: streamId, text: 'x' });
    expect(result.status).toBe(403);
    expect(result.body.code).toBe('UNAUTHORIZED');
  });

  it('409s while the run is paused for human review', async () => {
    const streamId = 'steer-req-paused';
    await GenerationJobManager.createJob(streamId, user.id);
    const payload = buildToolApprovalPayload([
      { name: 'shell', arguments: { command: 'ls' }, tool_call_id: 'call_abc' },
    ]);
    const action = buildPendingAction(payload, {
      streamId,
      conversationId: streamId,
      runId: 'run-1',
      responseMessageId: 'msg-1',
    });
    expect(await GenerationJobManager.approvals.pause(streamId, action)).toBe(true);

    const result = await handleSteerRequest(user, { conversationId: streamId, text: 'x' });
    expect(result.status).toBe(409);
    expect(result.body.code).toBe('RUN_PAUSED');
  });

  it('429s when the queue is full', async () => {
    const streamId = 'steer-req-full';
    await GenerationJobManager.createJob(streamId, user.id);
    for (let i = 0; i < STEER_QUEUE_MAX_DEPTH; i++) {
      const accepted = await handleSteerRequest(user, {
        conversationId: streamId,
        text: `steer ${i}`,
      });
      expect(accepted.status).toBe(202);
    }
    const overflow = await handleSteerRequest(user, { conversationId: streamId, text: 'over' });
    expect(overflow.status).toBe(429);
    expect(overflow.body.code).toBe('STEER_QUEUE_FULL');
  });

  it('202s, sanitizes the text, and enqueues sanitized attachment refs', async () => {
    const streamId = 'steer-req-accept';
    await GenerationJobManager.createJob(streamId, user.id);

    const result = await handleSteerRequest(user, {
      conversationId: streamId,
      text: '  focus on tests\0  ',
      files: [
        {
          file_id: 'f1',
          type: 'image/png',
          filepath: '/uploads/f1.png',
          filename: 'shot.png',
          height: 10,
          width: 20,
          bytes: 999,
          user: 'someone-else',
          embedded: true,
        },
      ],
    });

    expect(result.status).toBe(202);
    expect(result.body).toMatchObject({
      status: 'queued',
      position: 1,
      conversationId: streamId,
    });
    expect(typeof result.body.steerId).toBe('string');

    const queued = await GenerationJobManager.steering.peek(streamId);
    expect(queued).toHaveLength(1);
    expect(queued[0].text).toBe('focus on tests');
    expect(queued[0].userId).toBe(user.id);
    expect(queued[0].files).toEqual([
      {
        file_id: 'f1',
        type: 'image/png',
        filepath: '/uploads/f1.png',
        filename: 'shot.png',
        height: 10,
        width: 20,
        bytes: 999,
      },
    ]);
  });
});
