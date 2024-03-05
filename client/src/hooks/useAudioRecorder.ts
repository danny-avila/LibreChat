import { useState, useRef, useCallback } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import store from '~/store';

const useAudioRecorder = (onTranscription: (text: string) => void, index = 0) => {
  const setSubmission = useSetRecoilState(store.submissionByIndex(index));
  const [isRecording, setIsRecording] = useState(false);
  const modelsConfig = useRecoilValue(store.modelsConfig);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  // const whisperModel = modelsConfig.azureOpenAI.find((model) => model.includes('whisper'));

  const sendAudioToOpenAI = useCallback(
    async (audioBlob: Blob) => {
      try {
        const audioBuffer = await audioBlob.arrayBuffer();
        // const audioUint8Array = new Uint8Array(audioBuffer);

        const response = { text: 'Texto transcribido simulado' };

        if (response.text) {
          onTranscription(response.text);
          // setSubmission();
        } else {
          throw new Error('Failed to transcribe audio');
        }
      } catch (error) {
        console.error('Error sending audio to OpenAI:', error);
      }
    },
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

  return { isRecording, handleRecording };
};

export default useAudioRecorder;
