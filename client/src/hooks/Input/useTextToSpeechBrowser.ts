import { useRecoilState } from 'recoil';
import { useState } from 'react';
import store from '~/store';

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

  return { generateSpeechLocal, cancelSpeechLocal, isSpeaking };
}

export default useTextToSpeechBrowser;
