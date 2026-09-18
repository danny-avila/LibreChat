import { useId, useRef, useState } from 'react';
import { BookCopy, Star, StarOff, Trash } from 'lucide-react';
import {
  Button,
  Checkbox,
  Chip,
  Input,
  Label,
  Spinner,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
  TooltipAnchor,
} from '@librechat/client';
import type { MediaCatalog, MediaPreset, MediaPresetSettings } from 'librechat-data-provider';
import type { UseQueryResult } from '@tanstack/react-query';
import { useMediaPresetMutations } from '~/data-provider/Media';
import { mediaOperationLabels } from './labels';
import { useLocalize } from '~/hooks';
import { useMediaHost } from './host';

export function MediaPresets({
  catalog,
  presets,
  current,
  onApply,
}: {
  catalog: MediaCatalog;
  presets: UseQueryResult<MediaPreset[]>;
  /** The settings a new preset captures; absent while no model is selected. */
  current?: MediaPresetSettings;
  /** Restores a preset into the draft; false when its model is unavailable. */
  onApply: (settings: MediaPresetSettings) => boolean;
}) {
  const host = useMediaHost();
  const localize = useLocalize();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [asDefault, setAsDefault] = useState(false);
  const [confirming, setConfirming] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const { create, update, remove } = useMediaPresetMutations(host);
  const busy = create.isLoading || update.isLoading || remove.isLoading;
  const items = presets.data ?? [];
  const fallback = items.find((preset) => preset.isDefault);
  const modelName = (settings: MediaPresetSettings) =>
    catalog.offerings.find(
      (item) => item.connectionId === settings.connectionId && item.modelId === settings.modelId,
    )?.modelName ?? settings.modelId;
  const close = (next: boolean) => {
    setOpen(next);
    if (next) return;
    setConfirming(undefined);
    setNotice(undefined);
  };
  const save = async () => {
    if (!current || !title.trim()) return;
    setNotice(undefined);
    try {
      await create.mutateAsync({ title: title.trim(), isDefault: asDefault, settings: current });
      if (!host.isCurrentSession()) return;
      setTitle('');
      setAsDefault(false);
      setNotice(localize('com_media_preset_saved'));
    } catch {
      if (host.isCurrentSession()) setNotice(localize('com_media_preset_error'));
    }
  };
  const apply = (preset: MediaPreset) => {
    if (onApply(preset.settings)) {
      close(false);
      return;
    }
    setNotice(localize('com_media_preset_unavailable'));
  };
  return (
    <>
      <Button
        ref={trigger}
        variant="outline"
        size="sm"
        className="w-full justify-start gap-2 font-normal"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <BookCopy className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{localize('com_media_presets')}</span>
        {fallback && (
          <span className="ml-auto truncate text-xs text-text-secondary">{fallback.title}</span>
        )}
      </Button>
      <OGDialog open={open} onOpenChange={close} triggerRef={trigger}>
        <OGDialogContent
          className="max-h-[85dvh] w-11/12 max-w-lg overflow-y-auto"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <OGDialogTitle>{localize('com_media_presets')}</OGDialogTitle>
          <OGDialogDescription>{localize('com_media_presets_description')}</OGDialogDescription>
          {current && host.canCreate && (
            <form
              noValidate
              className="space-y-3 rounded-xl border border-border-light p-3"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-title`}>{localize('com_media_preset_name')}</Label>
                <Input
                  id={`${id}-title`}
                  value={title}
                  maxLength={catalog.limits.maxTitleChars}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>
              <p className="text-xs text-text-secondary">
                {modelName(current)} · {localize(mediaOperationLabels[current.operation])}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${id}-default`}
                    aria-labelledby={`${id}-default-label`}
                    checked={asDefault}
                    onCheckedChange={(checked) => setAsDefault(checked === true)}
                  />
                  <Label id={`${id}-default-label`} htmlFor={`${id}-default`}>
                    {localize('com_media_preset_default')}
                  </Label>
                </div>
                <Button type="submit" size="sm" disabled={busy || !title.trim()}>
                  {create.isLoading && <Spinner className="size-4" />}
                  {localize('com_media_preset_save')}
                </Button>
              </div>
            </form>
          )}
          {notice && (
            <p role="status" className="text-sm text-text-secondary">
              {notice}
            </p>
          )}
          {presets.isLoading && (
            <p role="status" className="flex items-center gap-2 text-sm text-text-secondary">
              <Spinner className="size-4" />
              {localize('com_media_loading')}
            </p>
          )}
          {presets.isError && (
            <div role="alert" className="flex items-center gap-3 text-sm">
              <span>{localize('com_media_load_failed')}</span>
              <Button variant="outline" size="sm" onClick={() => void presets.refetch()}>
                {localize('com_ui_retry')}
              </Button>
            </div>
          )}
          {presets.isSuccess && items.length === 0 && (
            <p className="text-sm text-text-secondary">{localize('com_media_presets_empty')}</p>
          )}
          {items.length > 0 && (
            <ul className="divide-y divide-border-light" aria-label={localize('com_media_presets')}>
              {items.map((preset) => (
                <li key={preset.presetId} className="flex flex-wrap items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <span className="truncate">{preset.title}</span>
                      {preset.isDefault && <Chip>{localize('com_ui_default')}</Chip>}
                    </p>
                    <p className="truncate text-xs text-text-secondary">
                      {modelName(preset.settings)} ·{' '}
                      {localize(mediaOperationLabels[preset.settings.operation])}
                    </p>
                  </div>
                  {confirming === preset.presetId ? (
                    <span className="flex items-center gap-1">
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={busy}
                        onClick={async () => {
                          await remove.mutateAsync(preset.presetId).catch(() => undefined);
                          if (host.isCurrentSession()) setConfirming(undefined);
                        }}
                      >
                        {localize('com_ui_delete')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirming(undefined)}>
                        {localize('com_ui_cancel')}
                      </Button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => apply(preset)}
                      >
                        {localize('com_media_preset_apply')}
                      </Button>
                      {host.canCreate && (
                        <>
                          <TooltipAnchor
                            description={localize(
                              preset.isDefault
                                ? 'com_media_preset_unset_default'
                                : 'com_media_preset_set_default',
                            )}
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled={busy}
                                aria-pressed={preset.isDefault}
                                aria-label={localize(
                                  preset.isDefault
                                    ? 'com_media_preset_unset_default'
                                    : 'com_media_preset_set_default',
                                )}
                                onClick={() =>
                                  void update
                                    .mutateAsync({
                                      presetId: preset.presetId,
                                      update: { isDefault: !preset.isDefault },
                                    })
                                    .catch(() => undefined)
                                }
                              >
                                {preset.isDefault ? (
                                  <StarOff className="size-4" aria-hidden="true" />
                                ) : (
                                  <Star className="size-4" aria-hidden="true" />
                                )}
                              </Button>
                            }
                          />
                          <TooltipAnchor
                            description={localize('com_media_preset_delete')}
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled={busy}
                                aria-label={localize('com_media_preset_delete')}
                                onClick={() => setConfirming(preset.presetId)}
                              >
                                <Trash className="size-4" aria-hidden="true" />
                              </Button>
                            }
                          />
                        </>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </OGDialogContent>
      </OGDialog>
    </>
  );
}
