import type { SttSelection, TtsSelection } from './providers.js';
import type { WorkerEnv } from './env.js';

export interface TurnDetectionSelection {
  model?: string;
  minEndpointingDelay?: number;
  maxEndpointingDelay?: number;
}

export interface VoiceSessionClaim {
  userId: string;
  conversationId: string;
  endpoint: string;
  agentId?: string;
  model?: string;
  voice?: string;
  callbackToken: string;
  stt: SttSelection;
  tts: TtsSelection;
  turnDetection?: TurnDetectionSelection;
}

/**
 * The LiveKit job metadata carries only an opaque session id — a LiveKit access token is a
 * signed but unencrypted JWT handed to the browser, so real context cannot ride along.
 * This exchanges the id for the call context over LibreChat's own HTTP API.
 */
export const claimSession = async (
  sessionId: string,
  env: WorkerEnv,
): Promise<VoiceSessionClaim> => {
  const response = await fetch(`${env.librechatUrl}/api/livekit/session/claim`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-livekit-worker-secret': env.workerSecret,
    },
    body: JSON.stringify({ sessionId }),
  });

  if (!response.ok) {
    throw new Error(
      `[livekit-agent] session claim failed (${response.status}): ${await response.text()}`,
    );
  }

  return (await response.json()) as VoiceSessionClaim;
};

export const readSessionId = (metadata: string | undefined): string => {
  if (!metadata) {
    throw new Error('[livekit-agent] job dispatched without metadata; is agentName set?');
  }
  const parsed: unknown = JSON.parse(metadata);
  const sessionId =
    typeof parsed === 'object' && parsed !== null
      ? (parsed as { sessionId?: unknown }).sessionId
      : undefined;

  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new Error('[livekit-agent] job metadata is missing sessionId');
  }
  return sessionId;
};
