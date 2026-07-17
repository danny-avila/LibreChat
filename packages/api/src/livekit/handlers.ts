import { AccessToken } from 'livekit-server-sdk';
import type { Response } from 'express';
import mongoose from 'mongoose';
import type { ServerRequest } from '~/types';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'devsecret';
const LIVEKIT_WS_URL = process.env.LIVEKIT_WS_URL || 'ws://localhost:7880';

export function createLiveKitHandlers(): {
  getLiveKitConfig: (req: ServerRequest, res: Response) => Response;
  generateLiveKitToken: (req: ServerRequest, res: Response) => Promise<Response>;
} {
  // GET /api/livekit/config
  function getLiveKitConfig(_req: ServerRequest, res: Response) {
    return res.json({ wsUrl: LIVEKIT_WS_URL });
  }

  // POST /api/livekit/token
  async function generateLiveKitToken(req: ServerRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const conversationId = req.body.conversationId;
      if (conversationId && conversationId !== 'new') {
        const Conversation = mongoose.models.Conversation;
        const exists = await Conversation.exists({ conversationId, user: user.id });
        if (!exists) {
          const newConvo = new Conversation({
            conversationId,
            user: user.id,
            endpoint: req.body.endpoint || 'agents',
            title: 'Voice Call',
            messages: [],
          });
          await newConvo.save();
        }
      }

      const roomName = `hstai-${user.id}-${Date.now()}`;

      const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity: user.id,
        name: user.name || user.username || 'User',
        metadata: JSON.stringify({
          userId: user.id,
          conversationId: req.body.conversationId || null,
        }),
      });

      token.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: false,
      });

      return res.json({
        token: await token.toJwt(),
        roomName,
        wsUrl: LIVEKIT_WS_URL,
      });
    } catch (err) {
      console.error('[LiveKit] Token generation error:', err);
      return res.status(500).json({ error: 'Failed to generate LiveKit token' });
    }
  }

  return {
    getLiveKitConfig,
    generateLiveKitToken,
  };
}
