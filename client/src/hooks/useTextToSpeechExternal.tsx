import { useEffect } from 'react';
import { useTextToSpeechMutation } from '~/data-provider';
import { useToastContext } from '~/Providers';

const useBinaryStringToArrayBuffer = (binaryString) => {
  const buffer = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    buffer[i] = binaryString.charCodeAt(i);
  }
  return buffer.buffer;
};

function useTextToSpeechExternal() {
  const { showToast } = useToastContext();
  const { mutate: processAudio, isLoading: isProcessing } = useTextToSpeechMutation({
    onSuccess: (data: Blob | ArrayBuffer) => {
      // If the data is already a Blob, there's no need to convert it
      const blob = data instanceof Blob ? data : new Blob([data], { type: 'audio/mpeg' });
      const blobUrl = URL.createObjectURL(blob);
      console.log('Blob URL:', blobUrl);

      const audioElement = new Audio(blobUrl);
      audioElement.play().catch((error: Error) => {
        console.error('Failed to play audio:', error);
        showToast({ message: `Error playing audio: ${error.message}`, status: 'error' });
        URL.revokeObjectURL(blobUrl); // Clean up the blob URL
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
