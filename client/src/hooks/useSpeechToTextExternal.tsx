import { useState, useEffect } from 'react';
import { useSpeechToTextMutation } from '~/data-provider';
import { useToastContext } from '~/Providers';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';

const useSpeechToTextExternal = () => {
  const { showToast } = useToastContext();
  const [text, setText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [audioData, setAudioData] = useState<Blob | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const { data: startupConfig } = useGetStartupConfig();
  const externalSpeechEnabled = startupConfig?.speechToTextExternal;

  const { mutate: processAudio, isLoading: isProcessing } = useSpeechToTextMutation({
    onSuccess: (data) => {
      const extractedText = data.text;
      setText(extractedText);
    },
    onError: () => {
      showToast({ message: 'There was an error while uploading your audio', status: 'error' });
    },
  });

  const startRecording = () => {
    setRecordedChunks([]);

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const recorder = new MediaRecorder(stream);
        setMediaRecorder(recorder);

        const chunks = [];

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            const chunks: Blob[] = [...recordedChunks, event.data];
            setRecordedChunks(chunks);
            setRecordedChunks([...chunks]);
          }
        };

        recorder.onstop = () => {
          const audioBlob = new Blob(chunks, { type: 'audio/wav' });
          setAudioData(audioBlob);
        };

        recorder.start();
        setTimeout(() => recorder.stop(), 3000);
      })
      .catch((error) => {
        console.error('Error starting recording:', error);
      });
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      console.log('recordedChunks:', recordedChunks);
      if (recordedChunks.length > 0) {
        const audioBlob = new Blob(recordedChunks, { type: 'audio/wav' });
        setAudioData(audioBlob);
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.wav');
        processAudio(formData);
      } else {
        showToast({ message: 'No audio data found', status: 'info' });
      }
    }
  };

  const handleKeyDown = async (e) => {
    if (e.shiftKey && e.altKey && e.key === 'L') {
      console.log('keydown pressed');

      // Toggle between start and stop recording
      if (isListening) {
        stopRecording();
        setIsListening(false);
        console.log('stop recording');
      } else {
        setRecordedChunks([]); // Clear recorded chunks when starting a new recording
        startRecording();
        setIsListening(true);
      }

      // Prevent default behavior to avoid undesired side effects
      e.preventDefault();
    }
  };

  useEffect(() => {
    if (externalSpeechEnabled === false) {
      return;
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isListening, audioData]);

  return { isListening, isLoading: isProcessing, text };
};

export default useSpeechToTextExternal;
