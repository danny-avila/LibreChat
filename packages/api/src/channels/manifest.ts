export function createSlackManifest(input: {
  name: string;
  description: string;
  gatewayUrl: string;
  installationId: string;
  mode: 'http' | 'socket';
  ingressReady?: boolean;
}) {
  const eventsUrl = `${input.gatewayUrl.replace(/\/$/, '')}/slack/${input.installationId}/events`;
  return {
    display_information: {
      name: input.name.slice(0, 35),
      description: input.description.slice(0, 140),
    },
    features: {
      bot_user: {
        display_name:
          input.name
            .toLowerCase()
            .replace(/[^a-z0-9_.-]/g, '_')
            .slice(0, 80) || 'agent',
      },
      app_home: { messages_tab_enabled: true, messages_tab_read_only_enabled: false },
      agent_view: { agent_description: input.description.slice(0, 300) || input.name },
    },
    oauth_config: {
      scopes: {
        bot: [
          'assistant:write',
          'app_mentions:read',
          'chat:write',
          'im:history',
          'im:write',
          'channels:history',
          'groups:history',
          'users:read',
        ],
      },
    },
    settings: {
      socket_mode_enabled: input.mode === 'socket',
      ...(input.mode === 'socket' || input.ingressReady
        ? {
            event_subscriptions: {
              ...(input.mode === 'http' ? { request_url: eventsUrl } : {}),
              bot_events: [
                'app_mention',
                'message.im',
                'message.channels',
                'message.groups',
                'agent_session_stopped',
              ],
            },
          }
        : {}),
    },
  };
}
