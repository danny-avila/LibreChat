import { useRef } from 'react';
import { parseTextParts } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import useTextToSpeechExternal from './useTextToSpeechExternal';
import useTextToSpeechBrowser from './useTextToSpeechBrowser';
import useGetAudioSettings from './useGetAudioSettings';
import useTextToSpeechEdge from './useTextToSpeechEdge';
import { usePauseGlobalAudio } from '../Audio';

const useTextToSpeech = (message?: TMessage, isLast = false, index = 0) => {
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
  } = useTextToSpeechExternal(message?.messageId || '', isLast, index);

  let generateSpeech, cancelSpeech, isSpeaking, isLoading, voices;

  switch (textToSpeechEndpoint) {
    case 'external':
      generateSpeech = generateSpeechExternal;
      cancelSpeech = cancelSpeechExternal;
      isSpeaking = isSpeakingExternal;
      isLoading = isLoadingExternal;
      if (audioRefExternal) {
        audioRef.current = audioRefExternal.current;
      }
      voices = voicesExternal;
      break;
    case 'edge':
      generateSpeech = generateSpeechEdge;
      cancelSpeech = cancelSpeechEdge;
      isSpeaking = isSpeakingEdge;
      isLoading = false;
      voices = voicesEdge;
      break;
    case 'browser':
    default:
      generateSpeech = generateSpeechLocal;
      cancelSpeech = cancelSpeechLocal;
      isSpeaking = isSpeakingLocal;
      isLoading = false;
      voices = voicesLocal;
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
    if (timerRef.current) {
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
    voices,
    audioRef,
  };
};

export default useTextToSpeech;
