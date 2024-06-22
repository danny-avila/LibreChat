import * as Tabs from '@radix-ui/react-tabs';
import { SettingsTabValues } from 'librechat-data-provider';
import React, { useState, useRef } from 'react';
import { useRecoilState } from 'recoil';
import { Lightbulb, Cog } from 'lucide-react';
import { useOnClickOutside, useMediaQuery } from '~/hooks';
import store from '~/store';
import { cn } from '~/utils';
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
  const isSmallScreen = useMediaQuery('(max-width: 767px)');
  const [advancedMode, setAdvancedMode] = useRecoilState<boolean>(store.advancedMode);
  const [autoTranscribeAudio] = useRecoilState<boolean>(store.autoTranscribeAudio);
  const [confirmClear, setConfirmClear] = useState(false);

  const contentRef = useRef(null);
  useOnClickOutside(contentRef, () => confirmClear && setConfirmClear(false), []);

  return (
    <Tabs.Content
      value={SettingsTabValues.SPEECH}
      role="tabpanel"
      className="w-full px-4 md:min-h-[300px]"
      ref={contentRef}
    >
      <Tabs.Root
        defaultValue={'simple'}
        orientation="horizontal"
        value={advancedMode ? 'advanced' : 'simple'}
      >
        <div className="sticky top-0 z-50 bg-white dark:bg-gray-700">
          <Tabs.List className="sticky top-0 mb-4 flex justify-center bg-white dark:bg-gray-700">
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
          </div>
        </Tabs.Content>

        <Tabs.Content value={'advanced'}>
          <div className="flex flex-col gap-3 text-sm text-black dark:text-gray-50">
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
              <AutomaticPlayback />
            </div>
            <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
              <EngineTTSDropdown />
            </div>
            <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
              <VoiceDropdown />
            </div>
            <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
              <PlaybackRate />
            </div>
            <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
              <CacheTTSSwitch />
            </div>
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </Tabs.Content>
  );
}

export default React.memo(Speech);
