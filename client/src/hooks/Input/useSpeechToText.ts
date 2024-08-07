import { useState, useEffect } from 'react';
import useSpeechToTextBrowser from './useSpeechToTextBrowser';
import useSpeechToTextExternal from './useSpeechToTextExternal';
import useGetAudioSettings from './useGetAudioSettings';

const useSpeechToText = (handleTranscriptionComplete: (text: string) => void) => {
  const { speechToTextEndpoint } = useGetAudioSettings();
  const [animatedText, setAnimatedText] = useState('');
  const externalSpeechToText = speechToTextEndpoint === 'external';

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

  const isListening = externalSpeechToText ? speechIsListeningExternal : speechIsListeningBrowser;
  const isLoading = externalSpeechToText ? speechIsLoadingExternal : speechIsLoadingBrowser;
  const speechTextForm = externalSpeechToText ? speechTextExternal : speechTextBrowser;
  const startRecording = externalSpeechToText
    ? startSpeechRecordingExternal
    : startSpeechRecordingBrowser;
  const stopRecording = externalSpeechToText
    ? stopSpeechRecordingExternal
    : stopSpeechRecordingBrowser;
  const speechText =
    isListening || (speechTextExternal && speechTextExternal.length > 0)
      ? speechTextExternal
      : speechTextForm || '';
  // for a future real-time STT external
  const interimTranscript = externalSpeechToText ? '' : interimTranscriptBrowser;

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
    if (speechText && externalSpeechToText) {
      animateTextTyping(speechText);
    }
  }, [speechText, externalSpeechToText]);

  return {
    isListening,
    isLoading,
    startRecording,
    stopRecording,
    interimTranscript,
    speechText: externalSpeechToText ? animatedText : speechText,
    clearText,
  };
};

export default useSpeechToText;
