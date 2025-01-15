import { useRecoilValue } from 'recoil';
import { Close } from '@radix-ui/react-popover';
import { Flipper, Flipped } from 'react-flip-toolkit';
import { useGetEndpointsQuery } from 'librechat-data-provider/react-query';
import type { FC } from 'react';
import type { TPreset } from 'librechat-data-provider';
import { getPresetTitle, getEndpointField, getIconKey } from '~/utils';
import FileUpload from '~/components/Chat/Input/Files/FileUpload';
import { PinIcon, EditIcon, TrashIcon } from '~/components/svg';
import { Dialog, DialogTrigger, Label } from '~/components/ui';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { MenuSeparator, MenuItem } from '../UI';
import { icons } from '../Endpoints/Icons';
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
}> = ({
  presets,
  onSetDefaultPreset,
  onSelectPreset,
  onChangePreset,
  onDeletePreset,
  clearAllPresets,
  onFileSelected,
}) => {
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const defaultPreset = useRecoilValue(store.defaultPreset);
  const localize = useLocalize();
  return (
    <>
      <div
        role="menuitem"
        className="pointer-none group m-1.5 flex h-8 min-w-[170px] gap-2 rounded px-5 py-2.5 !pr-3 text-sm !opacity-100 focus:ring-0 radix-disabled:pointer-events-none radix-disabled:opacity-50  md:min-w-[240px]"
        tabIndex={-1}
      >
        <div className="flex h-full grow items-center justify-end gap-2">
          <label
            htmlFor="default-preset"
            className="w-40 truncate rounded bg-transparent py-1 text-xs font-medium text-gray-600 transition-colors dark:bg-transparent dark:text-gray-300 sm:w-72"
          >
            {defaultPreset
              ? `${localize('com_endpoint_preset_default_item')} ${defaultPreset.title}`
              : localize('com_endpoint_preset_default_none')}
          </label>
          <Dialog>
            <DialogTrigger asChild>
              <label
                htmlFor="file-upload"
                className="mr-1 flex h-[32px] cursor-pointer items-center rounded bg-transparent px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-red-700 dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-red-700"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                  className="mr-1 flex w-[22px] items-center"
                >
                  <path d="M9.293 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4.707A1 1 0 0 0 13.707 4L10 .293A1 1 0 0 0 9.293 0M9.5 3.5v-2l3 3h-2a1 1 0 0 1-1-1M6.854 7.146 8 8.293l1.146-1.147a.5.5 0 1 1 .708.708L8.707 9l1.147 1.146a.5.5 0 0 1-.708.708L8 9.707l-1.146 1.147a.5.5 0 0 1-.708-.708L7.293 9 6.146 7.854a.5.5 0 1 1 .708-.708"></path>
                </svg>
                {localize('com_ui_clear')} {localize('com_ui_all')}
              </label>
            </DialogTrigger>
            <DialogTemplate
              showCloseButton={false}
              title={`${localize('com_ui_clear')} ${localize('com_endpoint_presets')}`}
              className="max-w-[450px]"
              main={
                <>
                  <div className="flex w-full flex-col items-center gap-2">
                    <div className="grid w-full items-center gap-2">
                      <Label
                        htmlFor="preset-item-clear-all"
                        className="text-left text-sm font-medium"
                      >
                        {localize('com_endpoint_presets_clear_warning')}
                      </Label>
                    </div>
                  </div>
                </>
              }
              selection={{
                selectHandler: clearAllPresets,
                selectClasses: 'bg-red-600 hover:bg-red-700 dark:hover:bg-red-600 text-white',
                selectText: localize('com_ui_clear'),
              }}
            />
            <FileUpload onFileSelected={onFileSelected} />
          </Dialog>
        </div>
      </div>
      {presets && presets.length === 0 && (
        <div
          role="menuitem"
          className="pointer-none group m-1.5 flex h-8 min-w-[170px] gap-2 rounded px-5 py-2.5 !pr-3 text-sm !opacity-100 focus:ring-0 radix-disabled:pointer-events-none radix-disabled:opacity-50 md:min-w-[240px]"
          tabIndex={-1}
        >
          <div className="flex h-full grow items-center justify-end gap-2 text-gray-600 dark:text-gray-300">
            {/* TODO: Create Preset from here */}
            {localize('com_endpoint_no_presets')}
          </div>
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

            return (
              <Close asChild key={`preset-${presetId}`}>
                <div key={`preset-${presetId}`}>
                  <Flipped flipId={presetId}>
                    <MenuItem
                      key={`preset-item-${presetId}`}
                      textClassName="text-xs max-w-[150px] sm:max-w-[200px] truncate md:max-w-full "
                      title={getPresetTitle(preset)}
                      onClick={() => onSelectPreset(preset)}
                      icon={
                        Icon != null && (
                          <Icon
                            context="menu-item"
                            iconURL={getEndpointField(endpointsConfig, preset.endpoint, 'iconURL')}
                            className="icon-md mr-1 dark:text-white"
                            endpoint={preset.endpoint}
                          />
                        )
                      }
                      selected={false}
                      data-testid={`preset-item-${preset}`}
                    >
                      <div className="flex h-full items-center justify-end gap-1">
                        <button
                          className={cn(
                            'm-0 h-full rounded-md bg-transparent p-2 text-gray-400 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
                            defaultPreset?.presetId === presetId
                              ? ''
                              : 'sm:invisible sm:group-hover:visible',
                          )}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onSetDefaultPreset(preset, defaultPreset?.presetId === presetId);
                          }}
                        >
                          <PinIcon unpin={defaultPreset?.presetId === presetId} />
                        </button>
                        <button
                          className="m-0 h-full rounded-md p-2 text-gray-400 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 sm:invisible sm:group-hover:visible"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onChangePreset(preset);
                          }}
                        >
                          <EditIcon />
                        </button>
                        <button
                          className="m-0 h-full rounded-md p-2 text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-200 sm:invisible sm:group-hover:visible"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDeletePreset(preset);
                          }}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </MenuItem>
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
