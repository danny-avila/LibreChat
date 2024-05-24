import * as Tabs from '@radix-ui/react-tabs';
import { SettingsTabValues } from 'librechat-data-provider';
import React, { useState, useRef } from 'react';
import { useRecoilState } from 'recoil';
import { useOnClickOutside, useGetAudioSettings } from '~/hooks';
import store from '~/store';
import ConversationModeSwitch from './ConversationModeSwitch';
import {
  TextToSpeechSwitch,
  EngineTTSDropdown,
  AutomaticPlayback,
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

const BorderDiv = ({ children }) => (
  <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">{children}</div>
);

const Divider = () => <div className="h-px bg-black/20 bg-white/20" role="none" />;

function Speech() {
  const [confirmClear, setConfirmClear] = useState(false);
  const [advancedMode] = useRecoilState(store.advancedMode);
  const [autoTranscribeAudio] = useRecoilState(store.autoTranscribeAudio);

  const { useExternalSpeechToText, useExternalTextToSpeech } = useGetAudioSettings();

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
        <BorderDivComponent condition={!useExternalSpeechToText}>
          <LanguageSTTDropdown />
        </BorderDivComponent>
        <BorderDivComponent condition={advancedMode}>
          <AutoTranscribeAudioSwitch />
        </BorderDivComponent>
        <BorderDivComponent
          condition={autoTranscribeAudio && useExternalSpeechToText && advancedMode}
        >
          <DecibelSelector />
        </BorderDivComponent>
        <BorderDivComponent condition={advancedMode && useExternalSpeechToText}>
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
        <BorderDivComponent condition={useExternalTextToSpeech}>
          <AutomaticPlayback />
        </BorderDivComponent>
        <BorderDivComponent condition={advancedMode && useExternalTextToSpeech}>
          <PlaybackRate />
        </BorderDivComponent>
        <BorderDivComponent condition={advancedMode && useExternalTextToSpeech}>
          <CacheTTSSwitch />
        </BorderDivComponent>
      </div>
    </Tabs.Content>
  );
}

export default React.memo(Speech);
