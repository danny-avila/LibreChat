import { useEffect, useId, useRef, useState } from 'react';
import { v4 } from 'uuid';
import { useAtom } from 'jotai';
import { Button, Composer, ControlCombobox, Input, Label, Spinner } from '@librechat/client';
import {
  dataService,
  mediaSubmissionRequestSchema,
  mediaUploadResponseSchema,
} from 'librechat-data-provider';
import type {
  MediaCapability,
  MediaCatalog,
  MediaEnumControl,
  MediaNumberControl,
  MediaOperation,
} from 'librechat-data-provider';
import type { MediaDraft, PendingMedia } from './state';
import {
  mediaControlLabels,
  mediaErrorLabels,
  mediaInputRoleLabels,
  mediaOperationLabels,
} from './labels';
import { mediaErrorCode } from './commands';
import { mediaDraftFamily } from './state';
import { useLocalize } from '~/hooks';
import { useMediaHost } from './host';

const offeringId = (
  offering: Pick<MediaCatalog['offerings'][number], 'connectionId' | 'modelId'>,
) => JSON.stringify([offering.connectionId, offering.modelId]);

export function MediaForm({
  catalog,
  threadId,
  send,
  busy,
}: {
  catalog: MediaCatalog;
  threadId?: string;
  send: (command: PendingMedia) => Promise<void>;
  busy: boolean;
}) {
  const host = useMediaHost();
  const localize = useLocalize();
  const id = useId();
  const draftKey = `${host.scope}:${threadId ?? 'new'}`;
  const [draft, setDraft] = useAtom(mediaDraftFamily(draftKey));
  const [error, setError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const upload = useRef<AbortController>();
  useEffect(() => () => upload.current?.abort(), [draftKey]);
  const offerings = catalog.offerings.filter(
    (offering) => offering.available && offering.capabilities.length > 0,
  );
  const offering = draft.offering
    ? offerings.find((item) => offeringId(item) === draft.offering)
    : offerings[0];
  const capability =
    offering?.capabilities.find((item) => item.operation === draft.operation) ??
    offering?.capabilities[0];
  useEffect(() => {
    if (draft.offering || !offering || !capability) return;
    setDraft((previous) =>
      previous.offering
        ? previous
        : {
            ...previous,
            offering: offeringId(offering),
            operation: capability.operation,
            parameters: {
              count: capability.controls.count?.default ?? capability.controls.count?.min ?? 1,
            },
            revision: previous.revision + 1,
          },
    );
  }, [draft.offering, offering, capability, setDraft]);
  const change = (update: Partial<MediaDraft>) =>
    setDraft((previous) => ({ ...previous, ...update, revision: previous.revision + 1 }));
  const param = <K extends keyof MediaDraft['parameters']>(
    key: K,
    value: MediaDraft['parameters'][K],
  ) => change({ parameters: { ...draft.parameters, [key]: value } });
  const numeric = (key: 'count' | 'durationSeconds' | 'seed', control?: MediaNumberControl) => {
    if (!control) return null;
    const label = localize(mediaControlLabels[key]);
    const value = draft.parameters[key] ?? control.default ?? control.min;
    return (
      <div key={key} className="space-y-1">
        <Label htmlFor={`${id}-${key}`}>{label}</Label>
        {control.values ? (
          <ControlCombobox
            ariaLabel={label}
            selectedValue={String(value)}
            items={control.values.map((item) => ({ value: String(item), label: String(item) }))}
            setValue={(next) => param(key, Number(next))}
            variant="field"
            isCollapsed={false}
            portal={false}
          />
        ) : (
          <Input
            id={`${id}-${key}`}
            type="number"
            min={control.min}
            max={control.max}
            step={1}
            value={value}
            onChange={(event) => param(key, Number(event.target.value))}
          />
        )}
      </div>
    );
  };
  const enumeration = (
    key: 'size' | 'aspectRatio' | 'quality' | 'format' | 'background' | 'resolution',
    control?: MediaEnumControl,
  ) => {
    if (!control) return null;
    const label = localize(mediaControlLabels[key]);
    return (
      <div key={key} className="space-y-1">
        <Label>{label}</Label>
        <ControlCombobox
          ariaLabel={label}
          selectedValue={draft.parameters[key] ?? control.default ?? control.values[0]}
          items={control.values.map((value) => ({ value, label: value }))}
          setValue={(value) => {
            if (key === 'format') {
              if (value === 'png' || value === 'jpeg' || value === 'webp') param(key, value);
            } else if (key === 'background') {
              if (value === 'auto' || value === 'opaque' || value === 'transparent')
                param(key, value);
            } else param(key, value);
          }}
          variant="field"
          isCollapsed={false}
          portal={false}
        />
      </div>
    );
  };
  async function submit() {
    if (!offering || !capability || !host.canCreate || busy || uploading) return;
    setError(undefined);
    const controls = capability.controls;
    const parameters: MediaDraft['parameters'] = {
      count: draft.parameters.count ?? controls.count?.default ?? 1,
    };
    const numbers = ['count', 'seed'] as const;
    for (const key of numbers) {
      const control = controls[key];
      if (control) parameters[key] = draft.parameters[key] ?? control.default ?? control.min;
    }
    if (capability.operation === 'video.generate') {
      for (const key of ['aspectRatio', 'resolution'] as const) {
        const control = capability.controls[key];
        if (control)
          parameters[key] = draft.parameters[key] ?? control.default ?? control.values[0];
      }
      if (capability.controls.durationSeconds)
        parameters.durationSeconds =
          draft.parameters.durationSeconds ??
          capability.controls.durationSeconds.default ??
          capability.controls.durationSeconds.min;
      if (capability.controls.audio) parameters.audio = draft.parameters.audio ?? false;
    } else {
      for (const key of ['size', 'aspectRatio', 'quality', 'resolution'] as const) {
        const control = capability.controls[key];
        if (control)
          parameters[key] = draft.parameters[key] ?? control.default ?? control.values[0];
      }
      const format = draft.parameters.format ?? capability.controls.format?.default;
      if (format === 'png' || format === 'jpeg' || format === 'webp') parameters.format = format;
      const background = draft.parameters.background ?? capability.controls.background?.default;
      if (background === 'auto' || background === 'opaque' || background === 'transparent')
        parameters.background = background;
    }
    const parsed = mediaSubmissionRequestSchema.safeParse({
      schemaVersion: 1,
      clientRequestId: v4(),
      threadId,
      parentTurnId: threadId ? draft.parentTurnId : undefined,
      selection: {
        connectionId: offering.connectionId,
        modelId: offering.modelId,
        catalogVersion: catalog.version,
      },
      operation: capability.operation,
      prompt: draft.prompt,
      inputs: draft.inputs,
      parameters,
    });
    if (
      !parsed.success ||
      draft.inputs.length < capability.inputs.min ||
      draft.inputs.length > capability.inputs.max ||
      draft.inputs.some((input) => !capability.inputs.roles.includes(input.role))
    ) {
      setError(localize('com_media_error_invalid_request'));
      return;
    }
    await send({
      kind: 'submission',
      request: parsed.data,
      draftKey,
      draftRevision: draft.revision,
    });
  }
  async function uploadFile(file?: File) {
    if (!file || !host.canCreate || !capability) return;
    const ownerKey = draftKey;
    const controller = new AbortController();
    upload.current = controller;
    setUploading(true);
    setError(undefined);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = mediaUploadResponseSchema.parse(
        await dataService.uploadMedia(body, controller.signal),
      );
      if (!host.isCurrentSession() || controller.signal.aborted || ownerKey !== draftKey) return;
      let role: MediaDraft['inputs'][number]['role'] = 'reference';
      if (file.type.startsWith('video/')) role = 'video';
      else if (file.type.startsWith('audio/')) role = 'audio';
      setDraft((previous) => ({
        ...previous,
        revision: previous.revision + 1,
        assets: [...previous.assets, response.file],
        inputs: [
          ...previous.inputs,
          {
            file_id: response.file.file_id,
            role,
          },
        ],
        operation:
          file.type.startsWith('image/') &&
          offering?.capabilities.some((item) => item.operation === 'image.edit')
            ? 'image.edit'
            : previous.operation,
      }));
    } catch (failure) {
      if (!controller.signal.aborted && host.isCurrentSession())
        setError(localize(mediaErrorLabels[mediaErrorCode(failure)]));
    } finally {
      if (!controller.signal.aborted && host.isCurrentSession()) setUploading(false);
    }
  }
  if (!offering || !capability)
    return (
      <div role="status">
        <p>{localize('com_media_no_models')}</p>
        {draft.offering && offerings.length > 0 && (
          <Button variant="outline" onClick={() => change({ offering: '' })}>
            {localize('com_media_choose_model')}
          </Button>
        )}
      </div>
    );
  const controls: MediaCapability['controls'] = capability.controls;
  return (
    <section className="space-y-4" aria-label={localize('com_media_create')}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>{localize('com_media_model')}</Label>
          <ControlCombobox
            ariaLabel={localize('com_media_model')}
            variant="field"
            isCollapsed={false}
            portal={false}
            selectedValue={offeringId(offering)}
            displayValue={`${offering.connectionName} · ${offering.modelName}`}
            items={offerings.map((item) => ({
              value: offeringId(item),
              label: `${item.connectionName} · ${item.modelName}`,
            }))}
            setValue={(value) => {
              const next = offerings.find((item) => offeringId(item) === value)?.capabilities[0];
              if (next)
                change({
                  offering: value,
                  operation: next.operation,
                  parameters: {
                    count: next.controls.count?.default ?? next.controls.count?.min ?? 1,
                  },
                });
            }}
          />
        </div>
        <div className="space-y-1">
          <Label>{localize('com_media_operation')}</Label>
          <ControlCombobox
            ariaLabel={localize('com_media_operation')}
            variant="field"
            isCollapsed={false}
            portal={false}
            selectedValue={capability.operation}
            displayValue={localize(mediaOperationLabels[capability.operation])}
            items={offering.capabilities.map((item) => ({
              value: item.operation,
              label: localize(mediaOperationLabels[item.operation]),
            }))}
            setValue={(value) => {
              const next = offering.capabilities.find((item) => item.operation === value);
              if (next)
                change({
                  operation: value as MediaOperation,
                  parameters: {
                    count: next.controls.count?.default ?? next.controls.count?.min ?? 1,
                  },
                });
            }}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {numeric('count', controls.count)}
        {numeric('seed', controls.seed)}
        {enumeration('aspectRatio', controls.aspectRatio)}
        {capability.operation === 'video.generate' ? (
          <>
            {numeric('durationSeconds', capability.controls.durationSeconds)}
            {enumeration('resolution', capability.controls.resolution)}
            {capability.controls.audio && (
              <Label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.parameters.audio ?? false}
                  onChange={(event) => param('audio', event.target.checked)}
                />
                {localize(mediaControlLabels.audio)}
              </Label>
            )}
          </>
        ) : (
          <>
            {enumeration('size', capability.controls.size)}
            {enumeration('resolution', capability.controls.resolution)}
            {enumeration('quality', capability.controls.quality)}
            {enumeration('format', capability.controls.format)}
            {enumeration('background', capability.controls.background)}
          </>
        )}
      </div>
      {draft.parentTurnId && (
        <div className="flex items-center gap-2">
          <p>{localize('com_media_pinned_parent')}</p>
          <Button
            variant="ghost"
            onClick={() => change({ parentTurnId: undefined, inputs: [], assets: [] })}
          >
            {localize('com_media_clear_reference')}
          </Button>
        </div>
      )}
      {draft.inputs.length > 0 && (
        <ul className="space-y-2">
          {draft.inputs.map((input, index) => (
            <li key={`${input.file_id}:${index}`} className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate">
                {draft.assets.find((asset) => asset.file_id === input.file_id)?.filename ??
                  input.file_id}
              </span>
              <ControlCombobox
                ariaLabel={localize('com_media_input_role')}
                variant="field"
                isCollapsed={false}
                portal={false}
                selectedValue={input.role}
                displayValue={localize(mediaInputRoleLabels[input.role])}
                items={capability.inputs.roles.map((role) => ({
                  value: role,
                  label: localize(mediaInputRoleLabels[role]),
                }))}
                setValue={(value) =>
                  change({
                    inputs: draft.inputs.map((item, at) =>
                      at === index ? { ...item, role: value as typeof input.role } : item,
                    ),
                  })
                }
              />
              <Button
                variant="ghost"
                onClick={() =>
                  change({
                    inputs: draft.inputs.filter((_, at) => at !== index),
                    assets: draft.assets.filter((asset) => asset.file_id !== input.file_id),
                  })
                }
              >
                {localize('com_media_remove_reference')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={`${id}-upload`}
          type="file"
          accept="image/*,video/*,audio/*"
          className="sr-only"
          disabled={uploading || !host.canCreate || draft.inputs.length >= catalog.limits.maxInputs}
          onChange={(event) => {
            void uploadFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <Button
          variant="outline"
          disabled={uploading || !host.canCreate || draft.inputs.length >= catalog.limits.maxInputs}
          onClick={() => document.getElementById(`${id}-upload`)?.click()}
        >
          {localize('com_media_upload')}
        </Button>
        {uploading && (
          <>
            <Spinner />
            <Button
              variant="ghost"
              onClick={() => {
                upload.current?.abort();
                setUploading(false);
              }}
            >
              {localize('com_ui_cancel')}
            </Button>
          </>
        )}
        {draft.inputs.length > 0 && (
          <Button
            variant="outline"
            disabled={busy || !host.canCreate || uploading}
            onClick={() =>
              void send({
                kind: 'import',
                request: {
                  schemaVersion: 1,
                  clientRequestId: v4(),
                  threadId,
                  inputs: draft.inputs,
                  title: draft.prompt.slice(0, catalog.limits.maxTitleChars) || undefined,
                },
                draftKey,
                draftRevision: draft.revision,
              })
            }
          >
            {localize('com_media_import')}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-text-primary">
          {error}
        </p>
      )}
      {!host.canCreate && <p role="status">{localize('com_media_readonly')}</p>}
      <Composer
        value={draft.prompt}
        onChange={(prompt) => change({ prompt })}
        onSubmit={() => void submit()}
        canSubmit={
          host.canCreate &&
          !busy &&
          !uploading &&
          draft.prompt.trim().length > 0 &&
          draft.prompt.length <= catalog.limits.maxPromptChars
        }
        submitLabel={localize('com_media_queue')}
        ariaLabel={localize('com_media_prompt')}
        placeholder={localize('com_media_prompt')}
        maxLength={catalog.limits.maxPromptChars}
        submitOnEnter={host.enterToSend}
        resolveKeyVerdict={host.resolveKeyVerdict}
      />
    </section>
  );
}
