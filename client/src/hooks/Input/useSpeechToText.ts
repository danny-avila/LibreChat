import { useState, useEffect, useCallback } from 'react';
import useSpeechToTextBrowser from './useSpeechToTextBrowser';
import useSpeechToTextExternal from './useSpeechToTextExternal';
import useGetAudioSettings from './useGetAudioSettings';

const useSpeechToText = (handleTranscriptionComplete: (text: string) => void) => {
  const { speechToTextEndpoint } = useGetAudioSettings();
  const [animatedText, setAnimatedText] = useState('');

  const {
    isListening: speechIsListeningBrowser,
    isLoading: speechIsLoadingBrowser,
    interimTranscript: interimTranscriptBrowser,
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

  const animateTextTyping = useCallback((text: string) => {
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
  }, []);

  useEffect(() => {
    if (speechTextExternal && speechToTextEndpoint === 'external') {
      animateTextTyping(speechTextExternal);
    }
  }, [speechTextExternal, speechToTextEndpoint, animateTextTyping]);

  if (speechToTextEndpoint === 'browser') {
    return {
      isListening: speechIsListeningBrowser,
      isLoading: speechIsLoadingBrowser,
      speechTextForm: speechTextBrowser,
      startRecording: startSpeechRecordingBrowser,
      stopRecording: stopSpeechRecordingBrowser,
      interimTranscript: interimTranscriptBrowser,
      speechText: speechTextBrowser,
      clearText,
    };
  } else if (speechToTextEndpoint === 'external') {
    return {
      isListening: speechIsListeningExternal,
      isLoading: speechIsLoadingExternal,
      speechTextForm: speechTextExternal,
      startRecording: startSpeechRecordingExternal,
      stopRecording: stopSpeechRecordingExternal,
      interimTranscript: '',
      speechText: animatedText,
      clearText,
    };
  }

  // Default case (should not happen, but TypeScript requires a return statement)
  throw new Error('Invalid speechToTextEndpoint');
};

export default useSpeechToText;
