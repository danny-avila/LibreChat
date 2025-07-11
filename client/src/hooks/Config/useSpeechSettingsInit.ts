import { useEffect, useRef } from 'react';
import { useSetAtom } from 'jotai';
import { useGetCustomConfigSpeechQuery } from 'librechat-data-provider/react-query';
import { logger } from '~/utils';
import store from '~/store';

/**
 * Initializes speech-related Recoil values from the server-side custom
 * configuration on first load (only when the user is authenticated)
 */
export default function useSpeechSettingsInit(isAuthenticated: boolean) {
  const { data } = useGetCustomConfigSpeechQuery({ enabled: isAuthenticated });

  const setters = useRef({
    conversationMode: useSetAtom(store.conversationMode),
    advancedMode: useSetAtom(store.advancedMode),
    speechToText: useSetAtom(store.speechToText),
    textToSpeech: useSetAtom(store.textToSpeech),
    cacheTTS: useSetAtom(store.cacheTTS),
    engineSTT: useSetAtom(store.engineSTT),
    languageSTT: useSetAtom(store.languageSTT),
    autoTranscribeAudio: useSetAtom(store.autoTranscribeAudio),
    decibelValue: useSetAtom(store.decibelValue),
    autoSendText: useSetAtom(store.autoSendText),
    engineTTS: useSetAtom(store.engineTTS),
    voice: useSetAtom(store.voice),
    cloudBrowserVoices: useSetAtom(store.cloudBrowserVoices),
    languageTTS: useSetAtom(store.languageTTS),
    automaticPlayback: useSetAtom(store.automaticPlayback),
    playbackRate: useSetAtom(store.playbackRate),
  }).current;

  useEffect(() => {
    if (!isAuthenticated || !data || data.message === 'not_found') return;

    logger.log('Initializing speech settings from config:', data);

    Object.entries(data).forEach(([key, value]) => {
      if (key === 'sttExternal' || key === 'ttsExternal') return;

      if (localStorage.getItem(key) !== null) return;

      const setter = setters[key as keyof typeof setters];
      if (setter) {
        logger.log(`Setting default speech setting: ${key} = ${value}`);
        setter(value as any);
      }
    });
  }, [isAuthenticated, data, setters]);
}
