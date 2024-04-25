import useSpeechToTextBrowser from './useSpeechToTextBrowser';
import useSpeechToTextExternal from './useSpeechToTextExternal';
import { useRecoilState } from 'recoil';
import store from '~/store';

const useSpeechToText = (handleTranscriptionComplete: (text: string) => void) => {
  const [endpointSTT] = useRecoilState<string>(store.endpointSTT);
  const useExternalSpeechToText = endpointSTT === 'external';

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
