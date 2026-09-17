import { useEffect, useId, useRef, useState } from 'react';
import { v4 } from 'uuid';
import { useAtom } from 'jotai';
import { Film, ImagePlus, Pencil, SlidersHorizontal, Upload, X } from 'lucide-react';
import {
  Button,
  Alert,
  Checkbox,
  Composer,
  ControlCombobox,
  Input,
  Label,
  Spinner,
} from '@librechat/client';
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
  MediaSelection,
} from 'librechat-data-provider';
import type { ReactNode } from 'react';
import type { MediaDraft, PendingMedia } from './state';
import type { MediaEditTarget } from './context';
import {
  mediaControlLabels,
  mediaErrorLabels,
  mediaInputRoleLabels,
  mediaOperationLabels,
} from './labels';
import { withImageContext } from './context';
import { mediaErrorCode } from './commands';
import { mediaDraftFamily } from './state';
import { MediaPreview } from './Asset';
import { useLocalize } from '~/hooks';
import { useMediaHost } from './host';

const offeringId = (
  offering: Pick<MediaCatalog['offerings'][number], 'connectionId' | 'modelId'>,
) => JSON.stringify([offering.connectionId, offering.modelId]);

export type MediaFormParts = { settings: ReactNode; composer: ReactNode };

export function MediaForm({
  catalog,
  threadId,
  initialSelection,
  imageContext,
  send,
  busy,
  portal = false,
  children,
}: {
  catalog: MediaCatalog;
  threadId?: string;
  initialSelection?: MediaSelection;
  imageContext?: MediaEditTarget;
  send: (command: PendingMedia) => Promise<void>;
  busy: boolean;
  portal?: boolean;
  children?: (parts: MediaFormParts) => ReactNode;
}) {
  const host = useMediaHost();
  const localize = useLocalize();
  const id = useId();
  const draftKey = `${host.scope}:${threadId ?? 'new'}`;
  const [savedDraft, setDraft] = useAtom(mediaDraftFamily(draftKey));
  const [error, setError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const upload = useRef<AbortController>();
  useEffect(() => () => upload.current?.abort(), [draftKey]);
  const offerings = catalog.offerings.filter(
    (offering) => offering.available && offering.capabilities.length > 0,
  );
  const initialOffering = offerings.find(
    (item) =>
      item.connectionId === initialSelection?.connectionId &&
      item.modelId === initialSelection.modelId,
  );
  const implicitDefault =
    !!initialOffering &&
    savedDraft.revision === 1 &&
    !savedDraft.prompt &&
    savedDraft.inputs.length === 0 &&
    !savedDraft.parentTurnId;
  const offering =
    savedDraft.offering && !implicitDefault
      ? offerings.find((item) => offeringId(item) === savedDraft.offering)
      : (initialOffering ?? offerings[0]);
  const selectedCapability =
    offering?.capabilities.find((item) => item.operation === savedDraft.operation) ??
    offering?.capabilities[0];
  const draft = withImageContext(savedDraft, imageContext, selectedCapability?.operation);
  const automaticImage = draft !== savedDraft;
  const capability =
    offering?.capabilities.find((item) => item.operation === draft.operation) ?? selectedCapability;
  const unsupportedContext = automaticImage && capability?.operation !== 'image.edit';
  useEffect(() => {
    if (!offering || !capability) return;
    if (draft.offering && (!implicitDefault || draft.offering === offeringId(offering))) return;
    setDraft((previous) =>
      previous.offering && !(implicitDefault && previous.revision === 1)
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
  }, [draft.offering, implicitDefault, offering, capability, setDraft]);
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
    const invalid =
      value < control.min ||
      value > control.max ||
      (control.values != null && !control.values.includes(value));
    return (
      <div key={key} className="space-y-1">
        <Label htmlFor={`${id}-${key}`}>{label}</Label>
        {control.values ? (
          <ControlCombobox
            showCarat
            ariaLabel={label}
            ariaInvalid={invalid}
            ariaDescribedBy={invalid ? `${id}-unsupported` : undefined}
            selectedValue={String(value)}
            items={control.values.map((item) => ({ value: String(item), label: String(item) }))}
            setValue={(next) => param(key, Number(next))}
            variant="field"
            isCollapsed={false}
            portal={portal}
          />
        ) : (
          <Input
            id={`${id}-${key}`}
            type="number"
            min={control.min}
            max={control.max}
            step={1}
            value={value}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${id}-unsupported` : undefined}
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
    const value = draft.parameters[key] ?? control.default ?? control.values[0];
    const invalid = !control.values.includes(value);
    return (
      <div key={key} className="space-y-1">
        <Label>{label}</Label>
        <ControlCombobox
          showCarat
          ariaLabel={label}
          ariaInvalid={invalid}
          ariaDescribedBy={invalid ? `${id}-unsupported` : undefined}
          selectedValue={value}
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
          portal={portal}
        />
      </div>
    );
  };
  async function submit() {
    if (
      !offering ||
      !capability ||
      !host.canCreate ||
      busy ||
      uploading ||
      invalidSettings.length ||
      unsupportedContext
    )
      return;
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
      const format =
        draft.parameters.format ??
        capability.controls.format?.default ??
        capability.controls.format?.values[0];
      if (
        capability.controls.format &&
        (format === 'png' || format === 'jpeg' || format === 'webp')
      )
        parameters.format = format;
      const background =
        draft.parameters.background ??
        capability.controls.background?.default ??
        capability.controls.background?.values[0];
      if (
        capability.controls.background &&
        (background === 'auto' || background === 'opaque' || background === 'transparent')
      )
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
    change({
      autoEdit: false,
      parentTurnId: draft.parentTurnId,
      inputs: draft.inputs,
      assets: draft.assets,
    });
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
  if (!offering || !capability) {
    const unavailable = (
      <div role="status">
        <p>{localize('com_media_no_models')}</p>
        {draft.offering && offerings.length > 0 && (
          <Button variant="outline" onClick={() => change({ offering: '' })}>
            {localize('com_media_choose_model')}
          </Button>
        )}
      </div>
    );
    return children ? children({ settings: unavailable, composer: unavailable }) : unavailable;
  }
  const controls: MediaCapability['controls'] = capability.controls;
  const invalidSettings = Object.entries(controls).flatMap(([key, control]) => {
    const value = draft.parameters[key as keyof MediaDraft['parameters']];
    if (value == null || !control || typeof control !== 'object') return [];
    const invalidChoice =
      'values' in control && control.values && !control.values.some((choice) => choice === value);
    const invalidNumber =
      typeof value === 'number' && 'min' in control && (value < control.min || value > control.max);
    return invalidChoice || invalidNumber ? [key as keyof typeof mediaControlLabels] : [];
  });
  const operations = (['image.generate', 'image.edit', 'video.generate'] as const).filter(
    (operation) =>
      offerings.some((item) => item.capabilities.some((cap) => cap.operation === operation)),
  );
  const modeOfferings = offerings.filter((item) =>
    item.capabilities.some((cap) => cap.operation === capability.operation),
  );
  const connections = [
    ...new Map(modeOfferings.map((item) => [item.connectionId, item.connectionName])).entries(),
  ];
  const selectOffering = (next: typeof offering, operation: MediaOperation, switchMode = false) => {
    const cap = next.capabilities.find((item) => item.operation === operation);
    if (!cap) return;
    const update: Partial<MediaDraft> = {
      offering: offeringId(next),
      operation,
      parameters: { count: cap.controls.count?.default ?? cap.controls.count?.min ?? 1 },
    };
    if (switchMode && operation === 'image.generate') {
      update.autoEdit = false;
      update.parentTurnId = undefined;
      update.inputs = [];
      update.assets = [];
    } else if (
      switchMode &&
      operation === 'image.edit' &&
      !savedDraft.inputs.length &&
      !savedDraft.parentTurnId
    ) {
      update.autoEdit = true;
    }
    change(update);
  };
  const inputsValid =
    draft.inputs.length >= capability.inputs.min &&
    draft.inputs.length <= capability.inputs.max &&
    draft.inputs.every((input) => capability.inputs.roles.includes(input.role));
  const icons = { 'image.generate': ImagePlus, 'image.edit': Pencil, 'video.generate': Film };
  const operationLabels = {
    'image.generate': 'com_media_image',
    'image.edit': 'com_media_edit',
    'video.generate': 'com_media_video',
  } as const;
  const placeholders = {
    'image.generate': 'com_media_image_placeholder',
    'image.edit': 'com_media_edit_placeholder',
    'video.generate': 'com_media_video_placeholder',
  } as const;
  const referenceActions = (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        id={`${id}-upload`}
        type="file"
        accept="image/*,video/*,audio/*"
        aria-label={localize('com_media_upload')}
        className="hidden"
        disabled={uploading || !host.canCreate || draft.inputs.length >= catalog.limits.maxInputs}
        onChange={(event) => {
          void uploadFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={uploading || !host.canCreate || draft.inputs.length >= catalog.limits.maxInputs}
        onClick={() => document.getElementById(`${id}-upload`)?.click()}
      >
        <Upload className="mr-1.5 size-4" aria-hidden="true" />
        {localize('com_media_upload')}
      </Button>
      {uploading && (
        <>
          <Spinner className="size-4" />
          <Button
            variant="ghost"
            size="sm"
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
          variant="ghost"
          size="sm"
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
  );
  const settings = (
    <section className="space-y-5" aria-label={localize('com_media_settings')}>
      <div
        role="group"
        aria-label={localize('com_media_operation')}
        className="flex flex-wrap gap-1"
      >
        {operations.map((operation) => {
          const Icon = icons[operation];
          return (
            <Button
              key={operation}
              variant={operation === capability.operation ? 'secondary' : 'ghost'}
              size="sm"
              aria-label={localize(mediaOperationLabels[operation])}
              aria-pressed={operation === capability.operation}
              onClick={() => {
                const next = offering.capabilities.some((cap) => cap.operation === operation)
                  ? offering
                  : offerings.find((item) =>
                      item.capabilities.some((cap) => cap.operation === operation),
                    );
                if (next) selectOffering(next, operation, true);
              }}
            >
              <Icon className="mr-1.5 size-4" aria-hidden="true" />
              {localize(operationLabels[operation])}
            </Button>
          );
        })}
      </div>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-connection`}>{localize('com_media_connection')}</Label>
          <ControlCombobox
            showCarat
            selectId={`${id}-connection`}
            ariaLabel={localize('com_media_connection')}
            variant="field"
            isCollapsed={false}
            portal={portal}
            selectedValue={offering.connectionId}
            displayValue={offering.connectionName}
            items={connections.map(([value, label]) => ({ value, label }))}
            setValue={(value) => {
              const next = modeOfferings.find((item) => item.connectionId === value);
              if (next) selectOffering(next, capability.operation);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-model`}>{localize('com_media_model')}</Label>
          <ControlCombobox
            showCarat
            selectId={`${id}-model`}
            ariaLabel={localize('com_media_model')}
            variant="field"
            isCollapsed={false}
            portal={portal}
            selectedValue={offeringId(offering)}
            displayValue={offering.modelName}
            items={modeOfferings
              .filter((item) => item.connectionId === offering.connectionId)
              .map((item) => ({ value: offeringId(item), label: item.modelName }))}
            setValue={(value) => {
              const next = modeOfferings.find((item) => offeringId(item) === value);
              if (next) selectOffering(next, capability.operation);
            }}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-border-light pt-4">
        {numeric('count', controls.count)}
        {enumeration('aspectRatio', controls.aspectRatio)}
        {capability.operation === 'video.generate' ? (
          <>
            {numeric('durationSeconds', capability.controls.durationSeconds)}
            {enumeration('resolution', capability.controls.resolution)}
          </>
        ) : (
          <>
            {enumeration('size', capability.controls.size)}
            {enumeration('resolution', capability.controls.resolution)}
          </>
        )}
      </div>
      <details className="group border-t border-border-light pt-3">
        <summary className="flex cursor-pointer items-center gap-2 rounded-lg py-1 text-sm font-medium focus-visible:outline">
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          {localize('com_media_advanced')}
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {numeric('seed', controls.seed)}
          {capability.operation === 'video.generate' ? (
            capability.controls.audio && (
              <div className="col-span-2 flex items-center gap-2">
                <Checkbox
                  id={`${id}-audio`}
                  aria-label={localize(mediaControlLabels.audio)}
                  checked={draft.parameters.audio ?? false}
                  onCheckedChange={(checked) => param('audio', checked === true)}
                />
                <Label htmlFor={`${id}-audio`}>{localize(mediaControlLabels.audio)}</Label>
              </div>
            )
          ) : (
            <>
              {enumeration('quality', capability.controls.quality)}
              {enumeration('format', capability.controls.format)}
              {enumeration('background', capability.controls.background)}
            </>
          )}
        </div>
      </details>
    </section>
  );
  const composer = (
    <section className="space-y-3" aria-label={localize('com_media_create')} data-media-composer>
      {draft.parentTurnId && !automaticImage && (
        <div className="flex items-start gap-2 rounded-xl bg-surface-secondary p-3">
          <p className="text-xs leading-5 text-text-secondary">
            {localize('com_media_pinned_parent')}
          </p>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={localize('com_media_clear_reference')}
            onClick={() =>
              change({
                autoEdit: false,
                parentTurnId: undefined,
                inputs: [],
                assets: [],
                operation: draft.operation === 'image.edit' ? 'image.generate' : draft.operation,
              })
            }
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      )}
      {draft.inputs.length > 0 && (
        <ul
          className="flex max-h-40 flex-wrap gap-2 overflow-y-auto"
          aria-label={localize('com_media_references')}
        >
          {draft.inputs.map((input, index) => {
            const asset = draft.assets.find((item) => item.file_id === input.file_id);
            return (
              <li
                key={`${input.file_id}:${index}`}
                className="flex w-full items-center gap-2 rounded-xl border border-border-light p-2 sm:w-72"
              >
                {asset && (
                  <span className="w-14 shrink-0 overflow-hidden rounded-lg">
                    <MediaPreview asset={asset} compact />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  {automaticImage ? (
                    <p role="status" className="text-sm text-text-secondary">
                      {localize('com_media_editing_latest')}
                    </p>
                  ) : (
                    <ControlCombobox
                      showCarat
                      ariaLabel={localize('com_media_input_role')}
                      variant="field"
                      isCollapsed={false}
                      portal={portal}
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
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={localize('com_media_remove_reference')}
                  onClick={() =>
                    change({
                      inputs: draft.inputs.filter((_, at) => at !== index),
                      assets: draft.assets.filter((item) => item.file_id !== input.file_id),
                      parentTurnId: index === 0 ? undefined : draft.parentTurnId,
                      autoEdit: false,
                      operation:
                        draft.inputs.length === 1 && draft.operation === 'image.edit'
                          ? 'image.generate'
                          : draft.operation,
                    })
                  }
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {!inputsValid && (
        <p role="status" className="text-xs leading-5 text-text-secondary">
          {localize('com_media_reference_hint', {
            min: capability.inputs.min,
            max: capability.inputs.max,
          })}
        </p>
      )}
      {invalidSettings.length > 0 && (
        <Alert variant="warning" id={`${id}-unsupported`}>
          {localize('com_media_unsupported_settings', {
            settings: invalidSettings.map((key) => localize(mediaControlLabels[key])).join(', '),
          })}
        </Alert>
      )}
      {unsupportedContext && (
        <p role="status" className="text-sm text-text-secondary">
          {localize('com_media_edit_model_required')}
        </p>
      )}
      <div className="space-y-2">
        <Composer
          value={draft.prompt}
          onChange={(prompt) => change({ prompt })}
          onSubmit={() => void submit()}
          canSubmit={
            host.canCreate &&
            !busy &&
            !uploading &&
            !unsupportedContext &&
            inputsValid &&
            invalidSettings.length === 0 &&
            draft.prompt.trim().length > 0 &&
            draft.prompt.length <= catalog.limits.maxPromptChars
          }
          submitLabel={localize('com_media_queue')}
          ariaLabel={localize('com_media_prompt')}
          placeholder={localize(placeholders[capability.operation])}
          minRows={1}
          maxRows={6}
          maxLength={catalog.limits.maxPromptChars}
          submitOnEnter={host.enterToSend}
          resolveKeyVerdict={host.resolveKeyVerdict}
          actions={
            <>
              {referenceActions}
              <span
                className="min-w-0 max-w-48 truncate px-1 text-xs text-text-secondary"
                title={offering.modelName}
              >
                {offering.modelName}
              </span>
              {busy && (
                <span role="status" className="flex items-center gap-2 text-xs text-text-secondary">
                  <Spinner className="size-4" />
                  {localize('com_media_preparing')}
                </span>
              )}
            </>
          }
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-text-primary">
          {error}
        </p>
      )}
      {!host.canCreate && (
        <p role="status" className="text-sm text-text-secondary">
          {localize('com_media_readonly')}
        </p>
      )}
    </section>
  );
  return children ? (
    children({ settings, composer })
  ) : (
    <div className="space-y-5">
      {settings}
      {composer}
    </div>
  );
}
