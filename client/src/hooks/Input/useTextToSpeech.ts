import { useRef } from 'react';
import useTextToSpeechBrowser from './useTextToSpeechBrowser';
import useTextToSpeechExternal from './useTextToSpeechExternal';
import { usePauseGlobalAudio } from '../Audio';
import { useRecoilState } from 'recoil';
import store from '~/store';

const useTextToSpeech = (message: string, isLast: boolean, index = 0) => {
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
      pauseGlobalAudio();
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
