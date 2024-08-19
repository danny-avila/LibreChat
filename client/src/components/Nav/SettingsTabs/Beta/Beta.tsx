import { memo } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { SettingsTabValues } from 'librechat-data-provider';
import CodeArtifacts from './CodeArtifacts';
import LaTeXParsing from './LaTeXParsing';
import ModularChat from './ModularChat';

function Beta() {
  return (
    <Tabs.Content
      value={SettingsTabValues.BETA}
      role="tabpanel"
      className="w-full md:min-h-[271px]"
    >
      <div className="flex flex-col gap-3 text-sm text-text-primary">
        <div className="border-b border-border-medium pb-3 last-of-type:border-b-0">
          <ModularChat />
        </div>
        <div className="border-b border-border-medium pb-3 last-of-type:border-b-0">
          <LaTeXParsing />
        </div>
        <div className="border-b border-border-medium pb-3 last-of-type:border-b-0">
          <CodeArtifacts />
        </div>
      </div>
    </Tabs.Content>
  );
}

export default memo(Beta);
