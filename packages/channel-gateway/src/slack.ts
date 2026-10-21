import { z } from 'zod';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ChannelEnvelope, ChannelGatewayInstallation } from 'librechat-data-provider';

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
  return (
    /^v0=[a-f0-9]{64}$/.test(signature) &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  );
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
