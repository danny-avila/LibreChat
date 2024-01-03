import { useRecoilState } from 'recoil';
import { Settings2 } from 'lucide-react';
import { Root, Anchor } from '@radix-ui/react-popover';
import { useState, useEffect, useMemo } from 'react';
import { tPresetUpdateSchema, EModelEndpoint } from 'librechat-data-provider';
import type { TPreset } from 'librechat-data-provider';
import { EndpointSettings, SaveAsPresetDialog } from '~/components/Endpoints';
import { ModelSelect } from '~/components/Input/ModelSelect';
import { PluginStoreDialog } from '~/components';
import OptionsPopover from './OptionsPopover';
import PopoverButtons from './PopoverButtons';
import { useSetIndexOptions } from '~/hooks';
import { useChatContext } from '~/Providers';
import { Button } from '~/components/ui';
import { cn, cardStyle } from '~/utils/';
import store from '~/store';

export default function OptionsBar() {
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
    <Root
      open={showPopover}
      // onOpenChange={} //  called when the open state of the popover changes.
    >
      <Anchor>
        <div className="my-auto lg:max-w-2xl xl:max-w-3xl">
          <span className="flex w-full flex-col items-center justify-center gap-0 md:order-none md:m-auto md:gap-2">
            <div className="z-[61] flex w-full items-center justify-center gap-2">
              <ModelSelect
                conversation={conversation}
                setOption={setOption}
                isMultiChat={true}
                showAbove={false}
              />
              {!noSettings[endpoint] && (
                <Button
                  type="button"
                  className={cn(
                    cardStyle,
                    'min-w-4 z-50 flex h-[40px] flex-none items-center justify-center px-3 focus:ring-0 focus:ring-offset-0',
                    'hover:bg-gray-50 radix-state-open:bg-gray-50 dark:hover:bg-black/10 dark:radix-state-open:bg-black/20',
                  )}
                  onClick={triggerAdvancedMode}
                >
                  <Settings2 className="w-4 text-gray-600 dark:text-white" />
                </Button>
              )}
            </div>
            <OptionsPopover
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
            </OptionsPopover>
            <SaveAsPresetDialog
              open={saveAsDialogShow}
              onOpenChange={setSaveAsDialogShow}
              preset={
                tPresetUpdateSchema.parse({
                  ...conversation,
                }) as TPreset
              }
            />
            <PluginStoreDialog
              isOpen={showPluginStoreDialog}
              setIsOpen={setShowPluginStoreDialog}
            />
          </span>
        </div>
      </Anchor>
    </Root>
  );
}
