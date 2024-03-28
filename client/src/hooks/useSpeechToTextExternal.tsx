import { useState, useEffect, useRef } from 'react';
import { useRecoilState } from 'recoil';
import { useSpeechToTextMutation } from '~/data-provider';
import { useToastContext } from '~/Providers';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import store from '~/store';
import Hark from 'hark';

const useSpeechToTextExternal = () => {
  const { showToast } = useToastContext();
  const { data: startupConfig } = useGetStartupConfig();
  const isExternalSpeechEnabled = startupConfig?.speechToTextExternal ?? false;
  const [chatAudio] = useRecoilState<boolean>(store.chatAudio);
  const [text, setText] = useState<string>('');
  const [isListening, setIsListening] = useState(false);
  const [permission, setPermission] = useState(false);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [isRequestBeingMade, setIsRequestBeingMade] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStream = useRef<MediaStream | null>(null);
  const harkRef = useRef(null);

  const { mutate: processAudio, isLoading: isProcessing } = useSpeechToTextMutation({
    onSuccess: (data) => {
      const extractedText = data.text;
      setText(extractedText);
      setIsRequestBeingMade(false);
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
      formData.append('audio', audioBlob, 'recording.wav');
      setIsRequestBeingMade(true);
      cleanup();
      processAudio(formData);
    } else {
      showToast({ message: 'The audio was too short', status: 'warning' });
    }
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
        mediaRecorderRef.current = new MediaRecorder(audioStream.current);
        mediaRecorderRef.current.addEventListener('dataavailable', handleDataAvailable);
        mediaRecorderRef.current.addEventListener('stop', handleStop);
        mediaRecorderRef.current.start(100);
        if (!harkRef.current && chatAudio) {
          harkRef.current = Hark(audioStream.current, {
            interval: 100,
          });
          harkRef.current.on('speaking', () => {
            // start
          });
          harkRef.current.on('stopped_speaking', () => {
            // stop
            stopRecording();
          });
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
      setIsListening(false);

      if (harkRef.current && chatAudio) {
        harkRef.current.stop();
        harkRef.current = null;
      }

      audioStream.current?.getTracks().forEach((track) => track.stop());
      audioStream.current = null;
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
    if (e.shiftKey && e.altKey && e.code === 'KeyL' && isExternalSpeechEnabled) {
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
    if (isExternalSpeechEnabled === false) {
      return;
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExternalSpeechEnabled, isListening]);

  return {
    isListening,
    isLoading: isProcessing,
    text,
    externalStartRecording,
    externalStopRecording,
  };
};

export default useSpeechToTextExternal;
