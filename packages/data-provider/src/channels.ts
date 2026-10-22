import { z } from 'zod';

/** Disabled unless an operator configures a gateway and its service credential. */
export const channelsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  gatewayUrl: z.string().url().optional(),
  publicUrl: z.string().url().optional(),
  serviceTokenEnv: z.string().default('CHANNEL_GATEWAY_TOKEN'),
  port: z.number().int().min(0).max(65535).default(3091),
  pollMs: z.number().int().min(250).default(1000),
  leaseMs: z.number().int().min(15000).default(60000),
  requestTimeoutMs: z.number().int().min(1000).default(15000),
  runTimeoutMs: z.number().int().min(1000).default(600000),
  challengeTtlMs: z.number().int().min(1000).default(600000),
  signatureMaxAgeSeconds: z.number().int().min(1).max(300).default(300),
  maxMessageChars: z.number().int().min(1).max(30000).default(12000),
  maxReplyChars: z.number().int().min(1000).max(39000).default(30000),
  maxHistoryChars: z.number().int().min(1000).max(500000).default(48000),
  maxDeliveryAttempts: z.number().int().min(1).max(20).default(5),
});
export type ChannelsConfig = z.infer<typeof channelsConfigSchema>;

export const channelConnectionSchema = z.object({
  agentId: z.string().min(1).max(200),
  appId: z.string().regex(/^A[A-Z0-9]+$/),
  botToken: z.string().startsWith('xoxb-').max(1000).optional(),
  signingSecret: z.string().min(16).max(200).optional(),
  appToken: z.string().startsWith('xapp-').max(1000).optional(),
  mode: z.enum(['http', 'socket']).default('http'),
  enabled: z.boolean().default(false),
});
export type ChannelConnectionInput = z.infer<typeof channelConnectionSchema>;

export interface ChannelConnection {
  id: string;
  agentId: string;
  name: string;
  appId: string;
  teamId: string;
  botUserId: string;
  mode: 'http' | 'socket';
  enabled: boolean;
  linked: boolean;
}

/** Provider adapters supply identity and destination; model output cannot change them. */
export const channelEnvelopeSchema = z.object({
  provider: z.string().min(1).max(60),
  eventId: z.string().min(1).max(200),
  installationId: z.string().uuid(),
  teamId: z.string().min(1).max(200),
  senderId: z.string().min(1).max(200),
  destinationId: z.string().min(1).max(200),
  threadId: z.string().min(1).max(200),
  messageId: z.string().min(1).max(200),
  sentAt: z.number().finite().nonnegative(),
  isDirect: z.boolean(),
  startsThread: z.boolean(),
  text: z.string().min(1).max(30000),
});
export type ChannelEnvelope = z.infer<typeof channelEnvelopeSchema>;

export interface ChannelReply {
  text: string;
  private: boolean;
}

export interface ChannelWork {
  id: string;
  owner: string;
  status: 'claimed' | 'running' | 'ready' | 'sending' | 'cleanup';
  envelope: ChannelEnvelope;
  reply?: ChannelReply;
  attempts: number;
  userId?: string;
}

export interface ChannelCredentials {
  botToken: string;
  signingSecret: string;
  appToken?: string;
}

export interface ChannelGatewayInstallation extends Omit<ChannelConnection, 'linked'> {
  credentials: ChannelCredentials;
}

export interface ChannelGatewaySettings {
  config: ChannelsConfig;
  installations: ChannelGatewayInstallation[];
}

export interface ChannelLinkInfo {
  reauthUrl?: string;
  name: string;
  teamId: string;
  senderId: string;
}

export { createSlackClient, SlackRequestError } from './channelSlack';
