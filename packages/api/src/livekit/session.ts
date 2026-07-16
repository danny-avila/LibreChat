import { randomUUID } from 'node:crypto';
import { Time, CacheKeys } from 'librechat-data-provider';

import type { TLiveKitConfig } from 'librechat-data-provider';

import { standardCache } from '~/cache';

/**
 * Sole owner of the {@link CacheKeys.LIVEKIT_SESSION} namespace. Do NOT also register it in
 * `api/cache/getLogStores.js`: without Redis, `standardCache` backs each instance with its
 * own in-memory Map, so a second instance of the same namespace would silently not share
 * state and every claim would miss.
 */
const sessionCache = standardCache(CacheKeys.LIVEKIT_SESSION, Time.FIVE_MINUTES);

export interface VoiceSessionContext {
  userId: string;
  conversationId: string;
  roomName: string;
  endpoint: string;
  agentId?: string;
  model?: string;
  voice?: string;
  /**
   * Bounds the callback token the worker receives at claim time. A call outlives the
   * user's own JWT (which rotates roughly every 15 minutes), so the worker needs a
   * credential scoped to the call rather than to the request that started it.
   */
  maxSessionDuration: number;
  /**
   * Carried on the session so librechat.yaml stays the single source of truth for which
   * providers a call uses; the worker supplies only their credentials.
   */
  stt: TLiveKitConfig['stt'];
  tts: TLiveKitConfig['tts'];
  turnDetection?: TLiveKitConfig['turnDetection'];
}

export interface VoiceSessionRecord extends VoiceSessionContext {
  createdAt: number;
}

export const createVoiceSession = async (context: VoiceSessionContext): Promise<string> => {
  const sessionId = randomUUID();
  const record: VoiceSessionRecord = { ...context, createdAt: Date.now() };
  await sessionCache.set(sessionId, record);
  return sessionId;
};

/**
 * Single-use: the record is deleted as it is read, so a replayed `sessionId` finds nothing.
 * `delete` is the claim primitive rather than a `claimed` flag because it is atomic under
 * Redis (DEL returns 1 to exactly one caller), which a read-modify-write would not be.
 */
export const claimVoiceSession = async (sessionId: string): Promise<VoiceSessionRecord | null> => {
  const record = await sessionCache.get(sessionId);
  if (!record) {
    return null;
  }
  const claimed = await sessionCache.delete(sessionId);
  if (!claimed) {
    return null;
  }
  return record as VoiceSessionRecord;
};
