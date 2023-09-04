import { useState, useEffect } from 'react';
import hotkeys from 'hotkeys-js';

const useSpeechRecognition = (ask) => {
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [text, setText] = useState('');

  useEffect(() => {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      setIsSpeechSupported(true);
    } else {
      console.log("Browser does not support SpeechRecognition");
      setIsSpeechSupported(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.onstart = () => {
      console.log("Speech recognition started");
    };

    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let transcript = '';

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        transcript += result[0].transcript;

        if (result.isFinal) {
          setText(transcript);
          //Enable below code to auto submit
          //ask({ text: transcript });
        }
      }

      // Set the text with both interim and final results
      setText(transcript);
    };

    recognition.onend = () => {
      setIsListening(false);
      setText('');
    };

    if (isListening) {
      recognition.start();
    } else {
      recognition.stop();
    }

    return () => {
      recognition.stop();
    };
  }, [isListening]);

  const toggleListening = (event) => {
    if (event) {
      event.preventDefault();
    }
    if (isSpeechSupported) {
      setIsListening((prevState) => !prevState);
    }
  };

  useEffect(() => {
    console.log('Setting up hotkeys');
    hotkeys('shift+alt+l', (event, handler) => {
      console.log('Hotkey triggered');
      event.preventDefault();
      if (isSpeechSupported) {
        toggleListening();
      }
    });

    return () => {
      hotkeys.unbind('shift+alt+l');
    };
  }, [isSpeechSupported]);
  
  return { isSpeechSupported, isListening, text, toggleListening };
};

export default useSpeechRecognition;
