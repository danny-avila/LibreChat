import { useState, useEffect } from 'react';

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
          ask({ text: transcript });
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

  const handleKeyDown = (e) => {
    if (e.shiftKey && e.altKey && e.key === 'L') {
      if (isSpeechSupported) {
        toggleListening();
      }
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isListening]);
  
  return { isSpeechSupported, isListening, text, toggleListening };
};

export default useSpeechRecognition;
