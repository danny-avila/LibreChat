import { memo } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { SettingsTabValues } from 'librechat-data-provider';
import FontSizeSelector from './FontSizeSelector';
import SendMessageKeyEnter from './EnterToSend';
import ShowCodeSwitch from './ShowCodeSwitch';
import { ForkSettings } from './ForkSettings';
import ChatDirection from './ChatDirection';
import LaTeXParsing from './LaTeXParsing';
import ModularChat from './ModularChat';
import SaveDraft from './SaveDraft';

function Chat() {
  return (
    <Tabs.Content value={SettingsTabValues.CHAT} role="tabpanel" className="md: w-full">
      <div className="flex flex-col gap-3 text-sm text-black dark:text-gray-50">
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-600">
          <FontSizeSelector />
        </div>
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-600">
          <ChatDirection />
        </div>
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-600">
          <SendMessageKeyEnter />
        </div>
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-600">
          <ShowCodeSwitch />
        </div>
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-600">
          <SaveDraft />
        </div>
        <ForkSettings />
        <div className="border-b border-border-medium pb-3 last-of-type:border-b-0">
          <ModularChat />
        </div>
        <div className="border-b border-border-medium pb-3 last-of-type:border-b-0">
          <LaTeXParsing />
        </div>
      </div>
    </Tabs.Content>
  );
}

export default memo(Chat);
