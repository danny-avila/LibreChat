import type { FC } from 'react';
import { BookCopy } from 'lucide-react';
import { Content, Portal, Root, Trigger } from '@radix-ui/react-popover';
import { EditPresetDialog, PresetItems } from './Presets';
import { useLocalize, usePresets } from '~/hooks';
import { useChatContext } from '~/Providers';
import { Button } from '~/components/ui';

const PresetsMenu: FC = () => {
  const localize = useLocalize();
  const {
    presetsQuery,
    onSetDefaultPreset,
    onFileSelected,
    onSelectPreset,
    onChangePreset,
    clearAllPresets,
    onDeletePreset,
    submitPreset,
    exportPreset,
  } = usePresets();
  const { preset } = useChatContext();

  const presets = presetsQuery.data || [];
  return (
    <Root>
      <Trigger asChild>
        <Button
          type="button"
          variant="outline"
          className="flex h-[40px] min-w-4 px-3 radix-state-open:bg-surface-hover"
          id="presets-button"
          data-testid="presets-button"
          title={localize('com_endpoint_examples')}
          aria-label={localize('com_endpoint_examples')}
        >
          <BookCopy className="icon-sm" id="presets-button" />
        </Button>
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
            className="mt-2 max-h-[495px] overflow-x-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-700 dark:text-white md:min-w-[400px]"
          >
            <PresetItems
              presets={presets}
              onSetDefaultPreset={onSetDefaultPreset}
              onSelectPreset={onSelectPreset}
              onChangePreset={onChangePreset}
              onDeletePreset={onDeletePreset}
              clearAllPresets={clearAllPresets}
              onFileSelected={onFileSelected}
            />
          </Content>
        </div>
      </Portal>
      {preset && <EditPresetDialog submitPreset={submitPreset} exportPreset={exportPreset} />}
    </Root>
  );
};

export default PresetsMenu;
