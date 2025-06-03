import { useRecoilState } from 'recoil';
import * as Tabs from '@radix-ui/react-tabs';
import { Lightbulb, Cog } from 'lucide-react';
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
import { useOnClickOutside, useMediaQuery, useLocalize } from '~/hooks';
import ConversationModeSwitch from './ConversationModeSwitch';
import { cn, logger } from '~/utils';
import store from '~/store';

function Speech() {
  const localize = useLocalize();

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
  const [voice, setVoice] = useRecoilState(store.voice);
  const [cloudBrowserVoices, setCloudBrowserVoices] = useRecoilState<boolean>(
    store.cloudBrowserVoices,
  );
  const [languageTTS, setLanguageTTS] = useRecoilState<string>(store.languageTTS);
  const [automaticPlayback, setAutomaticPlayback] = useRecoilState(store.automaticPlayback);
  const [playbackRate, setPlaybackRate] = useRecoilState(store.playbackRate);

  const updateSetting = useCallback(
    (key: string, newValue: string | number) => {
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
    if (data && data.message !== 'not_found') {
      Object.entries(data).forEach(([key, value]) => {
        updateSetting(key, value);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Reset engineTTS if it is set to a removed/invalid value (e.g., 'edge')
  useEffect(() => {
    const validEngines = ['browser', 'external'];
    if (!validEngines.includes(engineTTS)) {
      setEngineTTS('browser');
    }
  }, [engineTTS, setEngineTTS]);

  logger.log({ sttExternal, ttsExternal });

  const contentRef = useRef(null);
  useOnClickOutside(contentRef, () => confirmClear && setConfirmClear(false), []);

  return (
    <Tabs.Root
      defaultValue={'simple'}
      orientation="horizontal"
      value={advancedMode ? 'advanced' : 'simple'}
    >
      <div className="sticky -top-1 z-50 mb-4 bg-white dark:bg-gray-700">
        <Tabs.List className="flex justify-center bg-background">
          <Tabs.Trigger
            onClick={() => setAdvancedMode(false)}
            className={cn(
              'group m-1 flex items-center justify-center gap-2 bg-transparent px-4 py-2 text-sm text-text-secondary transition-all duration-200 ease-in-out radix-state-active:bg-secondary radix-state-active:text-foreground radix-state-active:shadow-lg',
              isSmallScreen ? 'flex-row rounded-lg' : 'rounded-xl',
              'w-full',
            )}
            value="simple"
            style={{ userSelect: 'none' }}
          >
            <Lightbulb />
            {localize('com_ui_simple')}
          </Tabs.Trigger>
          <Tabs.Trigger
            onClick={() => setAdvancedMode(true)}
            className={cn(
              'group m-1 flex items-center justify-center gap-2 bg-transparent px-4 py-2 text-sm text-text-secondary transition-all duration-200 ease-in-out radix-state-active:bg-secondary radix-state-active:text-foreground radix-state-active:shadow-lg',
              isSmallScreen ? 'flex-row rounded-lg' : 'rounded-xl',
              'w-full',
            )}
            value="advanced"
            style={{ userSelect: 'none' }}
          >
            <Cog />
            {localize('com_ui_advanced')}
          </Tabs.Trigger>
        </Tabs.List>
      </div>

      <Tabs.Content value={'simple'}>
        <div className="flex flex-col gap-3 text-sm text-text-primary">
          <SpeechToTextSwitch />
          <EngineSTTDropdown external={sttExternal} />
          <LanguageSTTDropdown />
          <div className="h-px bg-border-medium" role="none" />
          <TextToSpeechSwitch />
          <EngineTTSDropdown external={ttsExternal} />
          <VoiceDropdown />
        </div>
      </Tabs.Content>

      <Tabs.Content value={'advanced'}>
        <div className="flex flex-col gap-3 text-sm text-text-primary">
          <ConversationModeSwitch />
          <div className="mt-2 h-px bg-border-medium" role="none" />
          <SpeechToTextSwitch />

          <EngineSTTDropdown external={sttExternal} />

          <LanguageSTTDropdown />
          <div className="pb-2">
            <AutoTranscribeAudioSwitch />
          </div>
          {autoTranscribeAudio && (
            <div className="pb-2">
              <DecibelSelector />
            </div>
          )}
          <div className="pb-2">
            <AutoSendTextSelector />
          </div>
          <div className="h-px bg-border-medium" role="none" />
          <div className="pb-3">
            <TextToSpeechSwitch />
          </div>
          <AutomaticPlaybackSwitch />
          <EngineTTSDropdown external={ttsExternal} />
          <VoiceDropdown />
          {engineTTS === 'browser' && (
            <div className="pb-2">
              <CloudBrowserVoicesSwitch />
            </div>
          )}
          <div className="pb-2">
            <PlaybackRate />
          </div>
          <CacheTTSSwitch />
        </div>
      </Tabs.Content>
    </Tabs.Root>
  );
}

export default React.memo(Speech);
