import { useRecoilState } from 'recoil';
import { Settings2 } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { tPresetUpdateSchema, EModelEndpoint } from 'librechat-data-provider';
import type { TPreset } from 'librechat-data-provider';
import { PluginStoreDialog } from '~/components';
import {
  EndpointSettings,
  SaveAsPresetDialog,
  EndpointOptionsPopover,
} from '~/components/Endpoints';
import { ModelSelect } from '~/components/Input/ModelSelect';
import GenerationButtons from './GenerationButtons';
import PopoverButtons from './PopoverButtons';
import { useSetIndexOptions } from '~/hooks';
import { useChatContext } from '~/Providers';
import { Button } from '~/components/ui';
import { cn, cardStyle } from '~/utils/';
import store from '~/store';

export default function OptionsBar({ messagesTree }) {
  const [opacityClass, setOpacityClass] = useState('full-opacity');
  const [saveAsDialogShow, setSaveAsDialogShow] = useState<boolean>(false);
  const [showPluginStoreDialog, setShowPluginStoreDialog] = useRecoilState(
    store.showPluginStoreDialog,
  );

  const { showPopover, conversation, latestMessage, setShowPopover, setShowBingToneSetting } =
    useChatContext();
  const { setOption } = useSetIndexOptions();

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
    <div className="absolute left-0 right-0 mx-auto mb-2 last:mb-2 md:mx-4 md:last:mb-6 lg:mx-auto lg:max-w-2xl xl:max-w-3xl">
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
          <ModelSelect conversation={conversation} setOption={setOption} isMultiChat={true} />
          {!noSettings[endpoint] && (
            <Button
              id="advanced-mode-button"
              customId="advanced-mode-button"
              type="button"
              className={cn(
                cardStyle,
                'min-w-4 z-50 flex h-[40px] flex-none items-center justify-center px-3 focus:ring-0 focus:ring-offset-0',
              )}
              onClick={triggerAdvancedMode}
            >
              <Settings2 id="advanced-settings" className="w-4 text-gray-600 dark:text-white" />
            </Button>
          )}
        </div>
        <EndpointOptionsPopover
          visible={showPopover}
          saveAsPreset={saveAsPreset}
          closePopover={() => setShowPopover(false)}
          PopoverButtons={<PopoverButtons />}
        >
          <div className="px-4 py-4">
            <EndpointSettings
              conversation={conversation}
              setOption={setOption}
              isMultiChat={true}
            />
          </div>
        </EndpointOptionsPopover>
        <SaveAsPresetDialog
          open={saveAsDialogShow}
          onOpenChange={setSaveAsDialogShow}
          preset={
            tPresetUpdateSchema.parse({
              ...conversation,
            }) as TPreset
          }
        />
        <PluginStoreDialog isOpen={showPluginStoreDialog} setIsOpen={setShowPluginStoreDialog} />
      </span>
    </div>
  );
}
