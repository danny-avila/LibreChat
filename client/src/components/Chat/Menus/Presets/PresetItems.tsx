import { Trash2 } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { Close } from '@radix-ui/react-popover';
import { Flipper, Flipped } from 'react-flip-toolkit';
import { useGetEndpointsQuery } from 'librechat-data-provider/react-query';
import type { FC } from 'react';
import type { TPreset } from 'librechat-data-provider';
import FileUpload from '~/components/Input/EndpointMenu/FileUpload';
import { PinIcon, EditIcon, TrashIcon } from '~/components/svg';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { getPresetTitle, getEndpointField } from '~/utils';
import { Dialog, DialogTrigger } from '~/components/ui/';
import { MenuSeparator, MenuItem } from '../UI';
import { icons } from '../Endpoints/Icons';
import { useLocalize } from '~/hooks';
import store from '~/store';

const PresetItems: FC<{
  presets: TPreset[];
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
            className="w-40 truncate rounded bg-transparent px-2 py-1 text-xs font-medium font-normal text-gray-600 transition-colors dark:bg-transparent dark:text-gray-300 sm:w-72"
          >
            {defaultPreset
              ? `${localize('com_endpoint_preset_default_item')} ${defaultPreset.title}`
              : localize('com_endpoint_preset_default_none')}
          </label>
          <Dialog>
            <DialogTrigger asChild>
              <label
                htmlFor="file-upload"
                className="mr-1 flex h-[32px] cursor-pointer  items-center rounded bg-transparent px-2 py-1 text-xs font-medium font-normal text-gray-600 transition-colors hover:bg-slate-200 hover:text-red-700 dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-green-500"
              >
                <Trash2 className="mr-1 flex w-[22px] items-center stroke-1" />
                {localize('com_ui_clear')} {localize('com_ui_all')}
              </label>
            </DialogTrigger>
            <DialogTemplate
              title={`${localize('com_ui_clear')} ${localize('com_endpoint_presets')}`}
              description={localize('com_endpoint_presets_clear_warning')}
              selection={{
                selectHandler: clearAllPresets,
                selectClasses: 'bg-red-600 hover:bg-red-700 dark:hover:bg-red-800 text-white',
                selectText: localize('com_ui_clear'),
              }}
              className="max-w-[500px]"
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
          <div className="flex h-full grow items-center justify-end gap-2">
            {/* TODO: Create Preset from here */}
            {localize('com_endpoint_no_presets')}
          </div>
        </div>
      )}
      <Flipper flipKey={presets.map(({ presetId }) => presetId).join('.')}>
        {presets &&
          presets.length > 0 &&
          presets.map((preset, i) => {
            if (!preset || !preset.presetId) {
              return null;
            }

            const iconKey = getEndpointField(endpointsConfig, preset.endpoint, 'type')
              ? 'unknown'
              : preset.endpointType ?? preset.endpoint ?? 'unknown';
            const Icon = icons[iconKey];

            return (
              <Close asChild key={`preset-${preset.presetId}`}>
                <div key={`preset-${preset.presetId}`}>
                  <Flipped flipId={preset.presetId}>
                    <MenuItem
                      key={`preset-item-${preset.presetId}`}
                      textClassName="text-xs max-w-[150px] sm:max-w-[200px] truncate md:max-w-full "
                      title={getPresetTitle(preset)}
                      disableHover={true}
                      onClick={() => onSelectPreset(preset)}
                      icon={
                        Icon &&
                        Icon({
                          context: 'menu-item',
                          iconURL: getEndpointField(endpointsConfig, preset.endpoint, 'iconURL'),
                          className: 'icon-md mr-1 dark:text-white',
                          endpoint: preset.endpoint,
                        })
                      }
                      selected={false}
                      data-testid={`preset-item-${preset}`}
                    >
                      <div className="flex h-full items-center justify-end gap-1">
                        <button
                          className="m-0 h-full rounded-md p-2 px-4 text-gray-400 hover:text-gray-700 dark:bg-gray-700 dark:text-gray-400 dark:hover:text-gray-200 sm:invisible sm:group-hover:visible"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onSetDefaultPreset(preset, defaultPreset?.presetId === preset.presetId);
                          }}
                        >
                          <PinIcon unpin={defaultPreset?.presetId === preset.presetId} />
                        </button>
                        <button
                          className="m-0 h-full rounded-md p-2 px-4 text-gray-400 hover:text-gray-700 dark:bg-gray-700 dark:text-gray-400 dark:hover:text-gray-200 sm:invisible sm:group-hover:visible"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onChangePreset(preset);
                          }}
                        >
                          <EditIcon />
                        </button>
                        <button
                          className="m-0 h-full rounded-md p-2 px-4 text-gray-400 hover:text-gray-700 dark:bg-gray-700 dark:text-gray-400 dark:hover:text-gray-200 sm:invisible sm:group-hover:visible"
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
