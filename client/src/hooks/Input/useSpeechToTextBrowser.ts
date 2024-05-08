import { useState, useEffect } from 'react';
import { useRecoilState } from 'recoil';
import { useToastContext } from '~/Providers';
import store from '~/store';

const useSpeechToTextBrowser = () => {
  const { showToast } = useToastContext();
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [endpointSTT] = useRecoilState<string>(store.endpointSTT);
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

    recognition.onerror = (event) => {
      showToast({
        message: 'An error occurred in SpeechRecognition: ' + event.error,
        status: 'error',
      });
    };

    return recognition;
  };

  useEffect(() => {
    if (
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) &&
      endpointSTT === 'browser'
    ) {
      setIsSpeechSupported(true);
    } else {
      setIsSpeechSupported(false);
    }

    const recognition = initializeSpeechRecognition();

    if (isListening) {
      recognition.start();
    }

    return () => {
      recognition.stop();
    };
  }, [isListening, endpointSTT, showToast]);

  const toggleListening = () => {
    if (isSpeechSupported) {
      setIsListening((prevState) => !prevState);
    } else {
      showToast({
        message: 'Browser does not support SpeechRecognition',
        status: 'error',
      });
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && e.altKey && e.code === 'KeyL' && endpointSTT === 'browser') {
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
