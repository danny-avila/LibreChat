import * as Tabs from '@radix-ui/react-tabs';
import { SettingsTabValues } from 'librechat-data-provider';
import React, { useState, useRef } from 'react';
import { useOnClickOutside } from '~/hooks';
import TextToSpeechSwitch from './TextToSpeechSwitch';
import SpeechToTextSwitch from './SpeechToTextSwitch';

function Speech() {
  const [confirmClear, setConfirmClear] = useState(false);

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
          <TextToSpeechSwitch />
        </div>
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          <SpeechToTextSwitch />
        </div>
      </div>
    </Tabs.Content>
  );
}

export default React.memo(Speech);
