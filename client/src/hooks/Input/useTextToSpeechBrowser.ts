import { useRecoilState } from 'recoil';
import { useState, useEffect, useCallback } from 'react';
import store from '~/store';

interface VoiceOption {
  value: string;
  label: string;
}

function useTextToSpeechBrowser({
  setIsSpeaking,
}: {
  setIsSpeaking: (isSpeaking: boolean) => void;
}) {
  const [cloudBrowserVoices] = useRecoilState(store.cloudBrowserVoices);
  const [voiceName] = useRecoilState(store.voice);
  const [voices, setVoices] = useState<VoiceOption[]>([]);

  const updateVoices = useCallback(() => {
    const availableVoices = window.speechSynthesis
      .getVoices()
      .filter((v) => cloudBrowserVoices || v.localService === true);

    const voiceOptions: VoiceOption[] = availableVoices.map((v) => ({
      value: v.name,
      label: v.name,
    }));

    setVoices(voiceOptions);
  }, [cloudBrowserVoices]);

  useEffect(() => {
    if (window.speechSynthesis.getVoices().length) {
      updateVoices();
    } else {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [updateVoices]);

  const generateSpeechLocal = (text: string) => {
    const synth = window.speechSynthesis;
    const voice = voices.find((v) => v.value === voiceName);

    if (!voice) {
      return;
    }

    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = synth.getVoices().find((v) => v.name === voice.value) || null;
    utterance.onend = () => {
      setIsSpeaking(false);
    };
    setIsSpeaking(true);
    synth.speak(utterance);
  };

  const cancelSpeechLocal = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  return { generateSpeechLocal, cancelSpeechLocal, voices };
}

export default useTextToSpeechBrowser;
