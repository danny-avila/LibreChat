// client/src/hooks/Audio/useTTSBrowser.ts
import { useRef, useEffect, useState } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { parseTextParts } from 'librechat-data-provider';
import type { TMessageContentParts } from 'librechat-data-provider';
import useTextToSpeechBrowser from '~/hooks/Input/useTextToSpeechBrowser';
import usePauseGlobalAudio from '~/hooks/Audio/usePauseGlobalAudio';
import useAudioRef from '~/hooks/Audio/useAudioRef';
import { logger } from '~/utils';
import store from '~/store';

type TUseTextToSpeech = {
  messageId?: string;
  content?: TMessageContentParts[] | string;
  isLast?: boolean;
  index?: number;
};

const useTTSBrowser = (props?: TUseTextToSpeech) => {
  const { content, isLast = false, index = 0 } = props ?? {};

  const isMouseDownRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);
  const [isSpeakingState, setIsSpeaking] = useState(false);
  const { audioRef } = useAudioRef({ setIsPlaying: setIsSpeaking });

  const { pauseGlobalAudio } = usePauseGlobalAudio(index);
  const [voice, setVoice] = useRecoilState(store.voice);
  const languageTTS = useRecoilValue(store.languageTTS);
  const globalIsPlaying = useRecoilValue(store.globalAudioPlayingFamily(index));

  const isSpeaking = isSpeakingState || (isLast && globalIsPlaying);

  const {
    generateSpeechLocal: generateSpeech,
    cancelSpeechLocal: cancelSpeech,
    voices,
  } = useTextToSpeechBrowser({ setIsSpeaking });

  useEffect(() => {
    const firstVoice = voices[0];
    if (!voices.length || typeof firstVoice !== 'object') {
      return;
    }

    const lastSelectedVoice = voices.find((v) =>
      typeof v === 'object' ? v.value === voice : v === voice,
    );
    if (lastSelectedVoice != null) {
      const currentVoice =
        typeof lastSelectedVoice === 'object' ? lastSelectedVoice.value : lastSelectedVoice;
      logger.log('useTextToSpeech.ts - Effect:', { voices, voice: currentVoice });
      setVoice(currentVoice);
      return;
    }

    // Prefer a voice matching the selected language
    const langBase = languageTTS.split('-')[0].toLowerCase();
    const langVoice = voices.find((v) => {
      const name = (typeof v === 'object' ? v.value : v).toLowerCase();
      return name.includes(languageTTS.toLowerCase()) || name.includes(langBase);
    });
    const preferred = langVoice ?? firstVoice;
    const preferredValue = typeof preferred === 'object' ? preferred.value : preferred;
    logger.log('useTextToSpeech.ts - Effect (lang-matched):', { voices, voice: preferredValue });
    setVoice(preferredValue);
  }, [setVoice, voice, voices, languageTTS]);

  const handleMouseDown = () => {
    isMouseDownRef.current = true;
    timerRef.current = window.setTimeout(() => {
      if (isMouseDownRef.current) {
        const messageContent = content ?? '';
        const parsedMessage =
          typeof messageContent === 'string' ? messageContent : parseTextParts(messageContent);
        generateSpeech(parsedMessage);
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
    if (isSpeaking === true) {
      cancelSpeech();
      pauseGlobalAudio();
    } else {
      const messageContent = content ?? '';
      const parsedMessage =
        typeof messageContent === 'string' ? messageContent : parseTextParts(messageContent);
      generateSpeech(parsedMessage);
    }
  };

  return {
    handleMouseDown,
    handleMouseUp,
    toggleSpeech,
    isSpeaking,
    isLoading: false,
    audioRef,
    voices,
  };
};

export default useTTSBrowser;
