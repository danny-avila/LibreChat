import { useRecoilState } from 'recoil';
import { useState } from 'react';
import store from '~/store';

interface VoiceOption {
  value: string;
  display: string;
}

function useTextToSpeechBrowser() {
  const [cloudBrowserVoices] = useRecoilState(store.cloudBrowserVoices);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceName] = useRecoilState(store.voice);

  const generateSpeechLocal = (text: string) => {
    const synth = window.speechSynthesis;
    const voices = synth.getVoices().filter((v) => cloudBrowserVoices || v.localService === true);
    const voice = voices.find((v) => v.name === voiceName);

    if (!voice) {
      return;
    }

    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.onend = () => {
      setIsSpeaking(false);
    };
    setIsSpeaking(true);
    synth.speak(utterance);
  };

  const cancelSpeechLocal = () => {
    const synth = window.speechSynthesis;
    synth.cancel();
    setIsSpeaking(false);
  };

  const voices = (): Promise<VoiceOption[]> => {
    return new Promise((resolve) => {
      const getAndMapVoices = () => {
        const availableVoices = speechSynthesis
          .getVoices()
          .filter((v) => cloudBrowserVoices || v.localService === true);

        const voiceOptions: VoiceOption[] = availableVoices.map((v) => ({
          value: v.name,
          display: v.name,
        }));

        resolve(voiceOptions);
      };

      if (speechSynthesis.getVoices().length) {
        getAndMapVoices();
      } else {
        speechSynthesis.onvoiceschanged = getAndMapVoices;
      }
    });
  };

  return { generateSpeechLocal, cancelSpeechLocal, isSpeaking, voices };
}

export default useTextToSpeechBrowser;
