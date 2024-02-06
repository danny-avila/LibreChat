import { Settings2 } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { useRecoilValue, useRecoilState, useSetRecoilState } from 'recoil';
import { tPresetSchema, EModelEndpoint } from 'librechat-data-provider';
import { PluginStoreDialog } from '~/components';
import {
  PopoverButtons,
  EndpointSettings,
  SaveAsPresetDialog,
  EndpointOptionsPopover,
} from '~/components/Endpoints';
import { Button } from '~/components/ui';
import { cn, cardStyle } from '~/utils/';
import { useSetOptions } from '~/hooks';
import { ModelSelect } from './ModelSelect';
import { GenerationButtons } from './Generations';
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
  const [showPopover, setShowPopover] = useRecoilState(store.showPopover);
  const [opacityClass, setOpacityClass] = useState('full-opacity');
  const { setOption } = useSetOptions();

  const { endpoint, conversationId, jailbreak } = conversation ?? {};

  const altConditions: { [key: string]: boolean } = {
    bingAI: !!(latestMessage && conversation?.jailbreak && endpoint === 'bingAI'),
  };

  const altSettings: { [key: string]: () => void } = {
    bingAI: () => setShowBingToneSetting((prev) => !prev),
  };

  const noSettings = useMemo<{ [key: string]: boolean }>(
    () => ({
      [EModelEndpoint.chatGPTBrowser]: true,
      [EModelEndpoint.bingAI]: jailbreak ? false : conversationId !== 'new',
    }),
    [jailbreak, conversationId],
  );

  useEffect(() => {
    if (showPopover) {
      return;
    } else if (messagesTree && messagesTree.length >= 1) {
      setOpacityClass('show');
    } else {
      setOpacityClass('full-opacity');
    }
  }, [messagesTree, showPopover]);

  useEffect(() => {
    if (endpoint && noSettings[endpoint]) {
      setShowPopover(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, noSettings]);

  const saveAsPreset = () => {
    setSaveAsDialogShow(true);
  };

  if (!endpoint) {
    return null;
  }

  const triggerAdvancedMode = altConditions[endpoint]
    ? altSettings[endpoint]
    : () => setShowPopover((prev) => !prev);
  return (
    <div className="relative py-2 last:mb-2 md:mx-4 md:mb-[-16px] md:py-4 md:pt-2 md:last:mb-6 lg:mx-auto lg:mb-[-32px] lg:max-w-2xl lg:pt-6 xl:max-w-3xl">
      <GenerationButtons
        endpoint={endpoint}
        showPopover={showPopover}
        opacityClass={opacityClass}
      />
      <span className="flex w-full flex-col items-center justify-center gap-0 md:order-none md:m-auto md:gap-2">
        <div
          className={cn(
            'options-bar z-[61] flex w-full flex-wrap items-center justify-center gap-2',
            showPopover ? '' : opacityClass,
          )}
          onMouseEnter={() => {
            if (showPopover) {
              return;
            }
            setOpacityClass('full-opacity');
          }}
          onMouseLeave={() => {
            if (showPopover) {
              return;
            }
            if (!messagesTree || messagesTree.length === 0) {
              return;
            }
            setOpacityClass('show');
          }}
          onFocus={() => {
            if (showPopover) {
              return;
            }
            setOpacityClass('full-opacity');
          }}
          onBlur={() => {
            if (showPopover) {
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
                'min-w-4 z-50 flex h-[40px] flex-none items-center justify-center px-3 focus:ring-0 focus:ring-offset-0',
              )}
              onClick={triggerAdvancedMode}
            >
              <Settings2 className="w-4 text-gray-600 dark:text-white" />
            </Button>
          )}
        </div>
        <EndpointOptionsPopover
          visible={showPopover}
          saveAsPreset={saveAsPreset}
          closePopover={() => setShowPopover(false)}
          PopoverButtons={<PopoverButtons endpoint={endpoint} />}
        >
          <div className="px-4 py-4">
            <EndpointSettings conversation={conversation} setOption={setOption} />
          </div>
        </EndpointOptionsPopover>
        <SaveAsPresetDialog
          open={saveAsDialogShow}
          onOpenChange={setSaveAsDialogShow}
          preset={tPresetSchema.parse({ ...conversation })}
        />
        <PluginStoreDialog isOpen={showPluginStoreDialog} setIsOpen={setShowPluginStoreDialog} />
      </span>
    </div>
  );
}
