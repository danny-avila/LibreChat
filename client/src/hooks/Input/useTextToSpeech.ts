import { useRecoilState } from 'recoil';
import { useRef, useMemo, useEffect } from 'react';
import { parseTextParts } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { Option } from '~/common';
import useTextToSpeechExternal from './useTextToSpeechExternal';
import useTextToSpeechBrowser from './useTextToSpeechBrowser';
import useGetAudioSettings from './useGetAudioSettings';
import useTextToSpeechEdge from './useTextToSpeechEdge';
import { usePauseGlobalAudio } from '../Audio';
import { logger } from '~/utils';
import store from '~/store';

const useTextToSpeech = (message?: TMessage, isLast = false, index = 0) => {
  const [voice, setVoice] = useRecoilState(store.voice);
  const { textToSpeechEndpoint } = useGetAudioSettings();
  const { pauseGlobalAudio } = usePauseGlobalAudio(index);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const {
    generateSpeechLocal,
    cancelSpeechLocal,
    isSpeaking: isSpeakingLocal,
    voices: voicesLocal,
  } = useTextToSpeechBrowser();

  const {
    generateSpeechEdge,
    cancelSpeechEdge,
    isSpeaking: isSpeakingEdge,
    voices: voicesEdge,
  } = useTextToSpeechEdge();

  const {
    generateSpeechExternal,
    cancelSpeech: cancelSpeechExternal,
    isSpeaking: isSpeakingExternal,
    isLoading: isLoadingExternal,
    audioRef: audioRefExternal,
    voices: voicesExternal,
  } = useTextToSpeechExternal(message?.messageId ?? '', isLast, index);

  let generateSpeech, cancelSpeech, isSpeaking, isLoading;

  const voices: Option[] | string[] = useMemo(() => {
    const voiceMap = {
      external: voicesExternal,
      edge: voicesEdge,
      browser: voicesLocal,
    };

    return voiceMap[textToSpeechEndpoint];
  }, [textToSpeechEndpoint, voicesEdge, voicesExternal, voicesLocal]);

  useEffect(() => {
    const firstVoice = voices[0];
    if (voices.length && typeof firstVoice === 'object') {
      const lastSelectedVoice = voices.find((v) =>
        typeof v === 'object' ? v.value === voice : v === voice,
      );
      if (lastSelectedVoice != null) {
        const currentVoice =
          typeof lastSelectedVoice === 'object' ? lastSelectedVoice.value : lastSelectedVoice;
        logger.log('useTextToSpeech.ts - Effect:', { voices, voice: currentVoice });
        setVoice(currentVoice?.toString() ?? undefined);
        return;
      }

      logger.log('useTextToSpeech.ts - Effect:', { voices, voice: firstVoice.value });
      setVoice(firstVoice.value?.toString() ?? undefined);
    } else if (voices.length) {
      const lastSelectedVoice = voices.find((v) => v === voice);
      if (lastSelectedVoice != null) {
        logger.log('useTextToSpeech.ts - Effect:', { voices, voice: lastSelectedVoice });
        setVoice(lastSelectedVoice.toString());
        return;
      }
      logger.log('useTextToSpeech.ts - Effect:', { voices, voice: firstVoice });
      setVoice(firstVoice.toString());
    }
  }, [setVoice, textToSpeechEndpoint, voice, voices]);

  switch (textToSpeechEndpoint) {
    case 'external':
      generateSpeech = generateSpeechExternal;
      cancelSpeech = cancelSpeechExternal;
      isSpeaking = isSpeakingExternal;
      isLoading = isLoadingExternal;
      if (audioRefExternal.current) {
        audioRef.current = audioRefExternal.current;
      }
      break;
    case 'edge':
      generateSpeech = generateSpeechEdge;
      cancelSpeech = cancelSpeechEdge;
      isSpeaking = isSpeakingEdge;
      isLoading = false;
      break;
    case 'browser':
    default:
      generateSpeech = generateSpeechLocal;
      cancelSpeech = cancelSpeechLocal;
      isSpeaking = isSpeakingLocal;
      isLoading = false;
      break;
  }

  const isMouseDownRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);

  const handleMouseDown = () => {
    isMouseDownRef.current = true;
    timerRef.current = window.setTimeout(() => {
      if (isMouseDownRef.current) {
        const messageContent = message?.content ?? message?.text ?? '';
        const parsedMessage =
          typeof messageContent === 'string' ? messageContent : parseTextParts(messageContent);
        generateSpeech(parsedMessage, false);
      }
    }, 1000);
  };

  const handleMouseUp = () => {
    isMouseDownRef.current = false;
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
    }
  };

  const toggleSpeech = () => {
    if (isSpeaking) {
      cancelSpeech();
      pauseGlobalAudio();
    } else {
      const messageContent = message?.content ?? message?.text ?? '';
      const parsedMessage =
        typeof messageContent === 'string' ? messageContent : parseTextParts(messageContent);
      generateSpeech(parsedMessage, false);
    }
  };

  return {
    handleMouseDown,
    handleMouseUp,
    toggleSpeech,
    isSpeaking,
    isLoading,
    audioRef,
    voices,
  };
};

export default useTextToSpeech;
