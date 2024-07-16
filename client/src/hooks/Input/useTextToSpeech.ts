import { useRef } from 'react';
import { parseTextParts } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import useTextToSpeechExternal from './useTextToSpeechExternal';
import useTextToSpeechBrowser from './useTextToSpeechBrowser';
import { usePauseGlobalAudio } from '../Audio';
import useGetAudioSettings from './useGetAudioSettings';
import useTextToSpeechEdge from './useTextToSpeechEdge';

const useTextToSpeech = (message: TMessage, isLast: boolean, index = 0) => {
  const { textToSpeechEndpoint } = useGetAudioSettings();
  const { pauseGlobalAudio } = usePauseGlobalAudio(index);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const {
    generateSpeechLocal,
    cancelSpeechLocal,
    isSpeaking: isSpeakingLocal,
  } = useTextToSpeechBrowser();

  const {
    generateSpeechEdge,
    cancelSpeechEdge,
    isSpeaking: isSpeakingEdge,
  } = useTextToSpeechEdge();

  const {
    generateSpeechExternal,
    cancelSpeech: cancelSpeechExternal,
    isSpeaking: isSpeakingExternal,
    isLoading: isLoadingExternal,
    audioRef: audioRefExternal,
  } = useTextToSpeechExternal(message.messageId, isLast, index);

  let generateSpeech, cancelSpeech, isSpeaking, isLoading;

  console.log(`textToSpeechEndpoint: ${textToSpeechEndpoint}`);

  switch (textToSpeechEndpoint) {
    case 'external':
      generateSpeech = generateSpeechExternal;
      cancelSpeech = cancelSpeechExternal;
      isSpeaking = isSpeakingExternal;
      isLoading = isLoadingExternal;
      if (audioRefExternal) {
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

  console.log({
    generateSpeech,
    cancelSpeech,
    isSpeaking,
    isLoading,
    audioRef,
  });

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
      console.log('canceling message audio speech');
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
  };
};

export default useTextToSpeech;
