import type { FC } from 'react';
import { useState } from 'react';
import { useRecoilState } from 'recoil';
import { BookCopy } from 'lucide-react';
import {
  modularEndpoints,
  useDeletePresetMutation,
  useCreatePresetMutation,
} from 'librechat-data-provider';
import type { TPreset } from 'librechat-data-provider';
import { Content, Portal, Root, Trigger } from '@radix-ui/react-popover';
import { useLocalize, useDefaultConvo, useNavigateToConvo } from '~/hooks';
import { useChatContext, useToastContext } from '~/Providers';
import { EditPresetDialog, PresetItems } from './Presets';
import { cleanupPreset, cn } from '~/utils';
import store from '~/store';

const PresetsMenu: FC = () => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { conversation, newConversation, setPreset } = useChatContext();
  const { navigateToConvo } = useNavigateToConvo();
  const getDefaultConversation = useDefaultConvo();

  const [presetModalVisible, setPresetModalVisible] = useState(false);
  // TODO: rely on react query for presets data
  const [presets, setPresets] = useRecoilState(store.presets);

  const deletePresetsMutation = useDeletePresetMutation();
  const createPresetMutation = useCreatePresetMutation();

  const { endpoint } = conversation ?? {};

  const importPreset = (jsonPreset: TPreset) => {
    createPresetMutation.mutate(
      { ...jsonPreset },
      {
        onSuccess: (data) => {
          setPresets(data);
        },
        onError: (error) => {
          console.error('Error uploading the preset:', error);
        },
      },
    );
  };
  const onFileSelected = (jsonData: Record<string, unknown>) => {
    const jsonPreset = { ...cleanupPreset({ preset: jsonData }), presetId: null };
    importPreset(jsonPreset);
  };
  const onSelectPreset = (newPreset: TPreset) => {
    if (!newPreset) {
      return;
    }

    showToast({
      message: localize('com_endpoint_preset_selected'),
      showIcon: false,
      duration: 750,
    });

    if (
      modularEndpoints.has(endpoint ?? '') &&
      modularEndpoints.has(newPreset?.endpoint ?? '') &&
      endpoint === newPreset?.endpoint
    ) {
      const currentConvo = getDefaultConversation({
        conversation: conversation ?? {},
        preset: newPreset,
      });

      /* We don't reset the latest message, only when changing settings mid-converstion */
      navigateToConvo(currentConvo, false);
      return;
    }

    console.log('preset', newPreset, endpoint);
    newConversation({ preset: newPreset });
  };

  const onChangePreset = (preset: TPreset) => {
    setPreset(preset);
    setPresetModalVisible(true);
  };

  const clearAllPresets = () => {
    deletePresetsMutation.mutate({ arg: {} });
  };

  const onDeletePreset = (preset: TPreset) => {
    deletePresetsMutation.mutate({ arg: preset });
  };

  return (
    <Root>
      <Trigger asChild>
        <button
          className={cn(
            'pointer-cursor relative flex flex-col rounded-md border border-black/10 bg-white text-left focus:outline-none focus:ring-0 focus:ring-offset-0 dark:border-white/20 dark:bg-gray-800 sm:text-sm',
            'hover:bg-gray-50 radix-state-open:bg-gray-50 dark:hover:bg-black/10 dark:radix-state-open:bg-black/20',
            'min-w-4 z-50 flex h-[40px] flex-none items-center justify-center px-3 focus:ring-0 focus:ring-offset-0',
          )}
          id="presets-button"
          data-testid="presets-button"
          title={localize('com_endpoint_examples')}
        >
          <BookCopy className="icon-sm" id="presets-button" />
        </button>
      </Trigger>
      <Portal>
        <div
          style={{
            position: 'fixed',
            left: '0px',
            top: '0px',
            transform: 'translate3d(268px, 50px, 0px)',
            minWidth: 'max-content',
            zIndex: 'auto',
          }}
        >
          <Content
            side="bottom"
            align="center"
            className="mt-2 max-h-[495px] overflow-x-hidden rounded-lg border border-gray-100 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900 dark:text-white md:min-w-[400px]"
          >
            <PresetItems
              presets={presets}
              onSelectPreset={onSelectPreset}
              onChangePreset={onChangePreset}
              onDeletePreset={onDeletePreset}
              clearAllPresets={clearAllPresets}
              onFileSelected={onFileSelected}
            />
          </Content>
        </div>
      </Portal>
      <EditPresetDialog open={presetModalVisible} onOpenChange={setPresetModalVisible} />
    </Root>
  );
};

export default PresetsMenu;
