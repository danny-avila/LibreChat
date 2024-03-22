import { useEffect, useState } from 'react';
import { useTextToSpeechMutation } from '~/data-provider';
import { useToastContext } from '~/Providers';

function useTextToSpeechExternal() {
  const { showToast } = useToastContext();
  const { mutate: processAudio, isLoading: isProcessing } = useTextToSpeechMutation({
    onSuccess: (data) => {
      try {
        // Convert the ArrayBuffer to a Blob
        const audioBlob = new Blob([data], { type: 'audio/mpeg' });
        const blobUrl = URL.createObjectURL(audioBlob);

        const audio = new Audio(blobUrl);
        audio
          .play()
          .then(() => {
            // Audio playback started successfully
          })
          .catch((error) => {
            console.error('Error playing audio:', error);
            showToast({ message: `Error playing audio: ${error.message}`, status: 'error' });
          });

        audio.onended = () => {
          URL.revokeObjectURL(blobUrl);
        };

        setAudio(audio);
        setBlobUrl(blobUrl);
      } catch (error) {
        console.error('Error processing audio:', error);
        showToast({ message: `Error processing audio: ${error.message}`, status: 'error' });
      }
    },
    onError: (error) => {
      showToast({ message: `Error: ${error.message}`, status: 'error' });
    },
  });

  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const synthesizeSpeech = (text) => {
    const formData = new FormData();
    formData.append('text', text);
    processAudio(formData);
  };

  const cancelSpeech = () => {
    if (audio) {
      (audio as HTMLAudioElement).pause();
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    }
  };

  useEffect(() => {
    return cancelSpeech;
  }, []);

  return { synthesizeSpeech, cancelSpeech, isProcessing };
}

export default useTextToSpeechExternal;
