function useSpeechSynthesis() {
  const synthesizeSpeech = (text, onEnd) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => {
      if (typeof onEnd === 'function') {
        onEnd();
      }
    };
    synth.speak(utterance);
  };

  const cancelSpeech = () => {
    const synth = window.speechSynthesis;
    synth.cancel();
  };

  return { synthesizeSpeech, cancelSpeech };
}

export default useSpeechSynthesis;
