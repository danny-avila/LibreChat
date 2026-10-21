import { z } from 'zod';
import express from 'express';
import { channelsConfigSchema, channelEnvelopeSchema } from 'librechat-data-provider';
import type {
  ChannelGatewayInstallation,
  ChannelGatewaySettings,
  ChannelWork,
} from 'librechat-data-provider';
import type { Server } from 'node:http';
import type { SlackCallback } from './slack';
import {
  normalizeSlackMessage,
  verifySlackSignature,
  slackCallbackSchema,
  createSlackClient,
  SlackRequestError,
} from './slack';

interface GatewayDependencies {
  apiUrl: string;
  serviceToken: string;
  fetcher?: Parameters<typeof createSlackClient>[0];
  reportError: (code: string) => void;
}
const workSchema = z.object({
  id: z.string(),
  owner: z.string(),
  status: z.enum(['claimed', 'running', 'ready', 'sending', 'cleanup']),
  envelope: channelEnvelopeSchema,
  attempts: z.number(),
  userId: z.string().optional(),
  reply: z.object({ text: z.string(), private: z.boolean() }).optional(),
});
const settingsSchema = z.object({
  config: channelsConfigSchema,
  installations: z.array(
    z.object({
      id: z.string(),
      agentId: z.string(),
      name: z.string(),
      appId: z.string(),
      teamId: z.string(),
      botUserId: z.string(),
      mode: z.enum(['http', 'socket']),
      enabled: z.boolean(),
      credentials: z.object({
        botToken: z.string(),
        signingSecret: z.string(),
        appToken: z.string().optional(),
      }),
    }),
  ),
});

/** A separate process owns Slack connections and delivery. LibreChat owns durable storage and execution. */
export async function startChannelGateway(
  deps: GatewayDependencies,
): Promise<{ port: number; close: () => Promise<void> }> {
  const fetcher = deps.fetcher ?? fetch;
  const apiUrl = new URL(deps.apiUrl);
  if (
    apiUrl.protocol !== 'https:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(apiUrl.hostname)
  ) {
    throw new Error('The gateway requires HTTPS outside localhost');
  }
  if (deps.serviceToken.length < 32) throw new Error('The gateway service credential is missing');
  let settings: ChannelGatewaySettings = {
    config: channelsConfigSchema.parse({}),
    installations: [],
  };
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let loop: Promise<void> | undefined;
  let refreshTimer: NodeJS.Timeout | undefined;
  let refreshLoop: Promise<void> | undefined;
  const active = new Map<string, { abort: AbortController; work: ChannelWork }>();
  const sockets = new Map<string, { socket: WebSocket; token: string }>();
  async function api(path: string, body?: object, signal?: AbortSignal): Promise<unknown> {
    const response = await fetcher(
      new URL(`api/channels/gateway/${path}`, `${deps.apiUrl.replace(/\/$/, '')}/`),
      {
        method: body == null ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${deps.serviceToken}`,
          'Content-Type': 'application/json',
        },
        body: body == null ? undefined : JSON.stringify(body),
        signal: signal ?? AbortSignal.timeout(settings?.config.requestTimeoutMs ?? 15000),
      },
    );
    if (!response.ok) throw new Error('LibreChat gateway request failed');
    return response.json();
  }
  async function receive(callback: SlackCallback, installation: ChannelGatewayInstallation) {
    if (!installation.enabled) return;
    if (callback.api_app_id !== installation.appId || callback.team_id !== installation.teamId)
      return;
    const event = callback.event;
    if (
      event?.type === 'agent_session_stopped' &&
      event.user &&
      event.channel &&
      event.thread_ts &&
      event.event_ts &&
      Number.isFinite(Number(event.event_ts))
    ) {
      await api('stop', {
        installationId: installation.id,
        senderId: event.user,
        destinationId: event.channel,
        threadId: event.thread_ts,
        sentAt: Number(event.event_ts),
      });
      for (const { work, abort } of active.values()) {
        const e = work.envelope;
        if (
          e.installationId === installation.id &&
          e.senderId === event.user &&
          e.destinationId === event.channel &&
          e.threadId === event.thread_ts &&
          e.sentAt <= Number(event.event_ts)
        )
          abort.abort();
      }
      return;
    }
    const envelope = normalizeSlackMessage(callback, installation);
    if (envelope?.text) await api('events', envelope);
  }
  async function connectSocket(installation: ChannelGatewayInstallation) {
    const token = installation.credentials.appToken;
    if (!token) return;
    const slack = createSlackClient(fetcher, settings.config.requestTimeoutMs);
    const result = z
      .object({ url: z.string().url() })
      .parse(await slack.call('apps.connections.open', token, {}));
    if (stopped) return;
    const socket = new WebSocket(result.url);
    sockets.set(installation.id, { socket, token });
    socket.addEventListener('message', (message) => {
      void (async () => {
        if (typeof message.data !== 'string') return;
        const envelope = z
          .object({
            type: z.string(),
            envelope_id: z.string().optional(),
            payload: z.unknown().optional(),
          })
          .parse(JSON.parse(message.data));
        if (envelope.type === 'disconnect') {
          socket.close();
          return;
        }
        if (envelope.type !== 'events_api' || !envelope.envelope_id) return;
        const current = settings.installations.find((item) => item.id === installation.id);
        if (!current) return;
        await receive(slackCallbackSchema.parse(envelope.payload), current);
        socket.send(JSON.stringify({ envelope_id: envelope.envelope_id }));
      })().catch(() => deps.reportError('socket_event_failed'));
    });
    socket.addEventListener('close', () => {
      if (sockets.get(installation.id)?.socket === socket) sockets.delete(installation.id);
    });
    socket.addEventListener('error', () => {
      deps.reportError('socket_connection_failed');
      socket.close();
    });
  }
  async function refresh() {
    settings = settingsSchema.parse(await api('settings'));
    if (stopped) return;
    for (const [id, value] of sockets) {
      const item = settings.installations.find(
        (installation) =>
          installation.id === id && installation.enabled && installation.mode === 'socket',
      );
      if (!item || item.credentials.appToken !== value.token) {
        value.socket.close();
        sockets.delete(id);
      }
    }
    for (const item of settings.installations) {
      if (item.enabled && item.mode === 'socket' && !sockets.has(item.id)) {
        await connectSocket(item).catch(() => deps.reportError('socket_connect_failed'));
      }
    }
  }
  async function syncSettings() {
    try {
      await refresh();
    } catch {
      deps.reportError('gateway_settings_failed');
    }
    if (!stopped)
      refreshTimer = setTimeout(() => {
        refreshLoop = syncSettings();
      }, settings.config.pollMs);
  }
  async function process(work: ChannelWork) {
    const installation = settings.installations.find(
      (item) => item.id === work.envelope.installationId,
    );
    if (!installation) {
      await api(`work/${work.id}/settle`, { owner: work.owner, outcome: 'uncertain' });
      return;
    }
    const slack = createSlackClient(fetcher, settings.config.requestTimeoutMs);
    if (work.status === 'cleanup' || !installation.enabled) {
      await slack.status(installation, work.envelope, 'active');
      await api(`work/${work.id}/settle`, { owner: work.owner, outcome: 'uncertain' });
      return;
    }
    const abort = new AbortController();
    active.set(work.id, { abort, work });
    const heartbeat = setInterval(
      () => {
        void api(`work/${work.id}/renew`, { owner: work.owner })
          .then((result) => {
            if (!z.object({ valid: z.boolean() }).parse(result).valid) abort.abort();
          })
          .catch(() => abort.abort());
      },
      Math.floor(settings.config.leaseMs / 3),
    );
    try {
      let reply = work.reply;
      if (!reply) {
        await slack
          .status(installation, work.envelope, 'processing')
          .catch(() => deps.reportError('status_failed'));
        const result = await api(
          `work/${work.id}/invoke`,
          { owner: work.owner },
          AbortSignal.any([abort.signal, AbortSignal.timeout(settings.config.runTimeoutMs)]),
        );
        reply = z.object({ text: z.string(), private: z.boolean() }).parse(result);
      }
      if (abort.signal.aborted) {
        await api(`work/${work.id}/settle`, { owner: work.owner, outcome: 'uncertain' });
        return;
      }
      const sending = z
        .object({ valid: z.boolean() })
        .parse(await api(`work/${work.id}/sending`, { owner: work.owner }));
      if (!sending.valid) return;
      try {
        const ts = await slack.send(installation, work.envelope, reply.text, reply.private);
        await api(`work/${work.id}/settle`, {
          owner: work.owner,
          outcome: 'done',
          slackMessageId: ts,
        });
      } catch (error) {
        const retry =
          error instanceof SlackRequestError &&
          !error.uncertain &&
          error.retryAfterMs != null &&
          work.attempts + 1 < settings.config.maxDeliveryAttempts;
        await api(`work/${work.id}/settle`, {
          owner: work.owner,
          outcome: retry ? 'retry' : 'uncertain',
          delayMs: retry ? Math.min(error.retryAfterMs!, 86400000) : 0,
        });
        deps.reportError(retry ? 'delivery_rate_limited' : 'delivery_uncertain');
      }
    } catch {
      // Leave the durable running receipt intact. Expiry emits an interruption notice, never a new run.
      deps.reportError('run_interrupted');
    } finally {
      clearInterval(heartbeat);
      active.delete(work.id);
      await slack
        .status(installation, work.envelope, 'active')
        .catch(() => deps.reportError('status_failed'));
    }
  }
  async function tick() {
    try {
      if (stopped) return;
      const result = await api('work', {});
      if (!stopped && result != null) await process(workSchema.parse(result));
    } catch {
      deps.reportError('gateway_poll_failed');
    }
    if (!stopped)
      timer = setTimeout(() => {
        loop = tick();
      }, settings.config.pollMs);
  }
  await refresh();
  const app = express();
  app.get('/health', (_req, res) => {
    res.json({ ready: !stopped });
  });
  app.post(
    '/slack/:id/events',
    express.raw({ type: 'application/json', limit: '1mb' }),
    async (req, res) => {
      const installation = settings.installations.find(
        (item) => item.id === req.params.id && item.mode === 'http',
      );
      if (!installation || !Buffer.isBuffer(req.body)) {
        res.sendStatus(404);
        return;
      }
      if (
        !verifySlackSignature(
          req.body,
          req.get('x-slack-request-timestamp') ?? '',
          req.get('x-slack-signature') ?? '',
          installation.credentials.signingSecret,
          settings.config.signatureMaxAgeSeconds,
        )
      ) {
        res.sendStatus(401);
        return;
      }
      try {
        const callback = slackCallbackSchema.parse(JSON.parse(req.body.toString('utf8')));
        if (callback.type === 'url_verification') {
          res.json({ challenge: callback.challenge });
          return;
        }
        await receive(callback, installation);
        res.sendStatus(200);
      } catch {
        deps.reportError('http_event_failed');
        res.sendStatus(503);
      }
    },
  );
  const server = await new Promise<Server>((resolve, reject) => {
    const listener = app.listen(settings.config.port, () => resolve(listener));
    listener.once('error', reject);
  });
  timer = setTimeout(() => {
    loop = tick();
  }, 0);
  refreshTimer = setTimeout(() => {
    refreshLoop = syncSettings();
  }, settings.config.pollMs);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Gateway listener unavailable');
  return {
    port: address.port,
    async close() {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(refreshTimer);
      for (const { abort } of active.values()) abort.abort();
      for (const { socket } of sockets.values()) socket.close();
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      await Promise.all([loop, refreshLoop]);
    },
  };
}

export async function runChannelGateway(
  env: NodeJS.ProcessEnv,
  reportError: (code: string) => void,
): ReturnType<typeof startChannelGateway> {
  const gateway = await startChannelGateway({
    apiUrl: env.CHANNEL_GATEWAY_API_URL ?? 'http://127.0.0.1:3080',
    serviceToken: env.CHANNEL_GATEWAY_TOKEN ?? '',
    reportError,
  });
  for (const signal of ['SIGTERM', 'SIGINT'] as const)
    process.once(signal, () => {
      void gateway.close();
    });
  return gateway;
}
