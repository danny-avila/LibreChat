import { useRef } from 'react';
import { parseTextParts } from 'librechat-data-provider';
import type { TMessageContentParts } from 'librechat-data-provider';
import useTextToSpeechExternal from './useTextToSpeechExternal';
import useTextToSpeechBrowser from './useTextToSpeechBrowser';
import { usePauseGlobalAudio } from '../Audio';
import { useRecoilState } from 'recoil';
import store from '~/store';

const useTextToSpeech = (message: string | TMessageContentParts[], isLast: boolean, index = 0) => {
  const [endpointTTS] = useRecoilState<string>(store.endpointTTS);
  const useExternalTextToSpeech = endpointTTS === 'external';

  const {
    generateSpeechLocal: generateSpeechLocal,
    cancelSpeechLocal: cancelSpeechLocal,
    isSpeaking: isSpeakingLocal,
  } = useTextToSpeechBrowser();

  const {
    generateSpeechExternal: generateSpeechExternal,
    cancelSpeech: cancelSpeechExternal,
    isSpeaking: isSpeakingExternal,
    isLoading: isLoading,
  } = useTextToSpeechExternal(isLast, index);
  const { pauseGlobalAudio } = usePauseGlobalAudio(index);

  const generateSpeech = useExternalTextToSpeech ? generateSpeechExternal : generateSpeechLocal;
  const cancelSpeech = useExternalTextToSpeech ? cancelSpeechExternal : cancelSpeechLocal;
  const isSpeaking = useExternalTextToSpeech ? isSpeakingExternal : isSpeakingLocal;

  const isMouseDownRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);

  const handleMouseDown = () => {
    isMouseDownRef.current = true;
    timerRef.current = window.setTimeout(() => {
      if (isMouseDownRef.current) {
        const parsedMessage = typeof message === 'string' ? message : parseTextParts(message);
        generateSpeech(parsedMessage, true);
      }
    }, 1000);
  };

  const handleMouseUp = () => {
    isMouseDownRef.current = false;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
  };

  const toggleSpeech = () => {
    if (isSpeaking) {
      cancelSpeech();
      pauseGlobalAudio();
    } else {
      const parsedMessage = typeof message === 'string' ? message : parseTextParts(message);
      generateSpeech(parsedMessage, false);
    }
  };

  return {
    handleMouseDown,
    handleMouseUp,
    toggleSpeech,
    isSpeaking,
    isLoading,
  };
};

export default useTextToSpeech;
