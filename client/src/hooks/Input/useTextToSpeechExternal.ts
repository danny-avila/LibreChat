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
  const [websocket, setWebsocket] = useState(false);
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
        const mediaSource = new MediaSource();
        const audio = new Audio();
        audio.src = URL.createObjectURL(mediaSource);
        audio.autoplay = true; // Start playing the audio as soon as enough data has been received

        mediaSource.onsourceopen = () => {
          const sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
          sourceBuffer.appendBuffer(data);
        };

        audio.onended = () => {
          URL.revokeObjectURL(audio.src);
          setIsSpeaking(false);
        };

        setAudio(audio);

        if (cacheTTS) {
          const cache = await caches.open('tts-responses');
          const request = new Request(text!);
          cache.put(request, new Response(new Blob([data], { type: 'audio/mpeg' })));
        }

        if (downloadFile === true) {
          downloadAudio(audio.src);
          return;
        }
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

  const generateSpeechExternal = async (text, download, websocket) => {
    setText(text);
    const cachedResponse = await getCachedResponse(text);

    if (cachedResponse && cacheTTS) {
      handleCachedResponse(cachedResponse, download);
    } else {
      const formData = createFormData(text, websocket);
      setDownloadFile(download);
      setWebsocket(websocket);
      processAudio(formData);
    }
  };

  const getCachedResponse = async (text) => {
    return await caches.match(text);
  };

  const handleCachedResponse = async (cachedResponse, download) => {
    const audioBlob = await cachedResponse.blob();
    const blobUrl = URL.createObjectURL(audioBlob);
    if (download) {
      downloadAudio(blobUrl);
    } else {
      playAudio(blobUrl);
    }
  };

  const createFormData = (text, websocket) => {
    const formData = new FormData();
    formData.append('input', text);
    formData.append('voice', voice);
    if (websocket) {
      formData.append('websocket', 'true');
    }
    return formData;
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
