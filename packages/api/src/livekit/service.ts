import { randomUUID } from 'node:crypto';
import { logger } from '@librechat/data-schemas';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TLiveKitConfig } from 'librechat-data-provider';
import type { Request, Response } from 'express';
import { deriveRoomName, isLiveKitEnabled, mintRoomToken } from './token';
import { WORKER_SECRET_HEADER, isWorkerSecretValid } from './claim';
import { claimVoiceSession, createVoiceSession } from './session';
import { generateShortLivedToken } from '~/crypto/jwt';

const DEFAULT_MAX_SESSION_DURATION = 1800;

export interface VoiceTokenRequestBody {
  conversationId?: string;
  endpoint?: string;
  agentId?: string;
  model?: string;
  voice?: string;
}

export interface VoiceTokenResponse {
  token: string;
  url: string;
  roomName: string;
  conversationId: string;
}

export interface VoiceClaimResponse {
  userId: string;
  conversationId: string;
  endpoint: string;
  agentId?: string;
  model?: string;
  voice?: string;
  callbackToken: string;
  stt: TLiveKitConfig['stt'];
  tts: TLiveKitConfig['tts'];
  turnDetection?: TLiveKitConfig['turnDetection'];
}

interface VoiceRequest extends Request {
  body: VoiceTokenRequestBody;
  config?: { speech?: { livekit?: TLiveKitConfig } };
  user?: { id: string };
}

interface ClaimRequest extends Request {
  body: { sessionId?: string };
}

export const createVoiceHandlers = () => ({
  /**
   * Mints a room token for the calling user. The room and identity are derived from
   * `req.user.id` server-side; nothing in the body may influence them.
   *
   * A voice conversation needs its id before the first turn so the room is stable, and
   * `ResumableAgentController` honours a client-supplied `conversationId` (using it as the
   * `streamId`), so generating it here keeps client, worker, and run in agreement.
   */
  mintToken: async (req: VoiceRequest, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const config = req.config?.speech?.livekit;
    if (!isLiveKitEnabled(config)) {
      res.status(404).json({ message: 'Voice is not configured' });
      return;
    }

    const { conversationId: requestedConversationId, endpoint, agentId, model, voice } = req.body;
    const conversationId =
      requestedConversationId && requestedConversationId !== 'new'
        ? requestedConversationId
        : randomUUID();

    try {
      const sessionId = await createVoiceSession({
        userId,
        conversationId,
        roomName: deriveRoomName(userId, conversationId),
        endpoint: endpoint ?? EModelEndpoint.agents,
        agentId,
        model,
        voice,
        maxSessionDuration: config?.maxSessionDuration ?? DEFAULT_MAX_SESSION_DURATION,
        stt: (config as TLiveKitConfig).stt,
        tts: (config as TLiveKitConfig).tts,
        turnDetection: config?.turnDetection,
      });

      const minted = await mintRoomToken({
        userId,
        conversationId,
        sessionId,
        config: config as TLiveKitConfig,
      });

      res.status(200).json({
        token: minted.token,
        url: minted.url,
        roomName: minted.roomName,
        conversationId,
      } satisfies VoiceTokenResponse);
    } catch (error) {
      logger.error('[livekit] Failed to mint room token', error);
      res.status(500).json({ message: 'Failed to start voice session' });
    }
  },

  /**
   * Exchanges the opaque `sessionId` embedded in the LiveKit dispatch for the real call
   * context. This exists so no LibreChat credential ever transits the browser or LiveKit:
   * the access token is a signed but unencrypted JWT handed to the client.
   *
   * Authenticated by a shared worker secret rather than `requireJwtAuth` — the caller is
   * infrastructure, not a user. The claim is single-use, so a replayed id gets nothing.
   */
  claimSession: async (req: ClaimRequest, res: Response): Promise<void> => {
    const workerSecret = process.env.LIVEKIT_WORKER_SECRET;
    if (!workerSecret) {
      res.status(404).json({ message: 'Voice is not configured' });
      return;
    }

    if (!isWorkerSecretValid(req.headers[WORKER_SECRET_HEADER], workerSecret)) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const { sessionId } = req.body;
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ message: 'sessionId is required' });
      return;
    }

    const record = await claimVoiceSession(sessionId);
    if (!record) {
      res.status(404).json({ message: 'Unknown or already-claimed session' });
      return;
    }

    res.status(200).json({
      userId: record.userId,
      conversationId: record.conversationId,
      endpoint: record.endpoint,
      agentId: record.agentId,
      model: record.model,
      voice: record.voice,
      callbackToken: generateShortLivedToken(record.userId, `${record.maxSessionDuration}s`),
      stt: record.stt,
      tts: record.tts,
      turnDetection: record.turnDetection,
    } satisfies VoiceClaimResponse);
  },
});
