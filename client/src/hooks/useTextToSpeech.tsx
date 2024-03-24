import { useState } from 'react';

function useTextToSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const generateSpeechLocal = (text) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
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

export default useTextToSpeech;
