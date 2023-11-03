function useSpeechSynthesis() {
  const synthesizeSpeech = (text) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    synth.speak(utterance);
  };

  const cancelSpeech = () => {
    const synth = window.speechSynthesis;
    synth.cancel();
  };

  return { synthesizeSpeech, cancelSpeech };
}

export default useSpeechSynthesis;
