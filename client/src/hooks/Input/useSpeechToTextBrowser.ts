import { useEffect } from 'react';
import { useRecoilState } from 'recoil';
import { useToastContext } from '~/Providers';
import store from '~/store';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';

const useSpeechToTextBrowser = () => {
  const { showToast } = useToastContext();
  const [endpointSTT] = useRecoilState<string>(store.endpointSTT);

  const { transcript, listening, resetTranscript, browserSupportsSpeechRecognition } =
    useSpeechRecognition();

  const toggleListening = () => {
    if (browserSupportsSpeechRecognition) {
      if (listening) {
        SpeechRecognition.stopListening();
      } else {
        SpeechRecognition.startListening();
      }
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
    isListening: listening,
    isLoading: false,
    text: transcript,
    startRecording: toggleListening,
    stopRecording: () => {
      SpeechRecognition.stopListening();
      resetTranscript();
    },
  };
};

export default useSpeechToTextBrowser;
