import { useRef, useCallback } from 'react';
import { WebRTCService } from '../services/WebRTC/WebRTCService';
import type { RTCMessage } from '~/common';
import useWebSocket from './useWebSocket';

const useWebRTC = () => {
  const { sendMessage } = useWebSocket();
  const webrtcServiceRef = useRef<WebRTCService | null>(null);

  const handleRTCMessage = useCallback(
    (message: RTCMessage) => {
      switch (message.type) {
        case 'audio-chunk':
          sendMessage({ type: 'processing-start' });
          break;
        case 'transcription':
        case 'llm-response':
        case 'tts-chunk':
          // TODO: Handle streaming responses
          break;
      }
    },
    [sendMessage],
  );

  const startLocalStream = async () => {
    try {
      webrtcServiceRef.current = new WebRTCService(handleRTCMessage);
      await webrtcServiceRef.current.initializeCall();
      sendMessage({ type: 'call-start' });
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const stopLocalStream = useCallback(() => {
    webrtcServiceRef.current?.endCall();
    webrtcServiceRef.current = null;
    sendMessage({ type: 'call-ended' });
  }, [sendMessage]);

  return { startLocalStream, stopLocalStream };
};

export default useWebRTC;
