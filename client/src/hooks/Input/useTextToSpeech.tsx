// useTTS.ts
import { useRef } from 'react';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import useTextToSpeechBrowser from './useTextToSpeechBrowser';
import useTextToSpeechExternal from './useTextToSpeechExternal';

const useTextToSpeech = (message: string) => {
  const { data: startupConfig } = useGetStartupConfig();
  const useExternalTextToSpeech = startupConfig?.textToSpeechExternal;

  const {
    generateSpeechLocal: generateSpeechLocal,
    cancelSpeechLocal: cancelSpeechLocal,
    isSpeaking: isSpeakingLocal,
  } = useTextToSpeechBrowser();

  const {
    generateSpeechExternal: generateSpeechExternal,
    cancelSpeech: cancelSpeechExternal,
    isLoading: isLoading,
    isSpeaking: isSpeakingExternal,
  } = useTextToSpeechExternal();

  const generateSpeech = useExternalTextToSpeech ? generateSpeechExternal : generateSpeechLocal;
  const cancelSpeech = useExternalTextToSpeech ? cancelSpeechExternal : cancelSpeechLocal;
  const isSpeaking = useExternalTextToSpeech ? isSpeakingExternal : isSpeakingLocal;

  const isMouseDownRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);

  const handleMouseDown = () => {
    isMouseDownRef.current = true;
    timerRef.current = window.setTimeout(() => {
      if (isMouseDownRef.current) {
        generateSpeech(message, true);
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
    } else {
      generateSpeech(message, false);
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
