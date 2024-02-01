function useTextToSpeech() {
  const generateSpeechLocal = (text, onEnd) => {
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

  const cancelSpeechLocal = () => {
    const synth = window.speechSynthesis;
    synth.cancel();
  };

  return { generateSpeechLocal, cancelSpeechLocal };
}

export default useTextToSpeech;
