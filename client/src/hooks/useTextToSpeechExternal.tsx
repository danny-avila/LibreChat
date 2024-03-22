import { useEffect } from 'react';
import { useTextToSpeechMutation } from '~/data-provider';
import { useToastContext } from '~/Providers';

function useTextToSpeechExternal() {
  const { showToast } = useToastContext();
  const { mutate: processAudio, isLoading: isProcessing } = useTextToSpeechMutation({
    onSuccess: (data: ArrayBuffer) => {
      try {
        // Convert the ArrayBuffer to a Blob
        const audioBlob = new Blob([data], { type: 'audio/mpeg' });
        const blobUrl = URL.createObjectURL(audioBlob);

        const audio = new Audio(blobUrl);
        audio.play().catch((error) => {
          // Handle any errors that occur during playback
          console.error('Error playing audio:', error);
          showToast({ message: `Error playing audio: ${error.message}`, status: 'error' });
        });

        // Create an anchor element and trigger a download
        const downloadLink = document.createElement('a');
        downloadLink.href = blobUrl;
        downloadLink.download = 'speech.mp3'; // Suggest a filename for the download
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(blobUrl); // Clean up the blob URL
      } catch (error) {
        console.error('Error processing audio:', error);
        showToast({ message: `Error processing audio: ${error.message}`, status: 'error' });
      }
    },
    onError: (error: Error) => {
      showToast({ message: `Error: ${error.message}`, status: 'error' });
    },
  });

  const synthesizeSpeech = (text: string) => {
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
