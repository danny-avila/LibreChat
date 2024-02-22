import { useEffect } from 'react';
import { useTextToSpeechMutation } from '~/data-provider';
import { useToastContext } from '~/Providers';

function useBinaryStringToArrayBuffer(binary) {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function useTextToSpeechExternal() {
  const { showToast } = useToastContext();

  const { mutate: processAudio, isLoading: isProcessing } = useTextToSpeechMutation({
    onSuccess: (data) => {
      console.log('Server response:', data);
      const binaryStringToArrayBuffer = useBinaryStringToArrayBuffer;

      let arrayBuffer;

      // Check if data is an instance of ArrayBuffer
      if (data instanceof ArrayBuffer) {
        arrayBuffer = data;
      } else if (typeof data === 'string') {
        // Convert binary string to ArrayBuffer
        arrayBuffer = binaryStringToArrayBuffer(data);
      } else {
        console.error('Unexpected data type:', typeof data);
        return;
      }

      const blob = new Blob([arrayBuffer], { type: 'audio/wav' }); // Changed MIME type to 'audio/wav'
      const blobUrl = URL.createObjectURL(blob);

      console.log('Blob:', blob);
      console.log('Blob URL:', blobUrl);

      const audioElement = new Audio(blobUrl);
      audioElement.play().catch((error) => {
        console.error('Failed to play audio:', error);
      });

      // Optionally, revoke the Blob URL after playing
      // URL.revokeObjectURL(blobUrl);
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
