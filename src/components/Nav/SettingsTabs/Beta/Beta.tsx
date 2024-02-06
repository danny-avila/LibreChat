import { memo } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { SettingsTabValues } from 'librechat-data-provider';
import LaTeXParsing from './LaTeXParsing';
import ModularChat from './ModularChat';

function Beta() {
  return (
    <Tabs.Content
      value={SettingsTabValues.BETA}
      role="tabpanel"
      className="w-full md:min-h-[300px]"
    >
      <div className="flex flex-col gap-3 text-sm text-gray-600 dark:text-gray-300">
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          <ModularChat />
        </div>
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          <LaTeXParsing />
        </div>
      </div>
    </Tabs.Content>
  );
}

export default memo(Beta);
