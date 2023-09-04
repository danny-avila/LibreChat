import { useState, useEffect } from 'react';

function useSpeechSynthesis() {
  //const [isSpeechEnabled, setIsSpeechEnabled] = useState(false);
  //const [textToSpeak, setTextToSpeak] = useState('');

  const synthesizeSpeech = (text) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    synth.speak(utterance);
    //setTextToSpeak(text);
  };

  //const toggleSpeechSynthesis = () => {
  //  setIsSpeechEnabled(!isSpeechEnabled);
  //  console.log('Toggle Text-To-Speech', !isSpeechEnabled);
  //};

  const cancelSpeech = () => {
    const synth = window.speechSynthesis;
    synth.cancel();
  };
  
  //const handleKeyDown = (event) => {
  //  if (event.shiftKey && event.altKey && event.key === 'P') {
  //    toggleSpeechSynthesis();
  //  }
  //};

  //useEffect(() => {
  //  window.addEventListener('keydown', handleKeyDown);

 //   return () => {
 //     window.removeEventListener('keydown', handleKeyDown);
 //   };
 // }, [isSpeechEnabled]);

  //useEffect(() => {
  //  if (!isSpeechEnabled || !textToSpeak) return;

  //  const synth = window.speechSynthesis;
  //  synth.cancel();
  //  const utterance = new SpeechSynthesisUtterance(textToSpeak);
  //  synth.speak(utterance);
  //}, [textToSpeak, isSpeechEnabled]);
// return { synthesizeSpeech, toggleSpeechSynthesis, cancelSpeech, isSpeechEnabled };
  return { synthesizeSpeech, cancelSpeech };
}

export default useSpeechSynthesis;
