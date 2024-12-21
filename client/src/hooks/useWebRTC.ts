import { useRef, useCallback } from 'react';
import useWebSocket from './useWebSocket';

const SILENCE_THRESHOLD = -50;
const SILENCE_DURATION = 1000;

const useWebRTC = () => {
  const { sendMessage } = useWebSocket();
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceStartTime = useRef<number | null>(null);
  const isProcessingRef = useRef(false);

  const log = (msg: string) => console.log(`[WebRTC ${new Date().toISOString()}] ${msg}`);

  const processAudioLevel = () => {
    if (!analyserRef.current || !isProcessingRef.current) {
      return;
    }

    const dataArray = new Float32Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getFloatFrequencyData(dataArray);
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;

    if (average < SILENCE_THRESHOLD) {
      if (!silenceStartTime.current) {
        silenceStartTime.current = Date.now();
        log(`Silence started: ${average}dB`);
      } else if (Date.now() - silenceStartTime.current > SILENCE_DURATION) {
        log('Silence threshold reached - requesting response');
        sendMessage({ type: 'request-response' });
        silenceStartTime.current = null;
      }
    } else {
      silenceStartTime.current = null;
    }

    requestAnimationFrame(processAudioLevel);
  };

  const startLocalStream = async () => {
    try {
      log('Starting audio capture');
      localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });

      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(localStreamRef.current);
      analyserRef.current = audioContextRef.current.createAnalyser();

      source.connect(analyserRef.current);
      isProcessingRef.current = true;
      processAudioLevel();

      log('Audio capture started');
    } catch (error) {
      log(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  };

  const stopLocalStream = useCallback(() => {
    log('Stopping audio capture');
    isProcessingRef.current = false;
    audioContextRef.current?.close();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());

    localStreamRef.current = null;
    audioContextRef.current = null;
    analyserRef.current = null;
    silenceStartTime.current = null;
  }, []);

  return { startLocalStream, stopLocalStream };
};

export default useWebRTC;
