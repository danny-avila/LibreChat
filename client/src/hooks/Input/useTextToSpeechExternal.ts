import { useEffect, useState } from 'react';
import { useRecoilState } from 'recoil';
import { useTextToSpeechMutation } from '~/data-provider';
import { useToastContext } from '~/Providers';
import store from '~/store';

function useTextToSpeechExternal() {
  const { showToast } = useToastContext();
  const [cacheTTS] = useRecoilState<boolean>(store.cacheTTS);
  const [voice] = useRecoilState<string>(store.voice);
  const [downloadFile, setDownloadFile] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);

  const playAudio = (blobUrl: string) => {
    const audio = new Audio(blobUrl);

    audio
      .play()
      .then(() => {
        setIsSpeaking(true);
      })
      .catch((error: Error) => {
        showToast({ message: `Error playing audio: ${error.message}`, status: 'error' });
      });

    audio.onended = () => {
      URL.revokeObjectURL(blobUrl);
      setIsSpeaking(false);
    };

    setAudio(audio);
    setBlobUrl(blobUrl);
  };

  const downloadAudio = (blobUrl: string) => {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = 'audio.mp3';
    a.click();
    setDownloadFile(false);
  };

  const { mutate: processAudio, isLoading: isProcessing } = useTextToSpeechMutation({
    onSuccess: async (data: ArrayBuffer) => {
      try {
        const audioBlob = new Blob([data], { type: 'audio/mpeg' });
        const blobUrl = URL.createObjectURL(audioBlob);

        if (cacheTTS) {
          const cache = await caches.open('tts-responses');
          const request = new Request(text!);
          cache.put(request, new Response(audioBlob));
        }

        if (downloadFile === true) {
          downloadAudio(blobUrl);
          return;
        }

        playAudio(blobUrl);
      } catch (error) {
        showToast({
          message: `Error processing audio: ${(error as Error).message}`,
          status: 'error',
        });
      }
    },
    onError: (error: unknown) => {
      showToast({ message: `Error: ${(error as Error).message}`, status: 'error' });
    },
  });

  const generateSpeechExternal = async (text, download) => {
    setText(text);
    const cachedResponse = await caches.match(text);

    if (cachedResponse && cacheTTS) {
      const audioBlob = await cachedResponse.blob();
      const blobUrl = URL.createObjectURL(audioBlob);
      if (download) {
        downloadAudio(blobUrl);
      } else {
        playAudio(blobUrl);
      }
    } else {
      const formData = new FormData();
      formData.append('input', text);
      formData.append('voice', voice);
      setDownloadFile(download);
      processAudio(formData);
    }
  };

  const cancelSpeech = () => {
    if (audio) {
      (audio as HTMLAudioElement).pause();
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
      setIsSpeaking(false);
    }
  };

  useEffect(() => {
    return cancelSpeech;
  }, []);

  return { generateSpeechExternal, cancelSpeech, isLoading: isProcessing, isSpeaking };
}

export default useTextToSpeechExternal;
