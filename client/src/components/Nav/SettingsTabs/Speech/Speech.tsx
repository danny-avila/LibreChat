import * as Tabs from '@radix-ui/react-tabs';
import { SettingsTabValues } from 'librechat-data-provider';
import React, { useState, useRef } from 'react';
import { useRecoilState } from 'recoil';
import { useOnClickOutside } from '~/hooks';
import store from '~/store';
import TextToSpeechSwitch from './TextToSpeechSwitch';
import SpeechToTextSwitch from './SpeechToTextSwitch';
import ConversationModeSwitch from './ConversationModeSwitch';
import AutoSendTextSwitch from './AutoSendTextSwitch';
import AutoTranscribeAudioSwitch from './AutoTranscribeAudioSwitch';
import DecibelSelector from './DecibelSelector';
import EngineSTTDropdown from './EngineSTTDropdown';
import EngineTTSDropdown from './EngineTTSDropdown';

function Speech() {
  const [confirmClear, setConfirmClear] = useState(false);
  const [autoTranscribeAudio] = useRecoilState<boolean>(store.autoTranscribeAudio);

  const contentRef = useRef(null);
  useOnClickOutside(contentRef, () => confirmClear && setConfirmClear(false), []);

  return (
    <Tabs.Content
      value={SettingsTabValues.SPEECH}
      role="tabpanel"
      className="w-full md:min-h-[300px]"
      ref={contentRef}
    >
      <div className="flex flex-col gap-3 text-sm text-gray-600 dark:text-gray-50">
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          <SpeechToTextSwitch />
        </div>
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          <EngineSTTDropdown />
        </div>
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          <AutoTranscribeAudioSwitch />
        </div>
        {autoTranscribeAudio && (
          <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
            <DecibelSelector />
          </div>
        )}
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          <AutoSendTextSwitch />
        </div>
        <div className="h-px bg-black/20 bg-white/20" role="none" />
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          <TextToSpeechSwitch />
        </div>
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          <EngineTTSDropdown />
        </div>
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          <ConversationModeSwitch />
        </div>
      </div>
    </Tabs.Content>
  );
}

export default React.memo(Speech);
