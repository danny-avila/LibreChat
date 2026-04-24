import { useRecoilValue } from 'recoil';
import { Close } from '@radix-ui/react-popover';
import { Flipper, Flipped } from 'react-flip-toolkit';
import { getEndpointField } from 'librechat-data-provider';
import { PinIcon, EditIcon, TrashIcon, TooltipAnchor } from '@librechat/client';
import type { TPreset } from 'librechat-data-provider';
import type { FC } from 'react';
import { useGetEndpointsQuery } from '~/data-provider';
import { getPresetTitle, getIconKey } from '~/utils';
import { MenuSeparator, MenuItem } from '../UI';
import { icons } from '~/hooks/Endpoint/Icons';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

// BKL: `clearAllPresets` and `onFileSelected` are kept on the prop signature
// to avoid cascading a signature change through `PresetsMenu`, but the
// "Clear all" + "Import" controls that consumed them are intentionally
// removed — BKL operators manage presets centrally, so exposing per-session
// bulk destructive / upload affordances on the chat header was noise.
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
}) => {
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const defaultPreset = useRecoilValue(store.defaultPreset);
  const localize = useLocalize();
  return (
    <>
      <div
        role="menuitem"
        className="pointer-none group m-1.5 flex h-8 min-w-[170px] gap-2 rounded px-5 py-2.5 !pr-3 text-sm !opacity-100 focus:ring-0 radix-disabled:pointer-events-none radix-disabled:opacity-50 md:min-w-[240px]"
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
                            <button
                              className={cn(
                                'm-0 h-full rounded-md bg-transparent p-2 text-gray-400 hover:text-gray-700 focus:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 dark:focus:text-gray-200',
                                defaultPreset?.presetId === presetId
                                  ? ''
                                  : 'sm:invisible sm:group-focus-within:visible sm:group-hover:visible',
                              )}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onSetDefaultPreset(preset, defaultPreset?.presetId === presetId);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  onSetDefaultPreset(preset, defaultPreset?.presetId === presetId);
                                }
                              }}
                            >
                              <PinIcon unpin={defaultPreset?.presetId === presetId} />
                            </button>
                          }
                        />
                        <TooltipAnchor
                          description={localize('com_ui_edit')}
                          aria-label={localize('com_ui_edit')}
                          render={
                            <button
                              className="m-0 h-full rounded-md p-2 text-gray-400 hover:text-gray-700 focus:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 dark:focus:text-gray-200 sm:invisible sm:group-focus-within:visible sm:group-hover:visible"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onChangePreset(preset);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  onChangePreset(preset);
                                }
                              }}
                            >
                              <EditIcon />
                            </button>
                          }
                        />
                        <TooltipAnchor
                          description={localize('com_ui_delete')}
                          aria-label={localize('com_ui_delete')}
                          render={
                            <button
                              className="m-0 h-full rounded-md p-2 text-gray-400 hover:text-gray-600 focus:text-gray-600 dark:text-gray-400 dark:hover:text-gray-200 dark:focus:text-gray-200 sm:invisible sm:group-focus-within:visible sm:group-hover:visible"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onDeletePreset(preset);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  onDeletePreset(preset);
                                }
                              }}
                            >
                              <TrashIcon />
                            </button>
                          }
                        />
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
