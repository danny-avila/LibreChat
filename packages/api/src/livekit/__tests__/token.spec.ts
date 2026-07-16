import jwt from 'jsonwebtoken';

import type { TLiveKitConfig } from 'librechat-data-provider';

import { deriveRoomName, getLiveKitCredentials, isLiveKitEnabled, mintRoomToken } from '../token';

const API_KEY = 'devkey';
const API_SECRET = 'secret-that-is-long-enough-for-livekit-hs256';
const URL = 'wss://livekit.example.com';

const config: TLiveKitConfig = {
  enabled: true,
  stt: { provider: 'deepgram' },
  tts: { provider: 'cartesia' },
};

const setCredentials = () => {
  process.env.LIVEKIT_URL = URL;
  process.env.LIVEKIT_API_KEY = API_KEY;
  process.env.LIVEKIT_API_SECRET = API_SECRET;
};

const clearCredentials = () => {
  delete process.env.LIVEKIT_URL;
  delete process.env.LIVEKIT_API_KEY;
  delete process.env.LIVEKIT_API_SECRET;
};

describe('deriveRoomName', () => {
  it('is deterministic, so re-opening voice on a conversation lands in the same room', () => {
    expect(deriveRoomName('user-1', 'convo-1')).toBe(deriveRoomName('user-1', 'convo-1'));
  });

  it('separates users, so one user cannot derive another user`s room', () => {
    expect(deriveRoomName('user-1', 'convo-1')).not.toBe(deriveRoomName('user-2', 'convo-1'));
  });

  it('separates conversations for the same user', () => {
    expect(deriveRoomName('user-1', 'convo-1')).not.toBe(deriveRoomName('user-1', 'convo-2'));
  });

  it('does not leak the raw user or conversation id', () => {
    const room = deriveRoomName('user-1', 'convo-1');
    expect(room).toMatch(/^lc_[0-9a-f]{32}$/);
    expect(room).not.toContain('user-1');
    expect(room).not.toContain('convo-1');
  });
});

describe('getLiveKitCredentials / isLiveKitEnabled', () => {
  afterEach(clearCredentials);

  it('returns null when unconfigured, so callers degrade instead of throwing', () => {
    clearCredentials();
    expect(getLiveKitCredentials()).toBeNull();
    expect(isLiveKitEnabled(config)).toBe(false);
  });

  it('requires the secret, not just the url and key', () => {
    setCredentials();
    delete process.env.LIVEKIT_API_SECRET;
    expect(getLiveKitCredentials()).toBeNull();
  });

  it('is disabled when configured but not enabled', () => {
    setCredentials();
    expect(isLiveKitEnabled({ ...config, enabled: false })).toBe(false);
    expect(isLiveKitEnabled(undefined)).toBe(false);
  });

  it('is enabled only when both config and credentials are present', () => {
    setCredentials();
    expect(isLiveKitEnabled(config)).toBe(true);
  });
});

describe('mintRoomToken', () => {
  beforeEach(setCredentials);
  afterEach(clearCredentials);

  it('throws when credentials are missing', async () => {
    clearCredentials();
    await expect(
      mintRoomToken({ userId: 'u1', conversationId: 'c1', sessionId: 's1', config }),
    ).rejects.toThrow(/LIVEKIT_URL/);
  });

  it('signs with LIVEKIT_API_SECRET, never the LibreChat JWT_SECRET', async () => {
    process.env.JWT_SECRET = 'librechat-jwt-secret';
    const { token } = await mintRoomToken({
      userId: 'u1',
      conversationId: 'c1',
      sessionId: 's1',
      config,
    });

    expect(() => jwt.verify(token, API_SECRET)).not.toThrow();
    expect(() => jwt.verify(token, 'librechat-jwt-secret')).toThrow();
  });

  it('grants join only to the derived room, scoped to the calling user', async () => {
    const { token, roomName, identity, url } = await mintRoomToken({
      userId: 'u1',
      conversationId: 'c1',
      sessionId: 's1',
      config,
    });

    const payload = jwt.verify(token, API_SECRET) as jwt.JwtPayload & {
      video?: Record<string, unknown>;
    };

    expect(roomName).toBe(deriveRoomName('u1', 'c1'));
    expect(identity).toBe('u1');
    expect(url).toBe(URL);
    expect(payload.sub).toBe('u1');
    expect(payload.video?.room).toBe(roomName);
    expect(payload.video?.roomJoin).toBe(true);
    expect(payload.video?.canPublish).toBe(true);
    expect(payload.video?.canSubscribe).toBe(true);
    expect(payload.video?.canUpdateOwnMetadata).toBe(false);
  });

  it('never lets a LibreChat credential ride along in the token', async () => {
    const { token } = await mintRoomToken({
      userId: 'u1',
      conversationId: 'c1',
      sessionId: 'opaque-session-id',
      config,
    });

    const [, encoded] = token.split('.');
    const payload = Buffer.from(encoded, 'base64').toString('utf8');

    expect(payload).toContain('opaque-session-id');
    expect(payload).not.toContain('librechat-jwt-secret');
    expect(payload).not.toContain(API_SECRET);
  });

  it('dispatches a named agent so LiveKit does not join every room', async () => {
    const { token } = await mintRoomToken({
      userId: 'u1',
      conversationId: 'c1',
      sessionId: 's1',
      config: { ...config, agentName: 'custom-voice' },
    });

    const payload = jwt.verify(token, API_SECRET) as jwt.JwtPayload & {
      roomConfig?: { agents?: Array<{ agentName?: string; metadata?: string }> };
    };

    const agent = payload.roomConfig?.agents?.[0];
    expect(agent?.agentName).toBe('custom-voice');
    expect(JSON.parse(agent?.metadata ?? '{}')).toEqual({ sessionId: 's1' });
  });
});
