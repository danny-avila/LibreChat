import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceSessionRequest } from 'librechat-data-provider';
import type { Room, RemoteTrack } from 'livekit-client';
import { useStartVoiceSession } from '~/data-provider';

export type VoiceState = 'idle' | 'connecting' | 'connected' | 'error';

export interface UseVoiceSessionResult {
  state: VoiceState;
  error: string | null;
  micEnabled: boolean;
  conversationId: string | null;
  connect: (payload: VoiceSessionRequest) => Promise<void>;
  disconnect: () => Promise<void>;
  toggleMic: () => Promise<void>;
}

/**
 * Owns the browser side of a call.
 *
 * Hanging up closes the media plane only — the conversation is an ordinary LibreChat
 * conversation that keeps existing, stays in the sidebar, and can be continued in text.
 */
export const useVoiceSession = (): UseVoiceSessionResult => {
  const startSession = useStartVoiceSession();
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  const audioRef = useRef<HTMLAudioElement[]>([]);

  const teardown = useCallback(async () => {
    for (const element of audioRef.current) {
      element.remove();
    }
    audioRef.current = [];
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      await room.disconnect();
    }
  }, []);

  const connect = useCallback(
    async (payload: VoiceSessionRequest) => {
      setState('connecting');
      setError(null);
      try {
        const session = await startSession.mutateAsync(payload);
        setConversationId(session.conversationId);

        /**
         * Loaded on demand: livekit-client is the WebRTC engine at ~250 KB gzip and is not
         * tree-shakable, so a static import would tax every page load for a feature most
         * sessions never open.
         */
        const { Room, RoomEvent, Track } = await import('livekit-client');

        const room = new Room();
        roomRef.current = room;

        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (track.kind !== Track.Kind.Audio) {
            return;
          }
          const element = track.attach();
          element.style.display = 'none';
          document.body.appendChild(element);
          audioRef.current.push(element as HTMLAudioElement);
        });

        room.on(RoomEvent.Disconnected, () => {
          setState('idle');
          setMicEnabled(false);
        });

        await room.connect(session.url, session.token);

        /**
         * Browsers gate audio playback on a user gesture. `connect` is only ever called
         * from a click handler, which is what makes this legal — an auto-join on page load
         * would be silently muted.
         */
        await room.startAudio();
        await room.localParticipant.setMicrophoneEnabled(true);

        setMicEnabled(true);
        setState('connected');
      } catch (caught) {
        await teardown();
        setError(caught instanceof Error ? caught.message : 'Failed to start voice');
        setState('error');
      }
    },
    [startSession, teardown],
  );

  const disconnect = useCallback(async () => {
    await teardown();
    setState('idle');
    setMicEnabled(false);
  }, [teardown]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) {
      return;
    }
    const next = !micEnabled;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicEnabled(next);
  }, [micEnabled]);

  /** A room outlives the component; leaving it connected would keep a billable call open. */
  useEffect(() => () => void teardown(), [teardown]);

  return { state, error, micEnabled, conversationId, connect, disconnect, toggleMic };
};
