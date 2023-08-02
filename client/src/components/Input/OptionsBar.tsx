import { useState, useEffect } from 'react';
import { Settings2 } from 'lucide-react';
import { useRecoilValue, useRecoilState, useSetRecoilState } from 'recoil';
import { PluginStoreDialog } from '~/components';
import { SaveAsPresetDialog, EndpointOptionsPopover } from '~/components/Endpoints';
import { Button } from '~/components/ui';
import { cn, cardStyle } from '~/utils/';
import { useSetOptions } from '~/hooks';
import { ModelSelect } from './ModelSelect';
import GenerationButtons from './GenerationButtons';
import Settings from './Settings';
import store from '~/store';

export default function OptionsBar() {
  const conversation = useRecoilValue(store.conversation);
  const messagesTree = useRecoilValue(store.messagesTree);
  const latestMessage = useRecoilValue(store.latestMessage);
  const setShowBingToneSetting = useSetRecoilState(store.showBingToneSetting);
  const [showPluginStoreDialog, setShowPluginStoreDialog] = useRecoilState(
    store.showPluginStoreDialog,
  );
  const [saveAsDialogShow, setSaveAsDialogShow] = useState<boolean>(false);
  const [advancedMode, setAdvancedMode] = useState<boolean>(false);
  const [opacityClass, setOpacityClass] = useState('full-opacity');
  const { setOption } = useSetOptions();

  useEffect(() => {
    if (advancedMode) {
      return;
    } else if (messagesTree?.length >= 1) {
      setOpacityClass('show');
    } else {
      setOpacityClass('full-opacity');
    }
  }, [messagesTree, advancedMode]);

  const { endpoint, conversationId, jailbreak } = conversation ?? {};

  const altConditions: { [key: string]: boolean } = {
    bingAI: !!(latestMessage && conversation?.jailbreak && endpoint === 'bingAI'),
  };
  const altSettings: { [key: string]: () => void } = {
    bingAI: () => setShowBingToneSetting((prev) => !prev),
  };
  const noSettings: { [key: string]: boolean } = {
    chatGPTBrowser: true,
    bingAI: jailbreak ? false : conversationId !== 'new',
  };

  const saveAsPreset = () => {
    setSaveAsDialogShow(true);
  };

  if (!endpoint) {
    return null;
  }

  const triggerAdvancedMode = altConditions[endpoint]
    ? altSettings[endpoint]
    : () => setAdvancedMode((prev) => !prev);
  return (
    <div className="relative py-2 last:mb-2 md:mx-4 md:mb-[-16px] md:py-4 md:pt-2 md:last:mb-6 lg:mx-auto lg:mb-[-32px] lg:max-w-2xl lg:pt-6 xl:max-w-3xl">
      <GenerationButtons advancedMode={advancedMode} opacityClass={opacityClass} />
      <span className="flex w-full flex-col items-center justify-center gap-0 md:order-none md:m-auto md:gap-2">
        <div
          className={cn(
            'options-bar z-[61] flex w-full flex-wrap items-center justify-center gap-2',
            advancedMode ? '' : opacityClass,
          )}
          onMouseEnter={() => {
            if (advancedMode) {
              return;
            }
            setOpacityClass('full-opacity');
          }}
          onMouseLeave={() => {
            if (advancedMode) {
              return;
            }
            if (!messagesTree || messagesTree.length === 0) {
              return;
            }
            setOpacityClass('show');
          }}
        >
          <ModelSelect conversation={conversation} setOption={setOption} />
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
          switchToSimpleMode={() => setAdvancedMode(false)}
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
        <PluginStoreDialog isOpen={showPluginStoreDialog} setIsOpen={setShowPluginStoreDialog} />
      </span>
    </div>
  );
}
