import { useState, useEffect } from 'react';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import { useToastContext } from '~/Providers';

const useSpeechToTextBrowser = () => {
  const { data: startupConfig } = useGetStartupConfig();
  const { showToast } = useToastContext();
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [text, setText] = useState('');

  const initializeSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result: unknown) => (result as SpeechRecognitionResult)[0].transcript)
        .join('');
      setText(transcript);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    return recognition;
  };

  useEffect(() => {
    if (startupConfig?.speechToTextExternal) {
      setIsSpeechSupported(false);
      return;
    }

    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      setIsSpeechSupported(true);
    } else {
      setIsSpeechSupported(false);
      return;
    }

    const recognition = initializeSpeechRecognition();

    if (isListening) {
      recognition.start();
    }

    return () => {
      recognition.stop();
    };
  }, [isListening, startupConfig?.speechToTextExternal, showToast]);

  const toggleListening = () => {
    if (isSpeechSupported) {
      setIsListening((prevState) => !prevState);
    } else {
      showToast({ message: 'Browser does not support SpeechRecognition', status: 'error' });
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.shiftKey && e.altKey && e.code === 'KeyL' && !startupConfig?.speechToTextExternal) {
        toggleListening();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    isListening,
    isLoading: false,
    text,
    startRecording: toggleListening,
    stopRecording: () => setIsListening(false),
  };
};

export default useSpeechToTextBrowser;
