import type { VoiceSessionContext } from '../session';

import { claimVoiceSession, createVoiceSession } from '../session';

const context: VoiceSessionContext = {
  userId: 'user-1',
  conversationId: 'convo-1',
  roomName: 'lc_abc',
  endpoint: 'agents',
  agentId: 'agent-1',
  maxSessionDuration: 1800,
  stt: { provider: 'deepgram' },
  tts: { provider: 'cartesia' },
};

describe('voice session claim', () => {
  it('round-trips the context the worker needs to rebuild the request', async () => {
    const sessionId = await createVoiceSession(context);
    const claimed = await claimVoiceSession(sessionId);

    expect(claimed).toMatchObject(context);
    expect(claimed?.createdAt).toEqual(expect.any(Number));
  });

  it('mints an opaque, unguessable id rather than anything derived from the user', async () => {
    const sessionId = await createVoiceSession(context);

    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(sessionId).not.toContain('user-1');
    expect(sessionId).not.toContain('convo-1');
  });

  it('is single-use: a replayed sessionId finds nothing', async () => {
    const sessionId = await createVoiceSession(context);

    expect(await claimVoiceSession(sessionId)).not.toBeNull();
    expect(await claimVoiceSession(sessionId)).toBeNull();
  });

  it('returns null for an unknown sessionId', async () => {
    expect(await claimVoiceSession('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('hands the record to exactly one of two racing claims', async () => {
    const sessionId = await createVoiceSession(context);

    const results = await Promise.all([claimVoiceSession(sessionId), claimVoiceSession(sessionId)]);

    expect(results.filter((result) => result !== null)).toHaveLength(1);
  });

  it('keeps sessions isolated from one another', async () => {
    const first = await createVoiceSession(context);
    const second = await createVoiceSession({ ...context, conversationId: 'convo-2' });

    expect(first).not.toBe(second);
    expect((await claimVoiceSession(second))?.conversationId).toBe('convo-2');
    expect((await claimVoiceSession(first))?.conversationId).toBe('convo-1');
  });
});
