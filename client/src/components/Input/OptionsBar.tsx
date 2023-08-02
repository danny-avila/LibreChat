import { useState, useEffect } from 'react';
import { Settings2 } from 'lucide-react';
import { useRecoilValue, useRecoilState } from 'recoil';
import { PluginStoreDialog } from '~/components';
import { SaveAsPresetDialog, EndpointOptionsPopover } from '~/components/Endpoints';
import { Button } from '~/components/ui';
import { cn, cardStyle, removeFocusOutlines } from '~/utils/';
import { useSetOptions } from '~/hooks';
import { ModelSelect } from './ModelSelect';
import Settings from './Settings';
import store from '~/store';

function OptionsBar() {
  const conversation = useRecoilValue(store.conversation);
  const messagesTree = useRecoilValue(store.messagesTree);
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

  const { endpoint, conversationId } = conversation ?? {};
  const noSettings: { [key: string]: boolean } = {
    chatGPTBrowser: true,
    bingAI: conversationId !== 'new',
  };

  const saveAsPreset = () => {
    setSaveAsDialogShow(true);
  };

  if (!endpoint) {
    return null;
  }

  return (
    <div className="relative py-2 last:mb-2 md:mx-4 md:mb-[-16px] md:py-4 md:pt-2 md:last:mb-6 lg:mx-auto lg:mb-[-32px] lg:max-w-2xl lg:pt-6 xl:max-w-3xl">
      <div className="absolute right-0 z-[62]">
        <div className="grow"></div>
        <div className="flex items-center md:items-end">
          {/* <div className={cn('option-buttons', advancedMode ? '' : opacityClass)} data-projection-id="173">
            <button className={cn('custom-btn relative btn-neutral whitespace-nowrap -z-0 border-0 md:border', removeFocusOutlines)}>
              <div className="flex w-full gap-2 items-center justify-center">
                <svg stroke="currentColor" fill="none" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 flex-shrink-0" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
                  <polyline points="1 4 1 10 7 10"></polyline>
                  <polyline points="23 20 23 14 17 14"></polyline>
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
                </svg>
             Regenerate
              </div>
            </button>
          </div> */}
        </div>
      </div>
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
              onClick={() => setAdvancedMode((prev) => !prev)}
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

export default OptionsBar;
