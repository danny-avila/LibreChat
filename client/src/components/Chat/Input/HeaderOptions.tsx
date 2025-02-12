import { useRecoilState } from 'recoil';
import { Settings2 } from 'lucide-react';
import { Root, Anchor } from '@radix-ui/react-popover';
import { useState, useEffect, useMemo } from 'react';
import { tConvoUpdateSchema, EModelEndpoint, isParamEndpoint } from 'librechat-data-provider';
import type { TPreset, TInterfaceConfig } from 'librechat-data-provider';
import { EndpointSettings, SaveAsPresetDialog, AlternativeSettings } from '~/components/Endpoints';
import { PluginStoreDialog, TooltipAnchor } from '~/components';
import { ModelSelect } from '~/components/Input/ModelSelect';
import { useSetIndexOptions, useLocalize } from '~/hooks';
import { useGetEndpointsQuery } from '~/data-provider';
import OptionsPopover from './OptionsPopover';
import PopoverButtons from './PopoverButtons';
import { useChatContext } from '~/Providers';
import { getEndpointField } from '~/utils';
import store from '~/store';

export default function HeaderOptions({
  interfaceConfig,
}: {
  interfaceConfig?: Partial<TInterfaceConfig>;
}) {
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const [saveAsDialogShow, setSaveAsDialogShow] = useState<boolean>(false);
  const [showPluginStoreDialog, setShowPluginStoreDialog] = useRecoilState(
    store.showPluginStoreDialog,
  );
  const localize = useLocalize();

  const { showPopover, conversation, setShowPopover } = useChatContext();
  const { setOption } = useSetIndexOptions();
  const { endpoint, conversationId } = conversation ?? {};

  const noSettings = useMemo<{ [key: string]: boolean }>(
    () => ({
      [EModelEndpoint.chatGPTBrowser]: true,
    }),
    [conversationId],
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

  const triggerAdvancedMode = () => setShowPopover((prev) => !prev);

  const endpointType = getEndpointField(endpointsConfig, endpoint, 'type');
  const paramEndpoint = isParamEndpoint(endpoint, endpointType);

  return (
    <Root
      open={showPopover}
      // onOpenChange={} //  called when the open state of the popover changes.
    >
      <Anchor>
        <div className="my-auto lg:max-w-2xl xl:max-w-3xl">
          <span className="flex w-full flex-col items-center justify-center gap-0 md:order-none md:m-auto md:gap-2">
            <div className="z-[61] flex w-full items-center justify-center gap-2">
              {interfaceConfig?.modelSelect === true && (
                <ModelSelect
                  conversation={conversation}
                  setOption={setOption}
                  showAbove={false}
                  popover={true}
                />
              )}
              {!noSettings[endpoint] &&
                interfaceConfig?.parameters === true &&
                paramEndpoint === false && (
                <TooltipAnchor
                  id="parameters-button"
                  aria-label={localize('com_ui_model_parameters')}
                  description={localize('com_ui_model_parameters')}
                  tabIndex={0}
                  role="button"
                  onClick={triggerAdvancedMode}
                  data-testid="parameters-button"
                  className="inline-flex size-10 items-center justify-center rounded-lg border border-border-light bg-transparent text-text-primary transition-all ease-in-out hover:bg-surface-tertiary disabled:pointer-events-none disabled:opacity-50 radix-state-open:bg-surface-tertiary"
                >
                  <Settings2 size={16} aria-label="Settings/Parameters Icon" />
                </TooltipAnchor>
              )}
            </div>
            {interfaceConfig?.parameters === true && paramEndpoint === false && (
              <OptionsPopover
                visible={showPopover}
                saveAsPreset={saveAsPreset}
                presetsDisabled={!(interfaceConfig.presets ?? false)}
                PopoverButtons={<PopoverButtons />}
                closePopover={() => setShowPopover(false)}
              >
                <div className="px-4 py-4">
                  <EndpointSettings
                    className="[&::-webkit-scrollbar]:w-2"
                    conversation={conversation}
                    setOption={setOption}
                  />
                  <AlternativeSettings conversation={conversation} setOption={setOption} />
                </div>
              </OptionsPopover>
            )}
            {interfaceConfig?.presets === true && (
              <SaveAsPresetDialog
                open={saveAsDialogShow}
                onOpenChange={setSaveAsDialogShow}
                preset={
                  tConvoUpdateSchema.parse({
                    ...conversation,
                  }) as TPreset
                }
              />
            )}
            {interfaceConfig?.parameters === true && (
              <PluginStoreDialog
                isOpen={showPluginStoreDialog}
                setIsOpen={setShowPluginStoreDialog}
              />
            )}
          </span>
        </div>
      </Anchor>
    </Root>
  );
}
