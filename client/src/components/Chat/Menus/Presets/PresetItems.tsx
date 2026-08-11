import { useRecoilValue } from 'recoil';
import { Close } from '@radix-ui/react-popover';
import { BookCopy, FileX2 } from 'lucide-react';
import { Flipper, Flipped } from 'react-flip-toolkit';
import { getEndpointField } from 'librechat-data-provider';
import {
  Button,
  PinIcon,
  EditIcon,
  TrashIcon,
  TooltipAnchor,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@librechat/client';
import type { TPreset } from 'librechat-data-provider';
import type { FC } from 'react';
import FileUpload from '~/components/Chat/Input/Files/FileUpload';
import { useGetEndpointsQuery } from '~/data-provider';
import { getPresetTitle, getIconKey } from '~/utils';
import { icons } from '~/hooks/Endpoint/Icons';
import { MenuSeparator } from '../UI';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

const PresetItems: FC<{
  presets?: Array<TPreset | undefined>;
  onSetDefaultPreset: (preset: TPreset, remove?: boolean) => void;
  onSelectPreset: (preset: TPreset) => void;
  onChangePreset: (preset: TPreset) => void;
  onDeletePreset: (preset: TPreset) => void;
  clearAllPresets: () => void;
  onFileSelected: (jsonData: Record<string, unknown>) => void;
  onSaveAsPreset?: () => void;
}> = ({
  presets,
  onSetDefaultPreset,
  onSelectPreset,
  onChangePreset,
  onDeletePreset,
  clearAllPresets,
  onFileSelected,
  onSaveAsPreset,
}) => {
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const defaultPreset = useRecoilValue(store.defaultPreset);
  const localize = useLocalize();
  const hasPresets = (presets?.length ?? 0) > 0;

  return (
    <>
      <div className="flex min-w-[300px] items-center gap-3 border-b border-border-light bg-surface-secondary px-3 py-2 md:min-w-[400px]">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary">
            {localize('com_endpoint_examples')}
          </p>
          {hasPresets && (
            <p className="truncate text-xs text-text-secondary">
              {defaultPreset
                ? `${localize('com_endpoint_preset_default_item')} ${defaultPreset.title}`
                : localize('com_endpoint_preset_default_none')}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {hasPresets && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  className="h-8 px-2 text-xs font-normal text-text-secondary hover:text-text-destructive"
                  aria-label={localize('com_ui_clear_all')}
                >
                  <FileX2 className="size-4" aria-hidden="true" />
                  {localize('com_ui_clear_all')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="w-11/12 max-w-md rounded-lg">
                <AlertDialogHeader>
                  <AlertDialogTitle>{localize('com_ui_clear_presets')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {localize('com_endpoint_presets_clear_warning')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{localize('com_ui_cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={clearAllPresets}
                    className="bg-surface-destructive text-text-on-status hover:bg-surface-destructive-hover"
                  >
                    {localize('com_ui_clear')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <FileUpload
            id="preset-import"
            onFileSelected={onFileSelected}
            containerClassName="mr-0 h-8 hover:text-text-primary"
          />
        </div>
      </div>
      {presets && presets.length === 0 && (
        <div className="flex min-h-40 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <div className="rounded-full bg-surface-secondary p-2.5 text-text-secondary">
            <BookCopy className="size-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-text-primary">
              {localize('com_endpoint_no_presets')}
            </p>
            <p className="max-w-sm text-xs leading-5 text-text-secondary">
              {localize('com_endpoint_no_presets_description')}
            </p>
          </div>
          {onSaveAsPreset && (
            <Button variant="default" size="sm" type="button" onClick={onSaveAsPreset}>
              {localize('com_endpoint_save_as_preset')}
            </Button>
          )}
        </div>
      )}
      <Flipper
        flipKey={presets
          ?.map((preset) => preset?.presetId)
          .filter((p) => p)
          .join('.')}
      >
        {presets &&
          presets.length > 0 &&
          presets.map((preset, i) => {
            const presetId = preset?.presetId ?? '';
            if (!preset || !presetId) {
              return null;
            }

            const iconKey = getIconKey({ endpoint: preset.endpoint, endpointsConfig });
            const Icon = icons[iconKey];
            const presetTitle = getPresetTitle(preset);

            return (
              <Close asChild key={`preset-${presetId}`}>
                <div key={`preset-${presetId}`}>
                  <Flipped flipId={presetId}>
                    <div className="group m-1.5 flex items-center gap-2 rounded px-3 py-1.5 text-sm hover:bg-surface-hover">
                      <Button
                        variant="ghost"
                        type="button"
                        className="h-auto min-w-0 flex-1 justify-start gap-1 bg-transparent p-2 text-left text-xs font-normal hover:bg-transparent focus-visible:ring-offset-0"
                        onClick={() => onSelectPreset(preset)}
                        aria-label={presetTitle}
                        data-testid={`preset-item-${presetId}`}
                      >
                        {Icon != null && (
                          <Icon
                            context="menu-item"
                            iconURL={getEndpointField(endpointsConfig, preset.endpoint, 'iconURL')}
                            className="icon-md shrink-0"
                            endpoint={preset.endpoint}
                          />
                        )}
                        <span className="truncate">{presetTitle}</span>
                      </Button>
                      <div className="flex items-center justify-end gap-1">
                        <TooltipAnchor
                          description={
                            defaultPreset?.presetId === presetId
                              ? localize('com_ui_unpin')
                              : localize('com_ui_pin')
                          }
                          aria-label={
                            defaultPreset?.presetId === presetId
                              ? localize('com_ui_unpin')
                              : localize('com_ui_pin')
                          }
                          render={
                            <Button
                              variant="ghost"
                              className={cn(
                                'm-0 h-full rounded-md bg-transparent p-2 text-text-tertiary hover:text-text-primary focus:text-text-primary',
                                defaultPreset?.presetId === presetId
                                  ? ''
                                  : // opacity keeps buttons in the tab order; pointer-events-none
                                    // while transparent so touch/pointer cannot hit invisible controls
                                    'sm:pointer-events-none sm:opacity-0 sm:transition-opacity sm:focus:pointer-events-auto sm:focus:opacity-100 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100',
                              )}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onSetDefaultPreset(preset, defaultPreset?.presetId === presetId);
                              }}
                            >
                              <PinIcon unpin={defaultPreset?.presetId === presetId} />
                            </Button>
                          }
                        />
                        <TooltipAnchor
                          description={localize('com_ui_edit')}
                          aria-label={localize('com_ui_edit')}
                          render={
                            <Button
                              variant="ghost"
                              className="m-0 h-full rounded-md p-2 text-text-tertiary hover:text-text-primary focus:text-text-primary sm:pointer-events-none sm:opacity-0 sm:transition-opacity sm:focus:pointer-events-auto sm:focus:opacity-100 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onChangePreset(preset);
                              }}
                            >
                              <EditIcon />
                            </Button>
                          }
                        />
                        <TooltipAnchor
                          description={localize('com_ui_delete')}
                          aria-label={localize('com_ui_delete')}
                          render={
                            <Button
                              variant="ghost"
                              className="m-0 h-full rounded-md p-2 text-text-tertiary hover:text-text-primary focus:text-text-primary sm:pointer-events-none sm:opacity-0 sm:transition-opacity sm:focus:pointer-events-auto sm:focus:opacity-100 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onDeletePreset(preset);
                              }}
                            >
                              <TrashIcon />
                            </Button>
                          }
                        />
                      </div>
                    </div>
                  </Flipped>
                  {i !== presets.length - 1 && <MenuSeparator />}
                </div>
              </Close>
            );
          })}
      </Flipper>
    </>
  );
};

export default PresetItems;
