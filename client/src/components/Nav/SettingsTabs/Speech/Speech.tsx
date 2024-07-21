import { useRecoilState } from 'recoil';
import * as Tabs from '@radix-ui/react-tabs';
import { Lightbulb, Cog } from 'lucide-react';
import { SettingsTabValues } from 'librechat-data-provider';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useGetCustomConfigSpeechQuery } from 'librechat-data-provider/react-query';
import {
  CloudBrowserVoicesSwitch,
  AutomaticPlaybackSwitch,
  TextToSpeechSwitch,
  EngineTTSDropdown,
  CacheTTSSwitch,
  VoiceDropdown,
  PlaybackRate,
} from './TTS';
import {
  AutoTranscribeAudioSwitch,
  LanguageSTTDropdown,
  SpeechToTextSwitch,
  AutoSendTextSelector,
  EngineSTTDropdown,
  DecibelSelector,
} from './STT';
import ConversationModeSwitch from './ConversationModeSwitch';
import { useOnClickOutside, useMediaQuery } from '~/hooks';
import { cn, logger } from '~/utils';
import store from '~/store';

function Speech() {
  const [confirmClear, setConfirmClear] = useState(false);
  const { data } = useGetCustomConfigSpeechQuery();
  const isSmallScreen = useMediaQuery('(max-width: 767px)');

  const [sttExternal, setSttExternal] = useState(false);
  const [ttsExternal, setTtsExternal] = useState(false);
  const [advancedMode, setAdvancedMode] = useRecoilState(store.advancedMode);
  const [autoTranscribeAudio, setAutoTranscribeAudio] = useRecoilState(store.autoTranscribeAudio);
  const [conversationMode, setConversationMode] = useRecoilState(store.conversationMode);
  const [speechToText, setSpeechToText] = useRecoilState(store.speechToText);
  const [textToSpeech, setTextToSpeech] = useRecoilState(store.textToSpeech);
  const [cacheTTS, setCacheTTS] = useRecoilState(store.cacheTTS);
  const [engineSTT, setEngineSTT] = useRecoilState<string>(store.engineSTT);
  const [languageSTT, setLanguageSTT] = useRecoilState<string>(store.languageSTT);
  const [decibelValue, setDecibelValue] = useRecoilState(store.decibelValue);
  const [autoSendText, setAutoSendText] = useRecoilState(store.autoSendText);
  const [engineTTS, setEngineTTS] = useRecoilState<string>(store.engineTTS);
  const [voice, setVoice] = useRecoilState<string>(store.voice);
  const [cloudBrowserVoices, setCloudBrowserVoices] = useRecoilState<boolean>(
    store.cloudBrowserVoices,
  );
  const [languageTTS, setLanguageTTS] = useRecoilState<string>(store.languageTTS);
  const [automaticPlayback, setAutomaticPlayback] = useRecoilState(store.automaticPlayback);
  const [playbackRate, setPlaybackRate] = useRecoilState(store.playbackRate);

  const updateSetting = useCallback(
    (key, newValue) => {
      const settings = {
        sttExternal: { value: sttExternal, setFunc: setSttExternal },
        ttsExternal: { value: ttsExternal, setFunc: setTtsExternal },
        conversationMode: { value: conversationMode, setFunc: setConversationMode },
        advancedMode: { value: advancedMode, setFunc: setAdvancedMode },
        speechToText: { value: speechToText, setFunc: setSpeechToText },
        textToSpeech: { value: textToSpeech, setFunc: setTextToSpeech },
        cacheTTS: { value: cacheTTS, setFunc: setCacheTTS },
        engineSTT: { value: engineSTT, setFunc: setEngineSTT },
        languageSTT: { value: languageSTT, setFunc: setLanguageSTT },
        autoTranscribeAudio: { value: autoTranscribeAudio, setFunc: setAutoTranscribeAudio },
        decibelValue: { value: decibelValue, setFunc: setDecibelValue },
        autoSendText: { value: autoSendText, setFunc: setAutoSendText },
        engineTTS: { value: engineTTS, setFunc: setEngineTTS },
        voice: { value: voice, setFunc: setVoice },
        cloudBrowserVoices: { value: cloudBrowserVoices, setFunc: setCloudBrowserVoices },
        languageTTS: { value: languageTTS, setFunc: setLanguageTTS },
        automaticPlayback: { value: automaticPlayback, setFunc: setAutomaticPlayback },
        playbackRate: { value: playbackRate, setFunc: setPlaybackRate },
      };

      if (
        (settings[key].value !== newValue || settings[key].value === newValue || !settings[key]) &&
        settings[key].value === 'sttExternal' &&
        settings[key].value === 'ttsExternal'
      ) {
        return;
      }

      const setting = settings[key];
      setting.setFunc(newValue);
    },
    [
      sttExternal,
      ttsExternal,
      conversationMode,
      advancedMode,
      speechToText,
      textToSpeech,
      cacheTTS,
      engineSTT,
      languageSTT,
      autoTranscribeAudio,
      decibelValue,
      autoSendText,
      engineTTS,
      voice,
      cloudBrowserVoices,
      languageTTS,
      automaticPlayback,
      playbackRate,
      setSttExternal,
      setTtsExternal,
      setConversationMode,
      setAdvancedMode,
      setSpeechToText,
      setTextToSpeech,
      setCacheTTS,
      setEngineSTT,
      setLanguageSTT,
      setAutoTranscribeAudio,
      setDecibelValue,
      setAutoSendText,
      setEngineTTS,
      setVoice,
      setCloudBrowserVoices,
      setLanguageTTS,
      setAutomaticPlayback,
      setPlaybackRate,
    ],
  );

  useEffect(() => {
    if (data) {
      Object.entries(data).forEach(([key, value]) => {
        updateSetting(key, value);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  logger.log({ sttExternal, ttsExternal });

  const contentRef = useRef(null);
  useOnClickOutside(contentRef, () => confirmClear && setConfirmClear(false), []);

  return (
    <Tabs.Content
      value={SettingsTabValues.SPEECH}
      role="tabpanel"
      className="w-full md:min-h-[271px]"
      ref={contentRef}
    >
      <Tabs.Root
        defaultValue={'simple'}
        orientation="horizontal"
        value={advancedMode ? 'advanced' : 'simple'}
      >
        <div className="sticky -top-1 z-50 mb-4 bg-white dark:bg-gray-700">
          <Tabs.List className="flex justify-center bg-white dark:bg-gray-700">
            <Tabs.Trigger
              onClick={() => setAdvancedMode(false)}
              className={cn(
                'group m-1 flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm text-black transition-all duration-200 ease-in-out radix-state-active:bg-white radix-state-active:text-black dark:text-white dark:radix-state-active:bg-gray-600',
                isSmallScreen
                  ? 'flex-row items-center justify-center text-sm text-gray-700 radix-state-active:bg-gray-100 radix-state-active:text-black dark:text-gray-300 dark:radix-state-active:text-white'
                  : 'bg-white radix-state-active:bg-gray-100 dark:bg-gray-700',
                'w-full',
              )}
              value="simple"
              style={{ userSelect: 'none' }}
            >
              <Lightbulb />
              Simple
            </Tabs.Trigger>
            <Tabs.Trigger
              onClick={() => setAdvancedMode(true)}
              className={cn(
                'group m-1 flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm text-black transition-all duration-200 ease-in-out radix-state-active:bg-white radix-state-active:text-black dark:text-white dark:radix-state-active:bg-gray-600',
                isSmallScreen
                  ? 'flex-row items-center justify-center text-sm text-gray-700 radix-state-active:bg-gray-100 radix-state-active:text-black dark:text-gray-300 dark:radix-state-active:text-white'
                  : 'bg-white radix-state-active:bg-gray-100 dark:bg-gray-700',
                'w-full',
              )}
              value="advanced"
              style={{ userSelect: 'none' }}
            >
              <Cog />
              Advanced
            </Tabs.Trigger>
          </Tabs.List>
        </div>

        <Tabs.Content value={'simple'}>
          <div className="flex flex-col gap-3 text-sm text-black dark:text-gray-50">
            <div className="border-b last-of-type:border-b-0 dark:border-gray-700">
              <SpeechToTextSwitch />
            </div>
            <div className="border-b last-of-type:border-b-0 dark:border-gray-700">
              <EngineSTTDropdown external={sttExternal} />
            </div>
            <div className="border-b last-of-type:border-b-0 dark:border-gray-700">
              <LanguageSTTDropdown />
            </div>
            <div className="h-px bg-black/20 bg-white/20" role="none" />
            <div className="border-b last-of-type:border-b-0 dark:border-gray-700">
              <TextToSpeechSwitch />
            </div>
            <div className="border-b last-of-type:border-b-0 dark:border-gray-700">
              <EngineTTSDropdown external={ttsExternal} />
            </div>
            <div className="border-b last-of-type:border-b-0 dark:border-gray-700">
              <VoiceDropdown />
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value={'advanced'}>
          <div className="flex flex-col gap-3 text-sm text-black dark:text-gray-50">
            <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
              <ConversationModeSwitch />
            </div>
            <div className="h-px bg-black/20 bg-white/20" role="none" />
            <div className="border-b last-of-type:border-b-0 dark:border-gray-700">
              <SpeechToTextSwitch />
            </div>
            <div className="border-b last-of-type:border-b-0 dark:border-gray-700">
              <EngineSTTDropdown external={sttExternal} />
            </div>
            <div className="border-b last-of-type:border-b-0 dark:border-gray-700">
              <LanguageSTTDropdown />
            </div>
            <div className="border-b pb-2 last-of-type:border-b-0 dark:border-gray-700">
              <AutoTranscribeAudioSwitch />
            </div>
            {autoTranscribeAudio && (
              <div className="border-b pb-2 last-of-type:border-b-0 dark:border-gray-700">
                <DecibelSelector />
              </div>
            )}
            <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
              <AutoSendTextSelector />
            </div>
            <div className="h-px bg-black/20 bg-white/20" role="none" />
            <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
              <TextToSpeechSwitch />
            </div>
            <div className="border-b last-of-type:border-b-0 dark:border-gray-700">
              <AutomaticPlaybackSwitch />
            </div>
            <div className="border-b last-of-type:border-b-0 dark:border-gray-700">
              <EngineTTSDropdown external={ttsExternal} />
            </div>
            <div className="border-b last-of-type:border-b-0 dark:border-gray-700">
              <VoiceDropdown />
            </div>
            {engineTTS === 'browser' && (
              <div className="border-b pb-2 last-of-type:border-b-0 dark:border-gray-700">
                <CloudBrowserVoicesSwitch />
              </div>
            )}
            <div className="border-b pb-2 last-of-type:border-b-0 dark:border-gray-700">
              <PlaybackRate />
            </div>
            <div className="border-b last-of-type:border-b-0 dark:border-gray-700">
              <CacheTTSSwitch />
            </div>
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </Tabs.Content>
  );
}

export default React.memo(Speech);
