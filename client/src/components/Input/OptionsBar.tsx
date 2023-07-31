import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { SaveAsPresetDialog, EndpointOptionsPopover } from '~/components/Endpoints';
import { Button } from '~/components/ui';
import { cn, cardStyle } from '~/utils/';
import { OptionsBarProps } from 'librechat-data-provider';
import { useSetOptions } from '~/hooks';
import { ModelSelect } from './ModelSelect';
import Settings from './Settings';
import store from '~/store';

function OptionsBar({ showBingTones }: OptionsBarProps) {
  const [advancedMode, setAdvancedMode] = useState<boolean>(false);
  const [saveAsDialogShow, setSaveAsDialogShow] = useState<boolean>(false);
  const conversation = useRecoilValue(store.conversation);
  const { setOption } = useSetOptions();

  const { endpoint, conversationId } = conversation ?? {};
  const noSettings: { [key: string]: boolean } = {
    chatGPTBrowser: true,
    bingAI: conversationId !== 'new',
  };

  const triggerAdvancedMode = () => setAdvancedMode((prev) => !prev);

  const switchToSimpleMode = () => {
    setAdvancedMode(false);
  };

  const saveAsPreset = () => {
    setSaveAsDialogShow(true);
  };

  if (!endpoint) {
    return null;
  }

  return (
    <>
      <div
        className={
          'openAIOptions-simple-container flex w-full flex-wrap items-center justify-center gap-2' +
          (!advancedMode ? ' show' : '')
        }
      >
        <ModelSelect
          conversation={conversation}
          setOption={setOption}
          showBingTones={showBingTones}
        />
        {!noSettings[endpoint] && (
          <Button
            type="button"
            className={cn(
              cardStyle,
              'min-w-4 z-50 flex h-[40px] flex-none items-center justify-center px-4 hover:bg-slate-50 focus:ring-0 focus:ring-offset-0 dark:hover:bg-gray-600',
            )}
            onClick={triggerAdvancedMode}
          >
            <Settings2 className="w-4 text-gray-600 dark:text-white" />
          </Button>
        )}
      </div>
      <EndpointOptionsPopover
        endpoint={endpoint}
        visible={advancedMode}
        saveAsPreset={saveAsPreset}
        switchToSimpleMode={switchToSimpleMode}
      >
        <div className="px-4 py-4">
          <Settings conversation={conversation} setOption={setOption} />
        </div>
      </EndpointOptionsPopover>
      <SaveAsPresetDialog
        open={saveAsDialogShow}
        onOpenChange={setSaveAsDialogShow}
        preset={conversation}
      />
    </>
  );
}

export default OptionsBar;
