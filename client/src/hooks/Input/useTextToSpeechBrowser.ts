import { useState } from 'react';

function useTextToSpeechBrowser() {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const getVoices = () => {
    return new Promise((resolve) => {
      let voices = speechSynthesis.getVoices();
      if (voices.length) {
        resolve(voices);
      } else {
        speechSynthesis.onvoiceschanged = () => {
          voices = speechSynthesis.getVoices();
          resolve(voices);
        };
      }
    });
  };

  const generateSpeechLocal = (text: string) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
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
