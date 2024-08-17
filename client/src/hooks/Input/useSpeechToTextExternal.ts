import { useState, useEffect, useRef } from 'react';
import { useRecoilState } from 'recoil';
import { useSpeechToTextMutation } from '~/data-provider';
import { useToastContext } from '~/Providers';
import store from '~/store';
import * as annyang from 'annyang';
import useGetAudioSettings from './useGetAudioSettings';

const useSpeechToTextExternal = (onTranscriptionComplete: (text: string) => void) => {
  const { showToast } = useToastContext();
  const { externalSpeechToText } = useGetAudioSettings();
  const [speechToText] = useRecoilState<boolean>(store.speechToText);
  const [autoTranscribeAudio] = useRecoilState<boolean>(store.autoTranscribeAudio);
  const [autoSendText] = useRecoilState(store.autoSendText);

  const [text, setText] = useState<string>('');
  const [isListening, setIsListening] = useState(false);
  const [isStartngStream, setIsStartStream] = useState(false);
  const [permission, setPermission] = useState(false);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [isRequestBeingMade, setIsRequestBeingMade] = useState(false);
  const [minDecibels] = useRecoilState(store.decibelValue);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStream = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const [isAudioDetected, setIsAudioDetected] = useState(false);

  const { mutate: processAudio, isLoading: isProcessing } = useSpeechToTextMutation({
    onSuccess: (data) => {
      const extractedText = data.text;
      setIsStartStream(true);
      setText(extractedText);
      setIsRequestBeingMade(false);
      if (autoSendText && speechToText && extractedText.length > 0) {
        setTimeout(() => {
          onTranscriptionComplete(extractedText);
        }, 3000);
      }
    },
    onError: () => {
      showToast({
        message: 'An error occurred while processing the audio, maybe the audio was too short',
        status: 'error',
      });
      setIsRequestBeingMade(false);
    },
  });

  const cleanup = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.removeEventListener('dataavailable', handleDataAvailable);
      mediaRecorderRef.current.removeEventListener('stop', handleStop);
      mediaRecorderRef.current = null;
    }
  };

  const clearText = () => {
    setText('');
  };

  const getMicrophonePermission = async () => {
    try {
      const streamData = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      setPermission(true);
      audioStream.current = streamData ?? null;
    } catch (err) {
      setPermission(false);
    }
  };

  const handleDataAvailable = (event: BlobEvent) => {
    if (event.data.size > 0) {
      audioChunks.push(event.data);
    } else {
      showToast({ message: 'No audio data available', status: 'warning' });
    }
  };

  const handleStop = () => {
    if (audioChunks.length > 0) {
      const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });

      setAudioChunks([]);

      const formData = new FormData();
      formData.append('audio', audioBlob, 'audio.wav');
      setIsRequestBeingMade(true);
      cleanup();
      processAudio(formData);
    } else {
      showToast({ message: 'The audio was too short', status: 'warning' });
    }
  };

  const monitorSilence = (stream: MediaStream, stopRecording: () => void) => {
    const audioContext = new AudioContext();
    const audioStreamSource = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.minDecibels = minDecibels;
    audioStreamSource.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const domainData = new Uint8Array(bufferLength);
    let lastSoundTime = Date.now();

    const detectSound = () => {
      analyser.getByteFrequencyData(domainData);
      const isSoundDetected = domainData.some((value) => value > 0);

      if (isSoundDetected) {
        lastSoundTime = Date.now();
      }

      const timeSinceLastSound = Date.now() - lastSoundTime;
      const isOverSilenceThreshold = timeSinceLastSound > 3000;

      if (isOverSilenceThreshold) {
        stopRecording();
        return;
      }

      animationFrameIdRef.current = window.requestAnimationFrame(detectSound);
    };

    animationFrameIdRef.current = window.requestAnimationFrame(detectSound);
  };

  const startRecording = async () => {
    if (annyang) {
      setIsListening(true);
      annyang.start({ autoRestart: true, continuous: true });

      annyang.addCallback('soundstart', () => {
        console.log('Sound detected');
        setIsAudioDetected(true);
      });

      annyang.addCallback('soundend', () => {
        console.log('Sound ended');
        setIsAudioDetected(false);
      });

      annyang.addCallback('end', () => {
        console.log('Annyang ended');
        setIsListening(false);
        setIsAudioDetected(false);
      });
    }
    if (isRequestBeingMade) {
      showToast({ message: 'A request is already being made. Please wait.', status: 'warning' });
      return;
    }

    if (!audioStream.current) {
      await getMicrophonePermission();
    }

    if (audioStream.current) {
      try {
        setAudioChunks([]);
        mediaRecorderRef.current = new MediaRecorder(audioStream.current);
        mediaRecorderRef.current.addEventListener('dataavailable', handleDataAvailable);
        mediaRecorderRef.current.addEventListener('stop', handleStop);
        mediaRecorderRef.current.start(100);
        setIsAudioDetected(true);
        if (!audioContextRef.current && autoTranscribeAudio && speechToText) {
          monitorSilence(audioStream.current, stopRecording);
        }
        setIsListening(true);
      } catch (error) {
        showToast({ message: `Error starting recording: ${error}`, status: 'error' });
      }
    } else {
      showToast({ message: 'Microphone permission not granted', status: 'error' });
    }
  };

  const stopRecording = () => {
    if (annyang) {
      annyang.abort();
      setIsListening(false);
      setIsAudioDetected(false);
    }

    if (!mediaRecorderRef.current) {
      return;
    }

    if (mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();

      audioStream.current?.getTracks().forEach((track) => track.stop());
      audioStream.current = null;
      setIsAudioDetected(false);

      if (animationFrameIdRef.current !== null) {
        window.cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }

      setIsListening(false);
    } else {
      showToast({ message: 'MediaRecorder is not recording', status: 'error' });
    }
  };

  const externalStartRecording = () => {
    if (isListening) {
      showToast({ message: 'Already listening. Please stop recording first.', status: 'warning' });
      return;
    }

    startRecording();
  };

  const externalStopRecording = () => {
    if (!isListening) {
      showToast({
        message: 'Not currently recording. Please start recording first.',
        status: 'warning',
      });
      return;
    }

    stopRecording();
  };

  const handleKeyDown = async (e: KeyboardEvent) => {
    if (e.shiftKey && e.altKey && e.code === 'KeyL' && !externalSpeechToText) {
      if (!window.MediaRecorder) {
        showToast({ message: 'MediaRecorder is not supported in this browser', status: 'error' });
        return;
      }

      if (permission === false) {
        await getMicrophonePermission();
      }

      if (isListening) {
        stopRecording();
      } else {
        startRecording();
      }

      e.preventDefault();
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListening]);

  return {
    isListening,
    isLoading: isProcessing,
    text,
    externalStartRecording,
    externalStopRecording,
    clearText,
    isAudioDetected,
    isStartngStream,
  };
};

export default useSpeechToTextExternal;
