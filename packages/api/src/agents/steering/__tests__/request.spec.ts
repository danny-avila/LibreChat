import type { IMongoFile } from '@librechat/data-schemas';
import { InMemoryEventTransport } from '~/stream/implementations/InMemoryEventTransport';
import { buildPendingAction, buildToolApprovalPayload } from '~/agents/hitl/policy';
import { InMemoryJobStore } from '~/stream/implementations/InMemoryJobStore';
import { STEER_QUEUE_MAX_DEPTH } from '~/stream/interfaces/IJobStore';
import { GenerationJobManager } from '~/stream/GenerationJobManager';
import { handleSteerRequest, handleSteerCancel } from '../request';
import { isSteeringSupported } from '../runtime';

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

  describe('injected getFiles (owner-scoped resolve at enqueue)', () => {
    const dbDoc = {
      file_id: 'f1',
      type: 'image/png',
      filepath: '/uploads/u1/f1.png',
      filename: 'real.png',
      height: 4,
      width: 6,
      bytes: 111,
      user: 'user-1',
    } as unknown as IMongoFile;

    it('400s INVALID_FILES when any ref does not resolve to an owned doc, enqueuing nothing', async () => {
      const streamId = 'steer-req-file-foreign';
      await GenerationJobManager.createJob(streamId, user.id);
      const getFiles = jest.fn(async () => [dbDoc]);

      const result = await handleSteerRequest(
        user,
        {
          conversationId: streamId,
          text: 'x',
          files: [{ file_id: 'f1' }, { file_id: 'f-foreign' }],
        },
        { getFiles },
      );

      expect(result.status).toBe(400);
      expect(result.body.code).toBe('INVALID_FILES');
      expect(getFiles).toHaveBeenCalledWith(
        { file_id: { $in: ['f1', 'f-foreign'] }, user: user.id },
        {},
        {},
      );
      expect(await GenerationJobManager.steering.peek(streamId)).toEqual([]);
    });

    it('replaces client-supplied ref metadata with DB-derived shapes', async () => {
      const streamId = 'steer-req-file-trusted';
      await GenerationJobManager.createJob(streamId, user.id);
      const getFiles = jest.fn(async () => [dbDoc]);

      const result = await handleSteerRequest(
        user,
        {
          conversationId: streamId,
          text: 'trusted refs only',
          files: [
            {
              file_id: 'f1',
              type: 'text/html',
              filepath: 'https://evil.example/spoof',
              filename: 'spoof.html',
              bytes: 1,
            },
          ],
        },
        { getFiles },
      );

      expect(result.status).toBe(202);
      const queued = await GenerationJobManager.steering.peek(streamId);
      expect(queued[0].files).toEqual([
        {
          file_id: 'f1',
          type: 'image/png',
          filepath: '/uploads/u1/f1.png',
          filename: 'real.png',
          height: 4,
          width: 6,
          bytes: 111,
        },
      ]);
    });

    it('skips the resolve for text-only steers', async () => {
      const streamId = 'steer-req-file-none';
      await GenerationJobManager.createJob(streamId, user.id);
      const getFiles = jest.fn(async () => [dbDoc]);

      const result = await handleSteerRequest(
        user,
        { conversationId: streamId, text: 'no attachments' },
        { getFiles },
      );

      expect(result.status).toBe(202);
      expect(getFiles).not.toHaveBeenCalled();
    });
  });

  describe('injected updateFilesUsage (upload-window TTL parity)', () => {
    const dbDoc = { file_id: 'f1', type: 'image/png' } as unknown as IMongoFile;

    it('marks resolved uploads used after a successful enqueue', async () => {
      const streamId = 'steer-req-usage-ok';
      await GenerationJobManager.createJob(streamId, user.id);
      const getFiles = jest.fn(async () => [dbDoc]);
      const updateFilesUsage = jest.fn(async () => []);

      const result = await handleSteerRequest(
        user,
        { conversationId: streamId, text: 'x', files: [{ file_id: 'f1' }] },
        { getFiles, updateFilesUsage },
      );

      expect(result.status).toBe(202);
      expect(updateFilesUsage).toHaveBeenCalledWith([{ file_id: 'f1' }], undefined, {
        user: user.id,
        tenantId: undefined,
      });
    });

    it('does not mark usage on a rejected steer and never fails the 202', async () => {
      const streamId = 'steer-req-usage-deny';
      await GenerationJobManager.createJob(streamId, user.id);
      const getFiles = jest.fn(async () => [dbDoc]);
      const updateFilesUsage = jest.fn(async () => []);

      const denied = await handleSteerRequest(
        user,
        { conversationId: streamId, text: 'x', files: [{ file_id: 'f-unknown' }] },
        { getFiles, updateFilesUsage },
      );
      expect(denied.status).toBe(400);
      expect(updateFilesUsage).not.toHaveBeenCalled();

      const failing = jest.fn(async () => {
        throw new Error('usage write failed');
      });
      const accepted = await handleSteerRequest(
        user,
        { conversationId: streamId, text: 'x', files: [{ file_id: 'f1' }] },
        { getFiles, updateFilesUsage: failing },
      );
      expect(accepted.status).toBe(202);
      await new Promise(setImmediate);
      expect(failing).toHaveBeenCalledTimes(1);
    });
  });

  describe('injected checkAgentAccess (originating-run authorization)', () => {
    it('403s FORBIDDEN and enqueues nothing when the check denies', async () => {
      const streamId = 'steer-req-agent-denied';
      await GenerationJobManager.createJob(streamId, user.id);
      await GenerationJobManager.updateMetadata(streamId, {
        agent_id: 'agent_abc',
        endpoint: 'agents',
      });
      const checkAgentAccess = jest.fn(async () => false);
      const getFiles = jest.fn(async () => []);
      const updateFilesUsage = jest.fn(async () => []);

      const result = await handleSteerRequest(
        user,
        { conversationId: streamId, text: 'inject this', files: [{ file_id: 'f1' }] },
        { checkAgentAccess, getFiles, updateFilesUsage },
      );

      expect(result.status).toBe(403);
      expect(result.body.code).toBe('FORBIDDEN');
      expect(checkAgentAccess).toHaveBeenCalledWith({ agentId: 'agent_abc', endpoint: 'agents' });
      expect(getFiles).not.toHaveBeenCalled();
      expect(updateFilesUsage).not.toHaveBeenCalled();
      expect(await GenerationJobManager.steering.peek(streamId)).toEqual([]);
    });

    it('202s when the check allows, passing the job metadata identity', async () => {
      const streamId = 'steer-req-agent-allowed';
      await GenerationJobManager.createJob(streamId, user.id);
      const checkAgentAccess = jest.fn(async () => true);

      const result = await handleSteerRequest(
        user,
        { conversationId: streamId, text: 'go ahead' },
        { checkAgentAccess },
      );

      expect(result.status).toBe(202);
      // No metadata written yet — the callback still receives the (empty) identity.
      expect(checkAgentAccess).toHaveBeenCalledWith({ agentId: undefined, endpoint: undefined });
      expect(await GenerationJobManager.steering.peek(streamId)).toHaveLength(1);
    });
  });
});

describe('handleSteerCancel (real in-memory job manager)', () => {
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

  async function queueSteer(streamId: string): Promise<string> {
    await GenerationJobManager.createJob(streamId, 'user-1');
    const result = await handleSteerRequest(user, { conversationId: streamId, text: 'cancel me' });
    expect(result.status).toBe(202);
    return result.body.steerId as string;
  }

  it('400s on invalid input', async () => {
    expect((await handleSteerCancel(user, { steerId: 's1' })).status).toBe(400);
    const badId = await handleSteerCancel(user, { conversationId: 'c1', steerId: '' });
    expect(badId.status).toBe(400);
    expect(badId.body.code).toBe('INVALID_STEER_ID');
  });

  it('removes a queued steer and reports a lost race as removed:false', async () => {
    const steerId = await queueSteer('cancel-ok');
    const cancelled = await handleSteerCancel(user, { conversationId: 'cancel-ok', steerId });
    expect(cancelled).toEqual({ status: 200, body: { removed: true } });
    expect(await GenerationJobManager.steering.peek('cancel-ok')).toEqual([]);

    const again = await handleSteerCancel(user, { conversationId: 'cancel-ok', steerId });
    expect(again).toEqual({ status: 200, body: { removed: false } });
  });

  it('treats a missing job as a lost race, not an error', async () => {
    const result = await handleSteerCancel(user, { conversationId: 'gone', steerId: 's1' });
    expect(result).toEqual({ status: 200, body: { removed: false } });
  });

  it('403s another user and leaves the steer queued', async () => {
    const steerId = await queueSteer('cancel-foreign');
    const result = await handleSteerCancel(
      { id: 'intruder' },
      { conversationId: 'cancel-foreign', steerId },
    );
    expect(result.status).toBe(403);
    expect((await GenerationJobManager.steering.peek('cancel-foreign')).length).toBe(1);
  });
});
