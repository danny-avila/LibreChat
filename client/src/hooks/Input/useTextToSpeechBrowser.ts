import { useState } from 'react';

function useTextToSpeechBrowser() {
  const [isSpeaking, setIsSpeaking] = useState(false);

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
