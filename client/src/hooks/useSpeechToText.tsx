import { useState, useEffect } from 'react';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import { useToastContext } from '~/Providers';

const useSpeechToText = () => {
  const { data: startupConfig } = useGetStartupConfig();
  const externalSpeechEnabled = startupConfig?.textToSpeechExternal;
  const { showToast } = useToastContext();
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [text, setText] = useState('');
  const [isLoading] = useState(false);

  useEffect(() => {
    if (externalSpeechEnabled === true) {
      setIsSpeechSupported(false);
      return;
    } else if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      setIsSpeechSupported(true);
    } else {
      showToast({ message: 'Browser does not support SpeechRecognition', status: 'error' });
      setIsSpeechSupported(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let transcript = '';

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        transcript += result[0].transcript;

        if (result.isFinal) {
          setText(transcript);
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
    if (e.shiftKey && e.altKey && e.code === 'KeyL') {
      if (isSpeechSupported) {
        toggleListening(e);
      }
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  });

  return { isListening, isLoading, text };
};

export default useSpeechToText;
