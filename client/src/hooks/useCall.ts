import { useState, useRef, useCallback } from 'react';
import useWebSocket from './useWebSocket';
import { WebRTCService } from '../services/WebRTC/WebRTCService';

const SILENCE_THRESHOLD = -50;
const SILENCE_DURATION = 1000;

const useCall = () => {
  const { sendMessage } = useWebSocket();
  const [isCalling, setIsCalling] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const webrtcServiceRef = useRef<WebRTCService | null>(null);

  const checkSilence = useCallback(() => {
    if (!analyserRef.current || !isCalling) {
      return;
    }
    const data = new Float32Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getFloatFrequencyData(data);
    const avg = data.reduce((a, b) => a + b) / data.length;
    if (avg < SILENCE_THRESHOLD) {
      if (!silenceStartRef.current) {
        silenceStartRef.current = Date.now();
      } else if (Date.now() - silenceStartRef.current > SILENCE_DURATION) {
        sendMessage({ type: 'request-response' });
        silenceStartRef.current = null;
      }
    } else {
      silenceStartRef.current = null;
    }
  }, [isCalling, sendMessage]);

  const startCall = useCallback(async () => {
    webrtcServiceRef.current = new WebRTCService(sendMessage);
    await webrtcServiceRef.current.initializeCall();

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContextRef.current = new AudioContext();
    const source = audioContextRef.current.createMediaStreamSource(stream);
    analyserRef.current = audioContextRef.current.createAnalyser();
    source.connect(analyserRef.current);

    intervalRef.current = window.setInterval(checkSilence, 100);
    setIsCalling(true);
  }, [checkSilence, sendMessage]);

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
    sendMessage({ type: 'call-ended' });
  }, [sendMessage]);

  return { isCalling, startCall, hangUp };
};

export default useCall;
