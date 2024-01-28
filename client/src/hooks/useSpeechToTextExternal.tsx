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

  const { mutate: processAudio, isLoading: isProcessing } = useSpeechToTextMutation({
    onSuccess: (data) => {
      const extractedText = data.text;
      setText(extractedText);
    },
    onError: (error) => {
      showToast({ message: `Error: ${error}`, status: 'error' });
    },
  });

  const cleanup = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.removeEventListener('dataavailable', handleDataAvailable);
      mediaRecorderRef.current.removeEventListener('stop', handleStop);
      mediaRecorderRef.current = null;
      setRecordingStatus('inactive');
    }
    if (audioStream.current) {
      audioStream.current.getTracks().forEach((track) => track.stop());
      audioStream.current = null;
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
      console.log('Permission granted, audio stream:', audioStream.current);
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
      processAudio(formData);
      cleanup();
    } else {
      showToast({ message: 'No audio chunks available for processing', status: 'warning' });
    }
  };

  const startRecording = () => {
    if (audioStream.current) {
      try {
        setAudioChunks([]);
        mediaRecorderRef.current = new MediaRecorder(audioStream.current);
        mediaRecorderRef.current.addEventListener('dataavailable', handleDataAvailable);
        mediaRecorderRef.current.addEventListener('stop', handleStop);
        mediaRecorderRef.current.start(100);
        setRecordingStatus('recording');
        console.log('MediaRecorder state:', mediaRecorderRef.current?.state);
      } catch (error) {
        showToast({ message: `Error starting recording: ${error}`, status: 'error' });
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recordingStatus === 'recording') {
      mediaRecorderRef.current.stop();
    } else {
      showToast({ message: 'MediaRecorder is not recording', status: 'error' });
    }
  };

  const handleKeyDown = async (e: KeyboardEvent) => {
    if (e.shiftKey && e.altKey && e.key === 'L') {
      if (!window.MediaRecorder) {
        showToast({ message: 'MediaRecorder is not supported in this browser', status: 'error' });
        return;
      }

      if (permission === false) {
        await getMicrophonePermission();
      }

      if (isListening) {
        stopRecording();
        setIsListening(false);
      } else {
        startRecording();
        setIsListening(true);
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
      // Removed the call to cleanup
    };
  }, [isExternalSpeechEnabled, isListening]);

  return { isListening, isLoading: isProcessing, text };
};

export default useSpeechToTextExternal;
