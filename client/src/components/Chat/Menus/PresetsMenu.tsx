import type { FC } from 'react';
import { useState } from 'react';
import { useRecoilState } from 'recoil';
import {
  modularEndpoints,
  useDeletePresetMutation,
  useCreatePresetMutation,
} from 'librechat-data-provider';
import type { TPreset } from 'librechat-data-provider';
import { Content, Portal, Root } from '@radix-ui/react-popover';
import { useLocalize, useDefaultConvo, useNavigateToConvo } from '~/hooks';
import { EditPresetDialog, PresetItems } from './Presets';
import { useChatContext } from '~/Providers';
import TitleButton from './UI/TitleButton';
import { cleanupPreset } from '~/utils';
import store from '~/store';

const PresetsMenu: FC = () => {
  const localize = useLocalize();
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
      <TitleButton primaryText={'Presets'} />
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
            align="start"
            className="mt-2 max-h-[495px] max-w-[370px] overflow-x-hidden rounded-lg border border-gray-100 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900 dark:text-white md:min-w-[400px]"
          >
            {presets.length ? (
              <PresetItems
                presets={presets}
                onSelectPreset={onSelectPreset}
                onChangePreset={onChangePreset}
                onDeletePreset={onDeletePreset}
                clearAllPresets={clearAllPresets}
                onFileSelected={onFileSelected}
              />
            ) : (
              <div className="dark:text-gray-300">{localize('com_endpoint_no_presets')}</div>
            )}
          </Content>
        </div>
      </Portal>
      <EditPresetDialog
        open={presetModalVisible}
        onOpenChange={setPresetModalVisible}
        // preset={preset as TPreset}
      />
    </Root>
  );
};

export default PresetsMenu;
