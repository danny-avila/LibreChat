import { useState, useRef, useCallback } from 'react';
import {
  /* @ts-ignore */
  dataService,
} from 'librechat-data-provider';
import store from '~/store';
import { useAuthContext } from './AuthContext';

const useAudioRecorder = (onTranscription: (text: string) => void, index = 0) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  const { token } = useAuthContext();

  const { useCreateConversationAtom } = store;
  const { conversation } = useCreateConversationAtom(index);
  const { endpoint } = conversation ?? {};

  const sendAudioToOpenAI = useCallback(
    async (audioBlob: Blob) => {
      try {
        if (audioBlob === null || !endpoint) {
          return;
        }
        const formData = new FormData();
        formData.append('audio', audioBlob, 'audio.wav');
        formData.append('endpoint', endpoint);

        const response = await dataService.getTextFromAudio(formData, {
          headers: { Authorization: `Bearer ${token}` },
        });

        setIsFetching(true);

        if (response.text) {
          onTranscription(response.text);
        } else {
          throw new Error('Failed to transcribe audio');
        }

        setIsFetching(false);
      } catch (error) {
        console.error('Error sending audio to OpenAI:', error);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onTranscription],
  );

  const startRecording = useCallback(async () => {
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
      stopRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  return { isRecording, handleRecording, isFetching };
};

export default useAudioRecorder;
