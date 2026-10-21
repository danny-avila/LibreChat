import { createHmac } from 'node:crypto';
import type { ChannelGatewayInstallation } from 'librechat-data-provider';
import {
  normalizeSlackMessage,
  verifySlackSignature,
  createSlackClient,
  SlackRequestError,
} from './slack';
import { createSlackManifest } from './manifest';
import { createChannelCipher } from './crypto';

const installation: ChannelGatewayInstallation = {
  id: 'ee2a9826-0899-4f2b-b1aa-51bf872eec44',
  agentId: 'agent-1',
  name: 'Agent',
  appId: 'A123',
  teamId: 'T123',
  botUserId: 'UBOT',
  mode: 'http',
  enabled: true,
  credentials: { botToken: 'test-token', signingSecret: 'test-secret' },
};
it('verifies raw-body signatures and rejects tampering, stale timestamps and future requests', () => {
  const raw = Buffer.from('{"text":"hello"}');
  const timestamp = '1000000000';
  const signature = `v0=${createHmac('sha256', 'secret').update(`v0:${timestamp}:`).update(raw).digest('hex')}`;
  expect(verifySlackSignature(raw, timestamp, signature, 'secret', 300, 1000000000000)).toBe(true);
  expect(
    verifySlackSignature(Buffer.from('{}'), timestamp, signature, 'secret', 300, 1000000000000),
  ).toBe(false);
  expect(verifySlackSignature(raw, timestamp, signature, 'secret', 300, 1000000301000)).toBe(false);
  expect(verifySlackSignature(raw, timestamp, signature, 'secret', 300, 999999699000)).toBe(false);
  expect(verifySlackSignature(raw, 'invalid', signature, 'secret', 300)).toBe(false);
});
it('normalizes duplicate event types to one message and ignores bots and other installations', () => {
  const callback = {
    type: 'event_callback' as const,
    api_app_id: 'A123',
    team_id: 'T123',
    event_id: 'Ev1',
    event: {
      type: 'app_mention',
      user: 'U123',
      channel: 'C123',
      ts: '1.0001',
      text: '<@UBOT> hello',
    },
  };
  const mention = normalizeSlackMessage(callback, installation)!;
  expect(mention.text).toBe('hello');
  expect(mention.threadId).toBe('1.0001');
  expect(
    normalizeSlackMessage(
      { ...callback, event: { ...callback.event, type: 'message', thread_ts: '1.0001' } },
      installation,
    )?.eventId,
  ).toBe(mention.eventId);
  expect(normalizeSlackMessage({ ...callback, team_id: 'TOTHER' }, installation)).toBeNull();
  expect(normalizeSlackMessage({ ...callback, api_app_id: 'AOTHER' }, installation)).toBeNull();
  expect(
    normalizeSlackMessage(
      { ...callback, event: { ...callback.event, bot_id: 'B1' } },
      installation,
    ),
  ).toBeNull();
});
it('generates a native agent manifest without credentials and adds HTTP ingress only after setup', () => {
  const input = {
    name: 'Agent',
    description: 'Test agent',
    gatewayUrl: 'https://gateway.example',
    installationId: installation.id,
    mode: 'http' as const,
  };
  const draft = createSlackManifest(input);
  expect(draft.features.agent_view).toEqual({ agent_description: 'Test agent' });
  expect(draft.settings.event_subscriptions).toBeUndefined();
  const final = createSlackManifest({ ...input, ingressReady: true });
  expect(final.settings.event_subscriptions?.request_url).toBe(
    `https://gateway.example/slack/${installation.id}/events`,
  );
  expect(final.settings.event_subscriptions?.bot_events).toContain('agent_session_stopped');
  expect(JSON.stringify(final)).not.toMatch(/secret|token/);
  const socket = createSlackManifest({ ...input, mode: 'socket' });
  expect(socket.settings.socket_mode_enabled).toBe(true);
  expect(socket.settings.event_subscriptions?.request_url).toBeUndefined();
});
it('encrypts credentials with integrity and binds them to their installation', () => {
  const cipher = createChannelCipher('12'.repeat(32));
  const encrypted = cipher.encrypt('private-token', 'installation-1');
  expect(encrypted).not.toContain('private-token');
  expect(cipher.decrypt(encrypted, 'installation-1')).toBe('private-token');
  expect(() => cipher.decrypt(encrypted, 'installation-2')).toThrow();
  expect(() => cipher.decrypt(`${encrypted}x`, 'installation-1')).toThrow();
});
it('distinguishes known rate limits from uncertain network delivery', async () => {
  const limited = createSlackClient(
    jest
      .fn()
      .mockResolvedValue(new Response('{}', { status: 429, headers: { 'retry-after': '2' } })),
    1000,
  );
  await expect(limited.call('chat.postMessage', 'secret', {})).rejects.toMatchObject({
    retryAfterMs: 2000,
    uncertain: false,
  });
  const failed = createSlackClient(jest.fn().mockRejectedValue(new Error('token=secret')), 1000);
  await expect(failed.call('chat.postMessage', 'secret', {})).rejects.toEqual(
    new SlackRequestError(null, true),
  );
});
