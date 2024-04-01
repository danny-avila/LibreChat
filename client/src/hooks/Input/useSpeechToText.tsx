import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import useSpeechToTextBrowser from './useSpeechToTextBrowser';
import useSpeechToTextExternal from './useSpeechToTextExternal';

const useSpeechToText = (handleTranscriptionComplete: (text: string) => void) => {
  const { data: startupConfig } = useGetStartupConfig();
  const useExternalSpeech = startupConfig?.speechToTextExternal;

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

  const isListening = useExternalSpeech ? speechIsListeningExternal : speechIsListeningBrowser;
  const isLoading = useExternalSpeech ? speechIsLoadingExternal : speechIsLoadingBrowser;
  const speechTextForm = useExternalSpeech ? speechTextExternal : speechTextBrowser;
  const startRecording = useExternalSpeech
    ? startSpeechRecordingExternal
    : startSpeechRecordingBrowser;
  const stopRecording = useExternalSpeech
    ? stopSpeechRecordingExternal
    : stopSpeechRecordingBrowser;
  const speechText =
    isListening || (speechTextExternal && speechTextExternal.length > 0)
      ? speechTextExternal
      : speechTextForm || '';

  return {
    isListening,
    isLoading,
    startRecording,
    stopRecording,
    speechText,
    clearText,
  };
};

export default useSpeechToText;
