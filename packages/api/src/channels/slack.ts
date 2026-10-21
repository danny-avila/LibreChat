import { z } from 'zod';
import { createHmac } from 'node:crypto';
import type { ChannelEnvelope, ChannelGatewayInstallation } from 'librechat-data-provider';
import { channelSecretMatches } from './crypto';

const slackResponseSchema = z
  .object({ ok: z.boolean(), error: z.string().optional() })
  .passthrough();
interface SlackEvent {
  type: string;
  user?: string;
  bot_id?: string;
  subtype?: string;
  channel?: string;
  channel_type?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  event_ts?: string;
}
export interface SlackCallback {
  type: 'url_verification' | 'event_callback';
  challenge?: string;
  api_app_id?: string;
  team_id?: string;
  event_id?: string;
  event?: SlackEvent;
}
const slackEventSchema: z.ZodType<SlackEvent> = z.object({
  type: z.string(),
  user: z.string().optional(),
  bot_id: z.string().optional(),
  subtype: z.string().optional(),
  channel: z.string().optional(),
  channel_type: z.string().optional(),
  text: z.string().optional(),
  ts: z.string().optional(),
  thread_ts: z.string().optional(),
  event_ts: z.string().optional(),
});
export const slackCallbackSchema: z.ZodType<SlackCallback> = z.object({
  type: z.enum(['url_verification', 'event_callback']),
  challenge: z.string().optional(),
  api_app_id: z.string().optional(),
  team_id: z.string().optional(),
  event_id: z.string().optional(),
  event: slackEventSchema.optional(),
});

export class SlackRequestError extends Error {
  constructor(
    readonly retryAfterMs: number | null,
    readonly uncertain: boolean,
  ) {
    super('Slack request failed');
  }
}

export function verifySlackSignature(
  raw: Buffer,
  timestamp: string,
  signature: string,
  secret: string,
  maxAgeSeconds: number,
  now: number = Date.now(),
): boolean {
  if (!/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > maxAgeSeconds)
    return false;
  const expected = `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:`).update(raw).digest('hex')}`;
  return channelSecretMatches(signature, expected);
}

export function normalizeSlackMessage(
  callback: SlackCallback,
  installation: ChannelGatewayInstallation,
): ChannelEnvelope | null {
  const event = callback.event;
  if (
    callback.api_app_id !== installation.appId ||
    callback.team_id !== installation.teamId ||
    !callback.event_id ||
    !event ||
    !event.user ||
    !event.channel ||
    !event.ts ||
    !event.text ||
    event.bot_id ||
    (event.subtype && !['thread_broadcast', 'file_share'].includes(event.subtype)) ||
    event.user === installation.botUserId ||
    !Number.isFinite(Number(event.ts)) ||
    !['message', 'app_mention'].includes(event.type)
  )
    return null;
  const isDirect = event.channel_type === 'im' || event.channel.startsWith('D');
  const mention = event.type === 'app_mention';
  if (!isDirect && !mention && !event.thread_ts) return null;
  return {
    provider: 'slack',
    eventId: `${event.channel}:${event.ts}`,
    installationId: installation.id,
    teamId: installation.teamId,
    senderId: event.user,
    destinationId: event.channel,
    threadId: event.thread_ts ?? event.ts,
    messageId: event.ts,
    sentAt: Number(event.ts),
    isDirect,
    startsThread: isDirect || mention,
    text: event.text.replaceAll(`<@${installation.botUserId}>`, '').trim(),
  };
}

export function createSlackClient(
  fetcher: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
  timeoutMs: number,
) {
  async function call(
    method: string,
    token: string,
    body: object,
  ): Promise<{ ok: boolean; error?: string; [key: string]: unknown }> {
    let response: globalThis.Response;
    try {
      response = await fetcher(`https://slack.com/api/${method}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new SlackRequestError(null, true);
    }
    if (response.status === 429) {
      const seconds = Number(response.headers.get('retry-after'));
      throw new SlackRequestError(
        Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60000,
        false,
      );
    }
    if (!response.ok) throw new SlackRequestError(null, true);
    const result = slackResponseSchema.safeParse(await response.json().catch(() => null));
    if (!result.success) throw new SlackRequestError(null, true);
    if (!result.data.ok) throw new SlackRequestError(null, false);
    return result.data;
  }
  return {
    call: (
      method: string,
      token: string,
      body: object,
    ): Promise<{ ok: boolean; error?: string; [key: string]: unknown }> =>
      call(method, token, body),
    async identity(token: string): Promise<{ teamId: string; botUserId: string; appId: string }> {
      const auth = z
        .object({ team_id: z.string(), user_id: z.string(), bot_id: z.string() })
        .parse(await call('auth.test', token, {}));
      const info = z
        .object({ bot: z.object({ app_id: z.string() }) })
        .parse(await call('bots.info', token, { bot: auth.bot_id }));
      return { teamId: auth.team_id, botUserId: auth.user_id, appId: info.bot.app_id };
    },
    async status(
      installation: ChannelGatewayInstallation,
      envelope: ChannelEnvelope,
      status: 'processing' | 'active',
    ): Promise<void> {
      await call('agents.sessions.setStatus', installation.credentials.botToken, {
        channel_id: envelope.destinationId,
        thread_ts: envelope.threadId,
        status,
      });
    },
    async send(
      installation: ChannelGatewayInstallation,
      envelope: ChannelEnvelope,
      text: string,
      privateReply: boolean,
    ): Promise<string> {
      let channel = envelope.destinationId;
      if (privateReply && !envelope.isDirect) {
        const result = z.object({ channel: z.object({ id: z.string() }) }).parse(
          await call('conversations.open', installation.credentials.botToken, {
            users: envelope.senderId,
          }),
        );
        channel = result.channel.id;
      }
      const result = z.object({ ts: z.string() }).parse(
        await call('chat.postMessage', installation.credentials.botToken, {
          channel,
          text,
          ...(!privateReply || envelope.isDirect ? { thread_ts: envelope.threadId } : {}),
          unfurl_links: false,
          unfurl_media: false,
        }),
      );
      return result.ts;
    },
  };
}
