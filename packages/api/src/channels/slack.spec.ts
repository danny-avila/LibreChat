import { createSlackManifest } from './manifest';
import { createChannelCipher } from './crypto';
it('generates a native agent manifest without credentials and adds HTTP ingress only after setup', () => {
  const input = {
    name: 'Agent',
    description: 'Test agent',
    gatewayUrl: 'https://gateway.example',
    installationId: 'ee2a9826-0899-4f2b-b1aa-51bf872eec44',
    mode: 'http' as const,
  };
  const draft = createSlackManifest(input);
  expect(draft.features.agent_view).toEqual({ agent_description: 'Test agent' });
  expect(draft.settings.event_subscriptions).toBeUndefined();
  const final = createSlackManifest({ ...input, ingressReady: true });
  expect(final.settings.event_subscriptions?.request_url).toBe(
    'https://gateway.example/slack/ee2a9826-0899-4f2b-b1aa-51bf872eec44/events',
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
