import { useState, useEffect, useRef } from 'react';
import { useRecoilState } from 'recoil';
import { useSpeechToTextMutation } from '~/data-provider';
import useGetAudioSettings from './useGetAudioSettings';
import { useToastContext } from '~/Providers';
import store from '~/store';

const useSpeechToTextExternal = (
  setText: (text: string) => void,
  onTranscriptionComplete: (text: string) => void,
) => {
  const { showToast } = useToastContext();
  const { speechToTextEndpoint } = useGetAudioSettings();
  const isExternalSTTEnabled = speechToTextEndpoint === 'external';
  const audioStream = useRef<MediaStream | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const [permission, setPermission] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [isRequestBeingMade, setIsRequestBeingMade] = useState(false);
  const [audioMimeType, setAudioMimeType] = useState<string>(() => getBestSupportedMimeType());

  const [minDecibels] = useRecoilState(store.decibelValue);
  const [autoSendText] = useRecoilState(store.autoSendText);
  const [speechToText] = useRecoilState<boolean>(store.speechToText);
  const [autoTranscribeAudio] = useRecoilState<boolean>(store.autoTranscribeAudio);

  const { mutate: processAudio, isLoading: isProcessing } = useSpeechToTextMutation({
    onSuccess: (data) => {
      const extractedText = data.text;
      setText(extractedText);
      setIsRequestBeingMade(false);

      if (autoSendText > -1 && speechToText && extractedText.length > 0) {
        setTimeout(() => {
          onTranscriptionComplete(extractedText);
        }, autoSendText * 1000);
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

  function getBestSupportedMimeType() {
    const types = [
      'audio/webm',
      'audio/webm;codecs=opus',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/wav',
    ];

    for (const type of types) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent.toLowerCase();
      if (ua.indexOf('safari') !== -1 && ua.indexOf('chrome') === -1) {
        return 'audio/mp4';
      } else if (ua.indexOf('firefox') !== -1) {
        return 'audio/ogg';
      }
    }

    return 'audio/webm';
  }

  const getFileExtension = (mimeType: string) => {
    if (mimeType.includes('mp4')) {
      return 'm4a';
    } else if (mimeType.includes('ogg')) {
      return 'ogg';
    } else if (mimeType.includes('wav')) {
      return 'wav';
    } else {
      return 'webm';
    }
  };

  const cleanup = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.removeEventListener('dataavailable', (event: BlobEvent) => {
        audioChunks.push(event.data);
      });
      mediaRecorderRef.current.removeEventListener('stop', handleStop);
      mediaRecorderRef.current = null;
    }
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

  const handleStop = () => {
    if (audioChunks.length > 0) {
      const audioBlob = new Blob(audioChunks, { type: audioMimeType });
      const fileExtension = getFileExtension(audioMimeType);

      setAudioChunks([]);

      const formData = new FormData();
      formData.append('audio', audioBlob, `audio.${fileExtension}`);
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
        const bestMimeType = getBestSupportedMimeType();
        setAudioMimeType(bestMimeType);

        mediaRecorderRef.current = new MediaRecorder(audioStream.current, {
          mimeType: audioMimeType,
        });
        mediaRecorderRef.current.addEventListener('dataavailable', (event: BlobEvent) => {
          audioChunks.push(event.data);
        });
        mediaRecorderRef.current.addEventListener('stop', handleStop);
        mediaRecorderRef.current.start(100);
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
    if (!mediaRecorderRef.current) {
      return;
    }

    if (mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();

      audioStream.current?.getTracks().forEach((track) => track.stop());
      audioStream.current = null;

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
    if (e.shiftKey && e.altKey && e.code === 'KeyL' && isExternalSTTEnabled) {
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
  }, [isListening]);

  return {
    isListening,
    externalStopRecording,
    externalStartRecording,
    isLoading: isProcessing,
  };
};

export default useSpeechToTextExternal;
