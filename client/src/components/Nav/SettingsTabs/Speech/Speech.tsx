import * as Tabs from '@radix-ui/react-tabs';
import { SettingsTabValues } from 'librechat-data-provider';
import React, { useState, useRef } from 'react';
import { useRecoilState } from 'recoil';
import { useOnClickOutside } from '~/hooks';
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
  SpeechToTextSwitch,
  AutoSendTextSwitch,
  AutoTranscribeAudioSwitch,
} from './STT';

function Speech() {
  const [confirmClear, setConfirmClear] = useState(false);
  const [advancedMode] = useRecoilState<boolean>(store.advancedMode);
  const [autoTranscribeAudio] = useRecoilState<boolean>(store.autoTranscribeAudio);

  const contentRef = useRef(null);
  useOnClickOutside(contentRef, () => confirmClear && setConfirmClear(false), []);

  return (
    <Tabs.Content
      value={SettingsTabValues.SPEECH}
      role="tabpanel"
      className="w-full px-4 md:min-h-[300px]"
      ref={contentRef}
    >
      <div className="flex flex-col gap-3 text-sm text-gray-600 dark:text-gray-50">
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          <ConversationModeSwitch />
        </div>
        <div className="h-px bg-black/20 bg-white/20" role="none" />
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          <SpeechToTextSwitch />
        </div>
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          <EngineSTTDropdown />
        </div>
        {advancedMode && (
          <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
            <AutoTranscribeAudioSwitch />
          </div>
        )}
        {autoTranscribeAudio && advancedMode && (
          <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
            <DecibelSelector />
          </div>
        )}
        {advancedMode && (
          <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
            <AutoSendTextSwitch />
          </div>
        )}
        <div className="h-px bg-black/20 bg-white/20" role="none" />
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          <TextToSpeechSwitch />
        </div>
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          <AutomaticPlayback />
        </div>
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          <EngineTTSDropdown />
        </div>
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          <VoiceDropdown />
        </div>
        {advancedMode && (
          <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
            <PlaybackRate />
          </div>
        )}
        {advancedMode && (
          <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
            <CacheTTSSwitch />
          </div>
        )}
      </div>
    </Tabs.Content>
  );
}

export default React.memo(Speech);
