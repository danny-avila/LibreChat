import useSpeechToTextBrowser from './useSpeechToTextBrowser';
import useSpeechToTextExternal from './useSpeechToTextExternal';
import useGetAudioSettings from './useGetAudioSettings';

/**
 * Main speech-to-text hook that provides a unified interface for both browser-based
 * and external speech-to-text services. This hook acts as a facade pattern, routing
 * calls to the appropriate implementation based on the configured endpoint.
 * 
 * @param setText - Callback function to update the text input field with transcribed text
 * @param onTranscriptionComplete - Callback function called when transcription is complete
 * @returns Object containing speech-to-text control functions and state
 */
const useSpeechToText = (
  setText: (text: string) => void,
  onTranscriptionComplete: (text: string) => void,
): {
  isLoading?: boolean;
  isListening?: boolean;
  stopRecording: () => void | (() => Promise<void>);
  startRecording: () => void | (() => Promise<void>);
  clearAccumulatedText?: () => void;
} => {
  // Get the configured speech-to-text endpoint from user settings
  const { speechToTextEndpoint } = useGetAudioSettings();
  // Determine if we should use external STT service or browser's built-in recognition
  const externalSpeechToText = speechToTextEndpoint === 'external';

  // Initialize browser-based speech-to-text using Web Speech API
  const {
    isListening: speechIsListeningBrowser,
    isLoading: speechIsLoadingBrowser,
    startRecording: startSpeechRecordingBrowser,
    stopRecording: stopSpeechRecordingBrowser,
    clearAccumulatedText: clearBrowserText,
  } = useSpeechToTextBrowser(setText, onTranscriptionComplete);

  // Initialize external speech-to-text service (e.g., OpenAI Whisper)
  const {
    isListening: speechIsListeningExternal,
    isLoading: speechIsLoadingExternal,
    externalStartRecording: startSpeechRecordingExternal,
    externalStopRecording: stopSpeechRecordingExternal,
    clearAccumulatedText: clearExternalText,
  } = useSpeechToTextExternal(setText, onTranscriptionComplete);

  // Route state and functions to the appropriate implementation based on configuration
  const isListening = externalSpeechToText ? speechIsListeningExternal : speechIsListeningBrowser;
  const isLoading = externalSpeechToText ? speechIsLoadingExternal : speechIsLoadingBrowser;

  // Route recording control functions to the appropriate implementation
  const startRecording = externalSpeechToText
    ? startSpeechRecordingExternal
    : startSpeechRecordingBrowser;
  const stopRecording = externalSpeechToText
    ? stopSpeechRecordingExternal
    : stopSpeechRecordingBrowser;
  const clearAccumulatedText = externalSpeechToText
    ? clearExternalText
    : clearBrowserText;

  return {
    isLoading,
    isListening,
    stopRecording,
    startRecording,
    clearAccumulatedText,
  };
};

export default useSpeechToText;
