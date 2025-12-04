import { useRef } from 'react';
import { Trans } from 'react-i18next';
import { BookCopy } from 'lucide-react';
import { Content, Portal, Root, Trigger } from '@radix-ui/react-popover';
import {
  Button,
  OGDialog,
  TooltipAnchor,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogContent,
} from '@librechat/client';
import type { FC } from 'react';
import { EditPresetDialog, PresetItems } from './Presets';
import { useLocalize, usePresets } from '~/hooks';
import { useChatContext } from '~/Providers';

const PresetsMenu: FC = () => {
  const localize = useLocalize();
  const presetsMenuTriggerRef = useRef<HTMLDivElement>(null);
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
    showDeleteDialog,
    setShowDeleteDialog,
    presetToDelete,
    confirmDeletePreset,
  } = usePresets();
  const { preset } = useChatContext();

  const handleDeleteDialogChange = (open: boolean) => {
    setShowDeleteDialog(open);
    if (!open && presetsMenuTriggerRef.current) {
      setTimeout(() => {
        presetsMenuTriggerRef.current?.focus();
      }, 0);
    }
  };

  return (
    <Root>
      <Trigger asChild>
        <TooltipAnchor
          ref={presetsMenuTriggerRef}
          id="presets-button"
          aria-label={localize('com_endpoint_examples')}
          description={localize('com_endpoint_examples')}
          tabIndex={0}
          role="button"
          data-testid="presets-button"
          className="inline-flex size-10 flex-shrink-0 items-center justify-center rounded-xl border border-border-light bg-transparent text-text-primary transition-all ease-in-out hover:bg-surface-tertiary disabled:pointer-events-none disabled:opacity-50 radix-state-open:bg-surface-tertiary"
        >
          <BookCopy size={16} aria-hidden="true" />
        </TooltipAnchor>
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
              presets={presetsQuery.data}
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
      {preset && (
        <EditPresetDialog
          submitPreset={submitPreset}
          exportPreset={exportPreset}
          triggerRef={presetsMenuTriggerRef}
        />
      )}
      {presetToDelete && (
        <OGDialog open={showDeleteDialog} onOpenChange={handleDeleteDialogChange}>
          <OGDialogContent
            title={localize('com_endpoint_preset_delete_confirm')}
            className="w-11/12 max-w-md"
            showCloseButton={false}
          >
            <OGDialogHeader>
              <OGDialogTitle>{localize('com_ui_delete_preset')}</OGDialogTitle>
            </OGDialogHeader>
            <div className="w-full truncate">
              <Trans
                i18nKey="com_ui_delete_confirm_strong"
                values={{ title: presetToDelete.title }}
                components={{ strong: <strong /> }}
              />
            </div>
            <div className="flex justify-end gap-4 pt-4">
              <Button
                aria-label="cancel"
                variant="outline"
                onClick={() => handleDeleteDialogChange(false)}
              >
                {localize('com_ui_cancel')}
              </Button>
              <Button variant="destructive" onClick={confirmDeletePreset}>
                {localize('com_ui_delete')}
              </Button>
            </div>
          </OGDialogContent>
        </OGDialog>
      )}
    </Root>
  );
};

export default PresetsMenu;
