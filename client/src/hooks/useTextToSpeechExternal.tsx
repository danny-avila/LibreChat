import { useEffect } from 'react';
import { useTextToSpeechMutation } from '~/data-provider';
import { useToastContext } from '~/Providers';

function useTextToSpeechExternal() {
  const { showToast } = useToastContext();
  const { mutate: processAudio, isLoading: isProcessing } = useTextToSpeechMutation({
    onSuccess: (data: Blob) => {
      console.log('Audio data:', data);
      const blobUrl = URL.createObjectURL(data);
      console.log('Blob URL:', blobUrl);

      const audioElement = new Audio(blobUrl);
      audioElement.addEventListener('canplaythrough', () => {
        audioElement.play().catch((error) => {
          console.error('Failed to play audio:', error);
          showToast({ message: `Error playing audio: ${error.message}`, status: 'error' });
          URL.revokeObjectURL(blobUrl); // Clean up the blob URL
        });
      });
    },
    onError: (error: Error) => {
      showToast({ message: `Error: ${error.message}`, status: 'error' });
    },
  });

  const synthesizeSpeech = (text) => {
    const formData = new FormData();
    formData.append('text', text);
    processAudio(formData);
  };

  const cancelSpeech = () => {
    window.speechSynthesis.cancel();
  };

  useEffect(() => {
    return cancelSpeech;
  }, []);

  return { synthesizeSpeech, cancelSpeech, isProcessing };
}

export default useTextToSpeechExternal;
