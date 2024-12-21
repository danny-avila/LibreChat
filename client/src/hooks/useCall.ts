import { useState, useRef, useCallback } from 'react';
import { WebRTCService } from '../services/WebRTC/WebRTCService';
import type { RTCMessage } from '~/common';
import useWebSocket from './useWebSocket';

const SILENCE_THRESHOLD = -50;
const SILENCE_DURATION = 1000;

const useCall = () => {
  const { sendMessage: wsMessage } = useWebSocket();
  const [isCalling, setIsCalling] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const silenceStartRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const webrtcServiceRef = useRef<WebRTCService | null>(null);

  const sendAudioChunk = useCallback(() => {
    if (audioChunksRef.current.length === 0) {
      return;
    }

    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    // Send audio through WebRTC data channel
    webrtcServiceRef.current?.sendAudioChunk(audioBlob);
    // Signal processing start via WebSocket
    wsMessage({ type: 'processing-start' });

    audioChunksRef.current = [];
    setIsProcessing(true);
  }, [wsMessage]);

  const handleRTCMessage = useCallback((message: RTCMessage) => {
    if (message.type === 'audio-received') {
      // Backend confirmed audio receipt
      setIsProcessing(true);
    }
  }, []);

  const startCall = useCallback(async () => {
    // Initialize WebRTC with message handler
    webrtcServiceRef.current = new WebRTCService(handleRTCMessage);
    await webrtcServiceRef.current.initializeCall();

    // Signal call start via WebSocket
    wsMessage({ type: 'call-start' });

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContextRef.current = new AudioContext();
    const source = audioContextRef.current.createMediaStreamSource(stream);
    analyserRef.current = audioContextRef.current.createAnalyser();
    source.connect(analyserRef.current);

    // Start VAD monitoring
    intervalRef.current = window.setInterval(() => {
      if (!analyserRef.current || !isCalling) {
        return;
      }

      const data = new Float32Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getFloatFrequencyData(data);
      const avg = data.reduce((a, b) => a + b) / data.length;

      if (avg < SILENCE_THRESHOLD) {
        if (silenceStartRef.current === null) {
          silenceStartRef.current = Date.now();
        } else if (Date.now() - silenceStartRef.current > SILENCE_DURATION) {
          sendAudioChunk();
          silenceStartRef.current = null;
        }
      } else {
        silenceStartRef.current = null;
      }
    }, 100);

    setIsCalling(true);
  }, [handleRTCMessage, wsMessage, sendAudioChunk]);

  const hangUp = useCallback(async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    analyserRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;

    await webrtcServiceRef.current?.endCall();
    webrtcServiceRef.current = null;

    setIsCalling(false);
    setIsProcessing(false);
    wsMessage({ type: 'call-ended' });
  }, [wsMessage]);

  return {
    isCalling,
    isProcessing,
    startCall,
    hangUp,
  };
};

export default useCall;
