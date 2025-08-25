import { useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import store from '~/store';

/**
 * Hook to retrieve current audio engine settings from the global store.
 * 
 * This hook provides access to the configured speech-to-text and text-to-speech
 * engines that the user has selected in their settings. The settings determine
 * whether to use browser-based APIs or external services.
 * 
 * Available STT engines:
 * - 'browser': Use Web Speech API (SpeechRecognition)
 * - 'external': Use server-side transcription service (e.g., OpenAI Whisper)
 * 
 * Available TTS engines:
 * - 'browser': Use Web Speech API (SpeechSynthesis)
 * - 'external': Use server-side text-to-speech service
 * 
 * @returns Object containing current STT and TTS endpoint configurations
 */
const useGetAudioSettings = () => {
  // Get current engine selections from Recoil store
  const engineSTT = useRecoilValue<string>(store.engineSTT);
  const engineTTS = useRecoilValue<string>(store.engineTTS);

  // Map engine values to endpoint identifiers
  const speechToTextEndpoint = engineSTT;
  const textToSpeechEndpoint = engineTTS;

  // Memoize the settings object to prevent unnecessary re-renders
  return useMemo(
    () => ({ speechToTextEndpoint, textToSpeechEndpoint }),
    [speechToTextEndpoint, textToSpeechEndpoint],
  );
};

export default useGetAudioSettings;
