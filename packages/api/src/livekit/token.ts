import { createHash } from 'node:crypto';
import { AccessToken, RoomAgentDispatch, RoomConfiguration } from 'livekit-server-sdk';

import type { TLiveKitConfig } from 'librechat-data-provider';

const ROOM_PREFIX = 'lc_';
const ROOM_HASH_LENGTH = 32;
const DEFAULT_TOKEN_TTL = '5m';
const DEFAULT_AGENT_NAME = 'librechat-voice';

export interface LiveKitCredentials {
  url: string;
  apiKey: string;
  apiSecret: string;
}

export interface MintRoomTokenParams {
  userId: string;
  conversationId: string;
  sessionId: string;
  config: TLiveKitConfig;
}

export interface MintedRoomToken {
  token: string;
  url: string;
  roomName: string;
  identity: string;
}

/**
 * Derived server-side, never accepted from the client: a caller-supplied room name would
 * let any authenticated user join another user's call. Deriving it from the conversation
 * also makes re-opening voice on the same conversation land in the same room.
 */
export const deriveRoomName = (userId: string, conversationId: string): string => {
  const digest = createHash('sha256').update(`${userId}:${conversationId}`).digest('hex');
  return `${ROOM_PREFIX}${digest.slice(0, ROOM_HASH_LENGTH)}`;
};

/** Absent credentials mean voice is unconfigured; callers degrade rather than throw. */
export const getLiveKitCredentials = (): LiveKitCredentials | null => {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) {
    return null;
  }
  return { url, apiKey, apiSecret };
};

export const isLiveKitEnabled = (config?: TLiveKitConfig): boolean =>
  config?.enabled === true && getLiveKitCredentials() != null;

/**
 * Dispatch metadata carries only an opaque `sessionId`. A LiveKit access token is a signed
 * but *unencrypted* JWT handed to the browser, so no LibreChat credential may ride along;
 * the worker exchanges the id for real context via the claim endpoint instead.
 *
 * `agentName` must be set or LiveKit dispatches an agent into every new room.
 */
export const mintRoomToken = async ({
  userId,
  conversationId,
  sessionId,
  config,
}: MintRoomTokenParams): Promise<MintedRoomToken> => {
  const credentials = getLiveKitCredentials();
  if (!credentials) {
    throw new Error('[livekit] LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET are required');
  }

  const roomName = deriveRoomName(userId, conversationId);
  const accessToken = new AccessToken(credentials.apiKey, credentials.apiSecret, {
    identity: userId,
    ttl: config.tokenTtl ?? DEFAULT_TOKEN_TTL,
  });

  accessToken.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: false,
  });

  accessToken.roomConfig = new RoomConfiguration({
    agents: [
      new RoomAgentDispatch({
        agentName: config.agentName ?? DEFAULT_AGENT_NAME,
        metadata: JSON.stringify({ sessionId }),
      }),
    ],
  });

  return {
    token: await accessToken.toJwt(),
    url: credentials.url,
    roomName,
    identity: userId,
  };
};
