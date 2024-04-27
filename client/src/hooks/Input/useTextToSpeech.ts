import { useRef } from 'react';
import useTextToSpeechBrowser from './useTextToSpeechBrowser';
import useTextToSpeechExternal from './useTextToSpeechExternal';
import { useRecoilState } from 'recoil';
import store from '~/store';

const useTextToSpeech = (message: string) => {
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
