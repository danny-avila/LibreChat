import { useState, useEffect, useRef } from 'react';
import { useRecoilState } from 'recoil';
import { useToastContext } from '@librechat/client';
import { useSpeechToTextMutation } from '~/data-provider';
import useGetAudioSettings from './useGetAudioSettings';
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

  const audioChunksRef = useRef<Blob[]>([]);
  /** Read by the recorder's `stop` handler, which fires a tick after the call
   *  that ended capture and cannot otherwise tell an abort from a stop. */
  const abortedRef = useRef(false);
  const [permission, setPermission] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isRequestBeingMade, setIsRequestBeingMade] = useState(false);
  const [audioMimeType, setAudioMimeType] = useState<string>(() => getBestSupportedMimeType());

  const [minDecibels] = useRecoilState(store.decibelValue);
  const [autoSendText] = useRecoilState(store.autoSendText);
  const [languageSTT] = useRecoilState<string>(store.languageSTT);
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
    } catch {
      setPermission(false);
    }
  };

  const handleStop = () => {
    if (abortedRef.current) {
      abortedRef.current = false;
      audioChunksRef.current = [];
      cleanup();
      return;
    }

    if (audioChunksRef.current.length > 0) {
      const audioBlob = new Blob(audioChunksRef.current, { type: audioMimeType });
      const fileExtension = getFileExtension(audioMimeType);

      audioChunksRef.current = [];

      const formData = new FormData();
      formData.append('audio', audioBlob, `audio.${fileExtension}`);
      if (languageSTT) {
        formData.append('language', languageSTT);
      }
      setIsRequestBeingMade(true);
      cleanup();
      processAudio(formData);
    } else {
      showToast({ message: 'The audio was too short', status: 'warning' });
    }
  };

  const monitorSilence = (stream: MediaStream, stopRecording: () => void) => {
    /* Held so it can be closed again: without this the ref below is never
       assigned, its guard is always true, and every take leaves another audio
       context open until the browser refuses to grant one. */
    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
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
        audioChunksRef.current = [];
        abortedRef.current = false;
        const bestMimeType = getBestSupportedMimeType();
        setAudioMimeType(bestMimeType);

        mediaRecorderRef.current = new MediaRecorder(audioStream.current, {
          mimeType: audioMimeType,
        });
        mediaRecorderRef.current.addEventListener('dataavailable', (event: BlobEvent) => {
          audioChunksRef.current.push(event.data);
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

  /** Releases the silence monitor's audio graph; safe to call more than once. */
  const closeAudioContext = () => {
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context != null && context.state !== 'closed') {
      void context.close().catch(() => undefined);
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
      closeAudioContext();

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

  /**
   * Drops the take without transcribing it. `handleStop` is where the audio is
   * packed into a FormData and uploaded, so an abort has to reach it: the flag
   * is what stops a discarded take from spending a transcription request.
   */
  const externalAbortRecording = () => {
    abortedRef.current = true;
    audioChunksRef.current = [];

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }

    audioStream.current?.getTracks().forEach((track) => track.stop());
    audioStream.current = null;

    if (animationFrameIdRef.current !== null) {
      window.cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
    closeAudioContext();

    setIsListening(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListening]);

  /* Navigating away mid-take ends neither path above, and the audio graph
     would outlive the page that opened it. */
  useEffect(
    () => () => {
      const context = audioContextRef.current;
      audioContextRef.current = null;
      if (context != null && context.state !== 'closed') {
        void context.close().catch(() => undefined);
      }
    },
    [],
  );

  return {
    isListening,
    externalStopRecording,
    externalAbortRecording,
    externalStartRecording,
    isLoading: isProcessing,
  };
};

export default useSpeechToTextExternal;
