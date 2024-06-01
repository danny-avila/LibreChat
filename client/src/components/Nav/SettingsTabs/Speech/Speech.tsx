import * as Tabs from '@radix-ui/react-tabs';
import { SettingsTabValues } from 'librechat-data-provider';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRecoilState } from 'recoil';
import { useOnClickOutside, useGetAudioSettings } from '~/hooks';
import store from '~/store';
import ConversationModeSwitch from './ConversationModeSwitch';
import {
  TextToSpeechSwitch,
  EngineTTSDropdown,
  AutomaticPlaybackSwitch,
  CacheTTSSwitch,
  VoiceDropdown,
  PlaybackRate,
} from './TTS';
import {
  DecibelSelector,
  EngineSTTDropdown,
  LanguageSTTDropdown,
  SpeechToTextSwitch,
  AutoSendTextSwitch,
  AutoTranscribeAudioSwitch,
} from './STT';
import { useCustomConfigSpeechQuery } from '~/data-provider';

const BorderDiv = ({ children }) => (
  <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">{children}</div>
);

const Divider = () => <div className="h-px bg-black/20 bg-white/20" role="none" />;

function Speech() {
  const [confirmClear, setConfirmClear] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data } = useCustomConfigSpeechQuery();

  const [advancedMode, setAdvancedMode] = useRecoilState(store.advancedMode);
  const [autoTranscribeAudio, setAutoTranscribeAudio] = useRecoilState(store.autoTranscribeAudio);
  const [conversationMode, setConversationMode] = useRecoilState(store.conversationMode);
  const [speechToText, setSpeechToText] = useRecoilState(store.speechToText);
  const [textToSpeech, setTextToSpeech] = useRecoilState(store.textToSpeech);
  const [cacheTTS, setCacheTTS] = useRecoilState(store.cacheTTS);
  const [engineSTT, setEngineSTT] = useRecoilState(store.engineSTT);
  const [languageSTT, setLanguageSTT] = useRecoilState(store.languageSTT);
  const [decibelValue, setDecibelValue] = useRecoilState(store.decibelValue);
  const [autoSendText, setAutoSendText] = useRecoilState(store.autoSendText);
  const [engineTTS, setEngineTTS] = useRecoilState(store.engineTTS);
  const [voice, setVoice] = useRecoilState(store.voice);
  const [languageTTS, setLanguageTTS] = useRecoilState(store.languageTTS);
  const [automaticPlayback, setAutomaticPlayback] = useRecoilState(store.automaticPlayback);
  const [playbackRate, setPlaybackRate] = useRecoilState(store.playbackRate);

  const updateSetting = useCallback(
    (key, newValue) => {
      const settings = {
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
        languageTTS: { value: languageTTS, setFunc: setLanguageTTS },
        automaticPlayback: { value: automaticPlayback, setFunc: setAutomaticPlayback },
        playbackRate: { value: playbackRate, setFunc: setPlaybackRate },
      };

      const setting = settings[key];
      setting.setFunc(newValue);
    },
    [
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
      languageTTS,
      automaticPlayback,
      playbackRate,
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
      setLanguageTTS,
      setAutomaticPlayback,
      setPlaybackRate,
    ],
  );

  useEffect(() => {
    if (!data) {
      return;
    }

    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        updateSetting(key, data[key]);
      }
    }
  }, [data, updateSetting]);

  const { externalSpeechToText, externalTextToSpeech } = useGetAudioSettings();

  const contentRef = useRef(null);
  useOnClickOutside(contentRef, () => confirmClear && setConfirmClear(false), []);

  const BorderDivComponent = ({ condition, children }) => {
    if (!condition) {
      return null;
    }
    return <BorderDiv>{children}</BorderDiv>;
  };

  return (
    <Tabs.Content
      value={SettingsTabValues.SPEECH}
      role="tabpanel"
      className="w-full px-4 md:min-h-[300px]"
      ref={contentRef}
    >
      <div className="flex flex-col gap-3 text-sm text-gray-600 dark:text-gray-50">
        <BorderDivComponent condition={true}>
          <ConversationModeSwitch />
        </BorderDivComponent>
        <Divider />
        <BorderDivComponent condition={true}>
          <SpeechToTextSwitch />
        </BorderDivComponent>
        <BorderDivComponent condition={true}>
          <EngineSTTDropdown />
        </BorderDivComponent>
        <BorderDivComponent condition={!externalSpeechToText}>
          <LanguageSTTDropdown />
        </BorderDivComponent>
        <BorderDivComponent condition={advancedMode}>
          <AutoTranscribeAudioSwitch />
        </BorderDivComponent>
        <BorderDivComponent condition={autoTranscribeAudio && externalSpeechToText && advancedMode}>
          <DecibelSelector />
        </BorderDivComponent>
        <BorderDivComponent condition={advancedMode && externalSpeechToText}>
          <AutoSendTextSwitch />
        </BorderDivComponent>
        <Divider />
        <BorderDivComponent condition={true}>
          <TextToSpeechSwitch />
        </BorderDivComponent>
        <BorderDivComponent condition={true}>
          <EngineTTSDropdown />
        </BorderDivComponent>
        <BorderDivComponent condition={true}>
          <VoiceDropdown />
        </BorderDivComponent>
        <BorderDivComponent condition={externalTextToSpeech}>
          <AutomaticPlaybackSwitch />
        </BorderDivComponent>
        <BorderDivComponent condition={advancedMode && externalTextToSpeech}>
          <PlaybackRate />
        </BorderDivComponent>
        <BorderDivComponent condition={advancedMode && externalTextToSpeech}>
          <CacheTTSSwitch />
        </BorderDivComponent>
      </div>
    </Tabs.Content>
  );
}

export default React.memo(Speech);
