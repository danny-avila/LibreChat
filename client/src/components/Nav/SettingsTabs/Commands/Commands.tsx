import { memo } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { SettingsTabValues } from 'librechat-data-provider';
import SlashCommandSwitch from './SlashCommandSwitch';
import PlusCommandSwitch from './PlusCommandSwitch';
import AtCommandSwitch from './AtCommandSwitch';

function Commands() {
  return (
    <Tabs.Content
      value={SettingsTabValues.COMMANDS}
      role="tabpanel"
      className="w-full md:min-h-[271px]"
    >
      <div className="flex flex-col gap-3 text-sm text-text-primary">
        <div className="border-b border-border-medium pb-3 last-of-type:border-b-0">
          <AtCommandSwitch />
        </div>
        <div className="border-b border-border-medium pb-3 last-of-type:border-b-0">
          <PlusCommandSwitch />
        </div>
        <div className="border-b border-border-medium pb-3 last-of-type:border-b-0">
          <SlashCommandSwitch />
        </div>
      </div>
    </Tabs.Content>
  );
}

export default memo(Commands);
