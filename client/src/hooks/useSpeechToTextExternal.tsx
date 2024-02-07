import { useState, useEffect, useRef } from 'react';
import { useSpeechToTextMutation } from '~/data-provider';
import { useToastContext } from '~/Providers';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';

const useSpeechToTextExternal = () => {
  const { showToast } = useToastContext();
  const [text, setText] = useState<string>('');
  const [isListening, setIsListening] = useState(false);
  const { data: startupConfig } = useGetStartupConfig();
  const isExternalSpeechEnabled = startupConfig?.speechToTextExternal ?? false;
  const [permission, setPermission] = useState(false);
  const audioStream = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [recordingStatus, setRecordingStatus] = useState('inactive');
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [isRequestBeingMade, setIsRequestBeingMade] = useState(false);

  const { mutate: processAudio, isLoading: isProcessing } = useSpeechToTextMutation({
    onSuccess: (data) => {
      const extractedText = data.text;
      setText(extractedText);
      setIsRequestBeingMade(false);
    },
    onError: (error) => {
      showToast({ message: `Error: ${error}`, status: 'error' });
      setIsRequestBeingMade(false);
    },
  });

  const cleanup = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.removeEventListener('dataavailable', handleDataAvailable);
      mediaRecorderRef.current.removeEventListener('stop', handleStop);
      mediaRecorderRef.current = null;
      setRecordingStatus('inactive');
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
      console.error('Error getting microphone permission:', err);
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

      setRecordingStatus('inactive');
      setAudioChunks([]);

      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.wav');
      console.log('Sending audio for processing');
      setIsRequestBeingMade(true);
      cleanup();
      processAudio(formData);
    } else {
      showToast({ message: 'No audio chunks available for processing', status: 'warning' });
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
        setIsListening(true);
        setRecordingStatus('recording');
        console.log('MediaRecorder state:', mediaRecorderRef.current?.state);
      } catch (error) {
        showToast({ message: `Error starting recording: ${error}`, status: 'error' });
      }
    } else {
      showToast({ message: 'Microphone permission not granted', status: 'error' });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recordingStatus === 'recording') {
      mediaRecorderRef.current.stop();
      setRecordingStatus('inactive');
      setIsListening(false);

      audioStream.current?.getTracks().forEach((track) => track.stop());
      audioStream.current = null;
    } else {
      showToast({ message: 'MediaRecorder is not recording', status: 'error' });
    }
  };
  const handleKeyDown = async (e: KeyboardEvent) => {
    if (e.shiftKey && e.altKey && e.code === 'KeyL') {
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

  return { isListening, isLoading: isProcessing, text };
};

export default useSpeechToTextExternal;
