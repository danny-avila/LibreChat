import { useState, useRef, useCallback, useEffect } from 'react';
import { WebRTCService, ConnectionState } from '../services/WebRTC/WebRTCService';
import useWebSocket, { WebSocketEvents } from './useWebSocket';

interface CallError {
  code: string;
  message: string;
}

export enum CallState {
  IDLE = 'idle',
  CONNECTING = 'connecting',
  ACTIVE = 'active',
  ERROR = 'error',
  ENDED = 'ended',
}

interface CallStatus {
  callState: CallState;
  isConnecting: boolean;
  error: CallError | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  connectionQuality: 'good' | 'poor' | 'unknown';
}

const INITIAL_STATUS: CallStatus = {
  callState: CallState.IDLE,
  isConnecting: false,
  error: null,
  localStream: null,
  remoteStream: null,
  connectionQuality: 'unknown',
};

const useCall = () => {
  const { isConnected, sendMessage, addEventListener } = useWebSocket();
  const [status, setStatus] = useState<CallStatus>(INITIAL_STATUS);
  const webrtcServiceRef = useRef<WebRTCService | null>(null);
  const statsIntervalRef = useRef<NodeJS.Timeout>();

  const updateStatus = useCallback((updates: Partial<CallStatus>) => {
    setStatus((prev) => ({ ...prev, ...updates }));
  }, []);

  useEffect(() => {
    return () => {
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
      if (webrtcServiceRef.current) {
        webrtcServiceRef.current.close();
      }
    };
  }, []);

  const handleRemoteStream = (stream: MediaStream | null) => {
    console.log('[WebRTC] Remote stream received:', {
      stream: stream,
      active: stream?.active,
      tracks: stream?.getTracks().map((t) => ({
        kind: t.kind,
        enabled: t.enabled,
        muted: t.muted,
      })),
    });

    if (!stream) {
      console.error('[WebRTC] Received null remote stream');
      updateStatus({
        error: {
          code: 'NO_REMOTE_STREAM',
          message: 'No remote stream received',
        },
      });
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      console.error('[WebRTC] No audio tracks in remote stream');
      updateStatus({
        error: {
          code: 'NO_AUDIO_TRACKS',
          message: 'Remote stream contains no audio',
        },
      });
      return;
    }

    updateStatus({
      remoteStream: stream,
      callState: CallState.ACTIVE,
    });
  };

  const handleConnectionStateChange = useCallback(
    (state: ConnectionState) => {
      switch (state) {
        case ConnectionState.CONNECTED:
          updateStatus({
            callState: CallState.ACTIVE,
            isConnecting: false,
          });
          break;
        case ConnectionState.CONNECTING:
        case ConnectionState.RECONNECTING:
          updateStatus({
            callState: CallState.CONNECTING,
            isConnecting: true,
          });
          break;
        case ConnectionState.FAILED:
          updateStatus({
            callState: CallState.ERROR,
            isConnecting: false,
            error: {
              code: 'CONNECTION_FAILED',
              message: 'Connection failed. Please try again.',
            },
          });
          break;
        case ConnectionState.CLOSED:
          updateStatus({
            callState: CallState.ENDED,
            isConnecting: false,
            localStream: null,
            remoteStream: null,
          });
          break;
      }
    },
    [updateStatus],
  );

  const startConnectionMonitoring = useCallback(() => {
    if (!webrtcServiceRef.current) {
      return;
    }

    statsIntervalRef.current = setInterval(async () => {
      const stats = await webrtcServiceRef.current?.getStats();
      if (!stats) {
        return;
      }

      let totalRoundTripTime = 0;
      let samplesCount = 0;

      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report.currentRoundTripTime) {
          totalRoundTripTime += report.currentRoundTripTime;
          samplesCount++;
        }
      });

      const averageRTT = samplesCount > 0 ? totalRoundTripTime / samplesCount : 0;
      updateStatus({
        connectionQuality: averageRTT < 0.3 ? 'good' : 'poor',
      });
    }, 2000);
  }, [updateStatus]);

  const startCall = useCallback(async () => {
    if (!isConnected) {
      console.log('Cannot start call - not connected to server');
      updateStatus({
        callState: CallState.ERROR,
        error: {
          code: 'NOT_CONNECTED',
          message: 'Not connected to server',
        },
      });
      return;
    }

    try {
      console.log('Starting new call...');

      if (webrtcServiceRef.current) {
        console.log('Cleaning up existing WebRTC connection');
        webrtcServiceRef.current.close();
      }

      updateStatus({
        callState: CallState.CONNECTING,
        isConnecting: true,
        error: null,
      });

      // TODO: Remove debug or make it configurable
      webrtcServiceRef.current = new WebRTCService((message) => sendMessage(message), {
        debug: true,
      });

      webrtcServiceRef.current.on('connectionStateChange', (state: ConnectionState) => {
        console.log('WebRTC connection state changed:', state);
        handleConnectionStateChange(state);
      });

      webrtcServiceRef.current.on('remoteStream', handleRemoteStream);

      webrtcServiceRef.current.on('error', (error: string) => {
        console.error('WebRTC error:', error);
        updateStatus({
          callState: CallState.ERROR,
          isConnecting: false,
          error: {
            code: 'WEBRTC_ERROR',
            message: error,
          },
        });
      });

      console.log('Initializing WebRTC connection...');
      await webrtcServiceRef.current.initialize();
      console.log('WebRTC initialization complete');

      startConnectionMonitoring();
    } catch (error) {
      console.error('Failed to start call:', error);
      updateStatus({
        callState: CallState.ERROR,
        isConnecting: false,
        error: {
          code: 'INITIALIZATION_FAILED',
          message: error instanceof Error ? error.message : 'Failed to start call',
        },
      });
    }
  }, [
    isConnected,
    sendMessage,
    handleConnectionStateChange,
    startConnectionMonitoring,
    updateStatus,
  ]);

  const hangUp = useCallback(() => {
    if (webrtcServiceRef.current) {
      webrtcServiceRef.current.close();
      webrtcServiceRef.current = null;
    }
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
    }
    updateStatus({
      ...INITIAL_STATUS,
      callState: CallState.ENDED,
    });
  }, [updateStatus]);

  useEffect(() => {
    const cleanupFns = [
      addEventListener(WebSocketEvents.WEBRTC_ANSWER, (answer: RTCSessionDescriptionInit) => {
        console.log('Received WebRTC answer:', answer);
        webrtcServiceRef.current?.handleAnswer(answer);
      }),
      addEventListener(WebSocketEvents.ICE_CANDIDATE, (candidate: RTCIceCandidateInit) => {
        console.log('Received ICE candidate:', candidate);
        webrtcServiceRef.current?.addIceCandidate(candidate);
      }),
    ];

    return () => cleanupFns.forEach((fn) => fn());
  }, [addEventListener]);

  return {
    ...status,
    startCall,
    hangUp,
  };
};

export default useCall;
