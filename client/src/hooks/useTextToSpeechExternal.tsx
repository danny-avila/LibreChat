import { useEffect, useState } from 'react';
import { useTextToSpeechMutation } from '~/data-provider';
import { useToastContext } from '~/Providers';

function useTextToSpeechExternal() {
  const { showToast } = useToastContext();
  const [downloadFile, setDownloadFile] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const { mutate: processAudio, isLoading: isProcessing } = useTextToSpeechMutation({
    onSuccess: (data) => {
      try {
        // Convert the ArrayBuffer to a Blob
        const audioBlob = new Blob([data], { type: 'audio/mpeg' });
        const blobUrl = URL.createObjectURL(audioBlob);

        if (downloadFile === true) {
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = 'audio.mp3';
          a.click();
          setDownloadFile(false);
          return;
        }

        const audio = new Audio(blobUrl);

        audio
          .play()
          .then(() => {
            setIsSpeaking(true);
          })
          .catch((error) => {
            console.error('Error playing audio:', error);
            showToast({ message: `Error playing audio: ${error.message}`, status: 'error' });
          });

        audio.onended = () => {
          URL.revokeObjectURL(blobUrl);
          setIsSpeaking(false);
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

  const generateSpeechExternal = (text, download) => {
    const formData = new FormData();
    formData.append('input', text);
    setDownloadFile(download);
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

  return { generateSpeechExternal, cancelSpeech, isLoading: isProcessing, isSpeaking };
}

export default useTextToSpeechExternal;
