import { z } from 'zod';
import type { ChannelEnvelope, ChannelGatewayInstallation } from './channels';

const slackResponseSchema = z
  .object({ ok: z.boolean(), error: z.string().optional() })
  .passthrough();
export class SlackRequestError extends Error {
  constructor(
    readonly retryAfterMs: number | null,
    readonly uncertain: boolean,
  ) {
    super('Slack request failed');
  }
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
