import { useState, useRef, useCallback, useEffect } from 'react';
import { dataService } from 'librechat-data-provider';
import store from '~/store';
import { useAuthContext } from './AuthContext';

const useAudioRecorder = (onTranscription: (text: string) => void, index = 0) => {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [shouldStopRecording, setShouldStopRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  const { token } = useAuthContext();
  const { useCreateConversationAtom } = store;
  const { conversation } = useCreateConversationAtom(index);
  const { endpoint } = conversation ?? {};

  useEffect(() => {
    if (shouldStopRecording && isRecording) {
      stopRecording();
    }
  }, [shouldStopRecording, isRecording]);

  useEffect(() => {
    if (text) {
      onTranscription(text);
    }
  }, [text, onTranscription]);

  const sendAudioToOpenAI = useCallback(
    async (audioBlob: Blob) => {
      try {
        if (audioBlob === null || !endpoint) {
          return;
        }
        setIsFetching(true);
        const formData = new FormData();
        formData.append('audio', audioBlob, 'audio.wav');
        formData.append('endpoint', endpoint);

        const response = await dataService.getTextFromAudio(formData, {
          Authorization: `Bearer ${token}`,
        });

        if (response.text) {
          setText(response.text);
        } else {
          throw new Error('Failed to transcribe audio');
        }
      } catch (error) {
        console.error('Error sending audio to OpenAI:', error);
      } finally {
        setIsFetching(false);
        setShouldStopRecording(false);
      }
    },
    [endpoint, token],
  );

  const startRecording = useCallback(async () => {
    setShouldStopRecording(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options = { mimeType: 'audio/webm' };
      if (MediaRecorder.isTypeSupported(options.mimeType)) {
        const mediaRecorder = new MediaRecorder(stream, options);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          audioChunksRef.current.push(event.data);
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: options.mimeType });
          await sendAudioToOpenAI(audioBlob);
        };

        mediaRecorder.start();
        setIsRecording(true);
      } else {
        console.error('Audio format not supported');
      }
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  }, [sendAudioToOpenAI]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  const handleRecording = useCallback(() => {
    if (!isRecording) {
      startRecording();
    } else {
      setShouldStopRecording(true);
    }
  }, [isRecording, startRecording]);

  return { isRecording, handleRecording, isFetching };
};

export default useAudioRecorder;
