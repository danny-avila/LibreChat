import { useEffect } from 'react';
import { useTextToSpeechMutation } from '~/data-provider';
import { useToastContext } from '~/Providers';

function useTextToSpeechExternal() {
  const { showToast } = useToastContext();

  const { mutate: processAudio, isLoading: isProcessing } = useTextToSpeechMutation({
    onSuccess: async (data) => {
      const audioBlob = data.audio;

      try {
        // Check if audioBlob is a valid instance of Blob
        if (audioBlob instanceof Blob) {
          const arrayBuffer = await audioBlob.arrayBuffer();
          const blobUrl = URL.createObjectURL(new Blob([arrayBuffer]));
          const audioElement = new Audio(blobUrl);
          audioElement.play();

          // Optionally, revoke the Blob URL after playing
          URL.revokeObjectURL(blobUrl);
        } else {
          console.error('Invalid audioBlob:', audioBlob);
        }
      } catch (error) {
        console.error('Failed to set audio source:', error);
      }
    },
    onError: (error) => {
      showToast({ message: `Error: ${error}`, status: 'error' });
    },
  });

  const synthesizeSpeech = (text, onEnd) => {
    console.log(text);

    const formData = new FormData();
    formData.append('text', text);

    processAudio(formData);
  };

  const cancelSpeech = () => {
    const synth = window.speechSynthesis;
    synth.cancel();
  };

  useEffect(() => {
    return () => {
      cancelSpeech();
    };
  }, []);

  return { synthesizeSpeech, cancelSpeech, isProcessing };
}

export default useTextToSpeechExternal;
