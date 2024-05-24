import { useRecoilValue } from 'recoil';
import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { useTextToSpeechMutation } from '~/data-provider';
import useLocalize from '~/hooks/useLocalize';
import { useToastContext } from '~/Providers';
import store from '~/store';

const createFormData = (text: string, voice: string) => {
  const formData = new FormData();
  formData.append('input', text);
  formData.append('voice', voice);
  return formData;
};

function useTextToSpeechExternal(isLast: boolean, index = 0) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const voice = useRecoilValue(store.voice);
  const cacheTTS = useRecoilValue(store.cacheTTS);
  const playbackRate = useRecoilValue(store.playbackRate);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [downloadFile, setDownloadFile] = useState(false);
  const [isLocalSpeaking, setIsSpeaking] = useState(false);

  /* Global Audio Variables */
  const globalIsFetching = useRecoilValue(store.globalAudioFetchingFamily(index));
  const globalIsPlaying = useRecoilValue(store.globalAudioPlayingFamily(index));

  const playAudio = (blobUrl: string) => {
    const newAudio = new Audio(blobUrl);
    const initializeAudio = () => {
      if (playbackRate && playbackRate !== 1) {
        newAudio.playbackRate = playbackRate;
      }
    };

    initializeAudio();
    const playPromise = () => newAudio.play().then(() => setIsSpeaking(true));

    playPromise().catch((error: Error) => {
      if (
        error?.message &&
        error.message.includes('The play() request was interrupted by a call to pause()')
      ) {
        console.log('Play request was interrupted by a call to pause()');
        initializeAudio();
        return playPromise().catch(console.error);
      }
      console.error(error);
      showToast({ message: localize('com_nav_audio_play_error', error.message), status: 'error' });
    });

    newAudio.onended = () => {
      console.log('Target message audio ended');
      URL.revokeObjectURL(blobUrl);
      setIsSpeaking(false);
    };

    audioRef.current = newAudio;
  };

  const downloadAudio = (blobUrl: string) => {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = 'audio.mp3';
    a.click();
    setDownloadFile(false);
  };

  const { mutate: processAudio, isLoading: isProcessing } = useTextToSpeechMutation({
    onMutate: (variables) => {
      const inputText = (variables.get('input') ?? '') as string;
      if (inputText.length >= 4096) {
        showToast({
          message: localize('com_nav_long_audio_warning'),
          status: 'warning',
        });
      }
    },
    onSuccess: async (data: ArrayBuffer, variables) => {
      try {
        const inputText = (variables.get('input') ?? '') as string;
        const audioBlob = new Blob([data], { type: 'audio/mpeg' });

        if (cacheTTS && inputText) {
          const cache = await caches.open('tts-responses');
          const request = new Request(inputText!);
          const response = new Response(audioBlob);
          cache.put(request, response);
        }

        const blobUrl = URL.createObjectURL(audioBlob);
        if (downloadFile) {
          downloadAudio(blobUrl);
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
      showToast({
        message: localize('com_nav_audio_process_error', (error as Error).message),
        status: 'error',
      });
    },
  });

  const generateSpeechExternal = async (text: string, download: boolean) => {
    const cachedResponse = await caches.match(text);

    if (cachedResponse && cacheTTS) {
      handleCachedResponse(cachedResponse, download);
    } else {
      const formData = createFormData(text, voice);
      setDownloadFile(download);
      processAudio(formData);
    }
  };

  const handleCachedResponse = async (cachedResponse: Response, download: boolean) => {
    const audioBlob = await cachedResponse.blob();
    const blobUrl = URL.createObjectURL(audioBlob);
    if (download) {
      downloadAudio(blobUrl);
    } else {
      playAudio(blobUrl);
    }
  };

  const cancelSpeech = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src && URL.revokeObjectURL(audioRef.current.src);
      audioRef.current = null;
      setIsSpeaking(false);
    }
  }, []);

  useEffect(() => cancelSpeech, [cancelSpeech]);

  const isLoading = useMemo(() => {
    return isProcessing || (isLast && globalIsFetching && !globalIsPlaying);
  }, [isProcessing, globalIsFetching, globalIsPlaying, isLast]);

  const isSpeaking = useMemo(() => {
    return isLocalSpeaking || (isLast && globalIsPlaying);
  }, [isLocalSpeaking, globalIsPlaying, isLast]);

  return { generateSpeechExternal, cancelSpeech, isLoading, isSpeaking };
}

export default useTextToSpeechExternal;
