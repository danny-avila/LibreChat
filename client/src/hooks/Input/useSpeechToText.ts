import { useState, useEffect } from 'react';
import useSpeechToTextBrowser from './useSpeechToTextBrowser';
import useSpeechToTextExternal from './useSpeechToTextExternal';
import { useRecoilState } from 'recoil';
import store from '~/store';

const useSpeechToText = (handleTranscriptionComplete: (text: string) => void) => {
  const [endpointSTT] = useRecoilState<string>(store.endpointSTT);
  const useExternalSpeechToText = endpointSTT === 'external';
  const [animatedText, setAnimatedText] = useState('');

  const {
    isListening: speechIsListeningBrowser,
    isLoading: speechIsLoadingBrowser,
    text: speechTextBrowser,
    startRecording: startSpeechRecordingBrowser,
    stopRecording: stopSpeechRecordingBrowser,
  } = useSpeechToTextBrowser();

  const {
    isListening: speechIsListeningExternal,
    isLoading: speechIsLoadingExternal,
    text: speechTextExternal,
    externalStartRecording: startSpeechRecordingExternal,
    externalStopRecording: stopSpeechRecordingExternal,
    clearText,
  } = useSpeechToTextExternal(handleTranscriptionComplete);

  const isListening = useExternalSpeechToText
    ? speechIsListeningExternal
    : speechIsListeningBrowser;
  const isLoading = useExternalSpeechToText ? speechIsLoadingExternal : speechIsLoadingBrowser;
  const speechTextForm = useExternalSpeechToText ? speechTextExternal : speechTextBrowser;
  const startRecording = useExternalSpeechToText
    ? startSpeechRecordingExternal
    : startSpeechRecordingBrowser;
  const stopRecording = useExternalSpeechToText
    ? stopSpeechRecordingExternal
    : stopSpeechRecordingBrowser;
  const speechText =
    isListening || (speechTextExternal && speechTextExternal.length > 0)
      ? speechTextExternal
      : speechTextForm || '';

  const animateTextTyping = (text: string) => {
    const totalDuration = 2000;
    const frameRate = 60;
    const totalFrames = totalDuration / (1000 / frameRate);
    const charsPerFrame = Math.ceil(text.length / totalFrames);
    let currentIndex = 0;

    const animate = () => {
      currentIndex += charsPerFrame;
      const currentText = text.substring(0, currentIndex);
      setAnimatedText(currentText);

      if (currentIndex < text.length) {
        requestAnimationFrame(animate);
      } else {
        setAnimatedText(text);
      }
    };

    requestAnimationFrame(animate);
  };

  useEffect(() => {
    if (speechText) {
      animateTextTyping(speechText);
    }
  }, [speechText]);

  return {
    isListening,
    isLoading,
    startRecording,
    stopRecording,
    speechText: animatedText,
    clearText,
  };
};

export default useSpeechToText;
