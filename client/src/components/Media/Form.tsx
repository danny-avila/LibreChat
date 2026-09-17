import { useEffect, useId, useState } from 'react';
import { v4 } from 'uuid';
import { useAtom } from 'jotai';
import { Film, ImagePlus, Link, Pencil, SlidersHorizontal, Upload, X } from 'lucide-react';
import {
  Button,
  Alert,
  Checkbox,
  Composer,
  ControlCombobox,
  Input,
  Label,
  Spinner,
  Textarea,
} from '@librechat/client';
import {
  mediaSubmissionRequestSchema,
  mediaURLUploadRequestSchema,
  mediaProviderOptionsSchema,
} from 'librechat-data-provider';
import type {
  MediaCatalog,
  MediaEnumControl,
  MediaNumberControl,
  MediaOperation,
  MediaSelection,
  MediaOffering,
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
import { useMediaUpload } from '~/data-provider/Media/uploads';
import { withImageContext } from './context';
import { mediaErrorCode } from './commands';
import { mediaDraftFamily } from './state';
import { MediaPreview } from './Asset';
import { useLocalize } from '~/hooks';
import { useMediaHost } from './host';

const offeringId = (
  offering: Pick<MediaCatalog['offerings'][number], 'connectionId' | 'modelId'>,
) => JSON.stringify([offering.connectionId, offering.modelId]);

const numericKeys = [
  'count',
  'durationSeconds',
  'seed',
  'outputCompression',
  'strength',
  'guidance',
  'upscaleFactor',
  'creativity',
] as const;
const enumKeys = ['size', 'aspectRatio', 'quality', 'format', 'background', 'resolution'] as const;
type NumericKey = (typeof numericKeys)[number];
type EnumKey = (typeof enumKeys)[number];
type FormControls = Partial<Record<NumericKey, MediaNumberControl>> &
  Partial<Record<EnumKey, MediaEnumControl>> & {
    audio?: boolean;
    negativePrompt?: boolean;
    providerOptions?: string[];
  };

function defaultParameters(draft: MediaDraft, controls: FormControls): MediaDraft['parameters'] {
  const values: MediaDraft['parameters'] = {
    count: draft.parameters.count ?? controls.count?.default ?? 1,
  };
  for (const key of numericKeys) {
    const control = controls[key];
    const value = draft.parameters[key] ?? control?.default;
    if (control && value !== undefined) values[key] = value;
  }
  // Exact pixels and resolution tiers are alternative sizing methods.
  const exactSize = !!draft.parameters.size || (!controls.resolution && !!controls.size);
  for (const key of enumKeys) {
    const control = controls[key];
    if (
      !control ||
      (key === 'size' && !exactSize) ||
      (key === 'resolution' && exactSize) ||
      (key === 'aspectRatio' && exactSize)
    )
      continue;
    const value =
      draft.parameters[key] ??
      control.default ??
      (control.required ? undefined : control.values[0]);
    if (value !== undefined) Object.assign(values, { [key]: value });
  }
  if (controls.audio) values.audio = draft.parameters.audio ?? false;
  if (controls.negativePrompt && draft.parameters.negativePrompt)
    values.negativePrompt = draft.parameters.negativePrompt;
  return values;
}

function readProviderOptions(text: string, allowed: string[] | undefined, catalog: MediaCatalog) {
  if (!text.trim()) return {};
  try {
    if (new TextEncoder().encode(text).length > catalog.limits.maxProviderOptionBytes)
      return { invalid: true };
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { invalid: true };
    const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
    while (pending.length) {
      const item = pending.pop()!;
      if (item.depth > catalog.limits.maxProviderOptionDepth) return { invalid: true };
      if (item.value && typeof item.value === 'object')
        Object.values(item.value).forEach((child) =>
          pending.push({ value: child, depth: item.depth + 1 }),
        );
    }
    if (Object.keys(value).some((key) => !allowed?.includes(key))) return { invalid: true };
    const parsed = mediaProviderOptionsSchema.safeParse(value);
    return parsed.success ? { value: parsed.data } : { invalid: true };
  } catch {
    return { invalid: true };
  }
}

function supportsMode(offering: MediaOffering, operation: MediaOperation) {
  return (
    offering.capabilities.some(
      (cap) => (cap.operation === 'video.generate') === (operation === 'video.generate'),
    ) ||
    (!offering.capabilities.length &&
      offering.api.endsWith('.videos') === (operation === 'video.generate'))
  );
}

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
  const unavailableProvider = (reason: MediaOffering['unavailableReason']) =>
    reason === 'not_ready'
      ? localize('com_media_provider_configuration_required')
      : localize(mediaErrorLabels[reason ?? 'unsupported']);
  const id = useId();
  const draftKey = `${host.scope}:${threadId ?? 'new'}`;
  const [savedDraft, setDraft] = useAtom(mediaDraftFamily(draftKey));
  const [error, setError] = useState<string>();
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
  const providerTag =
    (implicitDefault || !savedDraft.offering
      ? initialSelection?.providerTag
      : savedDraft.providerTag) ?? offering?.defaultProviderTag;
  const selectedRoute = offering?.routes?.find((route) => route.providerTag === providerTag);
  const staleRoute = !!providerTag && !selectedRoute;
  const capabilities = selectedRoute?.capabilities ?? offering?.capabilities;
  const selectedCapability =
    capabilities?.find((item) => item.operation === savedDraft.operation) ?? capabilities?.[0];
  const draft = withImageContext(savedDraft, imageContext, selectedCapability?.operation);
  const automaticImage = draft !== savedDraft;
  const capability =
    capabilities?.find((item) => item.operation === draft.operation) ?? selectedCapability;
  const uploads = useMediaUpload(
    host,
    JSON.stringify([
      draftKey,
      offering?.connectionId,
      offering?.modelId,
      providerTag,
      capability?.operation,
    ]),
  );
  const { uploading } = uploads;
  const hostedRoles = capability?.inputs.hostedRoles ?? [];
  const referenceURLRole =
    draft.referenceURLRole && hostedRoles.includes(draft.referenceURLRole)
      ? draft.referenceURLRole
      : (capability?.inputs.requiredRoles?.find(
          (role): role is 'video' | 'audio' =>
            (role === 'video' || role === 'audio') && hostedRoles.includes(role),
        ) ?? hostedRoles[0]);
  const referenceURL = mediaURLUploadRequestSchema.safeParse({
    url: draft.referenceURL?.trim() ?? '',
    role: referenceURLRole,
  });
  const unsupportedContext =
    draft.operation === 'image.edit' && capability?.operation !== 'image.edit';
  useEffect(() => {
    if (!offering || !capability) return;
    if (draft.offering && (!implicitDefault || draft.offering === offeringId(offering))) return;
    setDraft((previous) =>
      previous.offering && !(implicitDefault && previous.revision === 1)
        ? previous
        : {
            ...previous,
            offering: offeringId(offering),
            providerTag,
            operation: capability.operation,
            parameters: {
              count: capability.controls.count?.default ?? capability.controls.count?.min ?? 1,
            },
            revision: previous.revision + 1,
          },
    );
  }, [draft.offering, implicitDefault, offering, capability, providerTag, setDraft]);
  const change = (update: Partial<MediaDraft>) =>
    setDraft((previous) => ({ ...previous, ...update, revision: previous.revision + 1 }));
  const param = <K extends keyof MediaDraft['parameters']>(
    key: K,
    value: MediaDraft['parameters'][K],
  ) => {
    const parameters = { ...draft.parameters, [key]: value };
    if (key === 'size') {
      delete parameters.resolution;
      delete parameters.aspectRatio;
    } else if (key === 'resolution' || key === 'aspectRatio') delete parameters.size;
    change({ parameters });
  };
  const controls: FormControls = capability?.controls ?? {};
  const parameters = defaultParameters(draft, controls);
  const providerOptionsText =
    draft.providerOptionsText ??
    (draft.parameters.providerOptions
      ? JSON.stringify(draft.parameters.providerOptions, null, 2)
      : '');
  const options = readProviderOptions(providerOptionsText, controls.providerOptions, catalog);
  if (options.value && Object.keys(options.value).length)
    parameters.providerOptions = options.value;
  const invalidSettings = Object.entries(controls).flatMap(([key, control]) => {
    if (!control || typeof control !== 'object' || Array.isArray(control)) return [];
    const value =
      draft.parameters[key as keyof MediaDraft['parameters']] ??
      parameters[key as keyof MediaDraft['parameters']];
    const missingRequired = 'required' in control && control.required && value == null;
    const invalidChoice =
      value != null &&
      'values' in control &&
      control.values &&
      !control.values.some((choice) => choice === value);
    const invalidNumber =
      value != null &&
      'min' in control &&
      (typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < control.min ||
        value > control.max);
    const invalidInteger =
      value != null &&
      ['count', 'seed', 'outputCompression'].includes(key) &&
      !Number.isInteger(value);
    return missingRequired || invalidChoice || invalidNumber || invalidInteger
      ? [key as keyof typeof mediaControlLabels]
      : [];
  });
  if (draft.parameters.size && draft.parameters.resolution)
    invalidSettings.push('size', 'resolution');
  if (parameters.background === 'transparent' && parameters.format === 'jpeg')
    invalidSettings.push('background', 'format');
  if (
    draft.parameters.negativePrompt &&
    (!controls.negativePrompt ||
      draft.parameters.negativePrompt.length > catalog.limits.maxPromptChars)
  )
    invalidSettings.push('negativePrompt');
  const numeric = (key: NumericKey, control?: MediaNumberControl) => {
    if (!control) return null;
    const label = localize(mediaControlLabels[key]);
    const value = draft.parameters[key] ?? parameters[key] ?? '';
    const invalid =
      invalidSettings.includes(key) ||
      (value !== '' &&
        (!Number.isFinite(value) ||
          value < control.min ||
          value > control.max ||
          (control.values != null && !control.values.includes(value))));
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
            step={
              ['strength', 'guidance', 'upscaleFactor', 'creativity', 'durationSeconds'].includes(
                key,
              )
                ? 'any'
                : 1
            }
            value={value}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${id}-unsupported` : undefined}
            onChange={(event) =>
              param(key, event.target.value === '' ? undefined : Number(event.target.value))
            }
          />
        )}
      </div>
    );
  };
  const enumeration = (key: EnumKey, control?: MediaEnumControl) => {
    if (!control) return null;
    const label = localize(mediaControlLabels[key]);
    const value = draft.parameters[key] ?? parameters[key] ?? '';
    const invalid = value ? !control.values.includes(value) : !!control.required;
    return (
      <div key={key} className="space-y-1">
        <Label>{label}</Label>
        <ControlCombobox
          showCarat
          ariaLabel={label}
          ariaInvalid={invalid}
          ariaDescribedBy={invalid ? `${id}-unsupported` : undefined}
          selectedValue={value}
          selectPlaceholder={localize('com_media_choose_value')}
          items={control.values.map((value) => ({ value, label: value }))}
          setValue={(value) => {
            if (key === 'format') {
              if (value === 'png' || value === 'jpeg' || value === 'webp' || value === 'svg')
                param(key, value);
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
      options.invalid ||
      staleRoute ||
      !inputsValid ||
      avatarVoiceMissing ||
      unsupportedContext
    )
      return;
    setError(undefined);
    const parsed = mediaSubmissionRequestSchema.safeParse({
      schemaVersion: 1,
      clientRequestId: v4(),
      threadId,
      parentTurnId: threadId ? draft.parentTurnId : undefined,
      selection: {
        connectionId: offering.connectionId,
        modelId: offering.modelId,
        catalogVersion: catalog.version,
        providerTag,
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
      draft.inputs.some((input) => !capability.inputs.roles.includes(input.role)) ||
      capability.inputs.requiredRoles?.some(
        (role) => !draft.inputs.some((input) => input.role === role),
      ) ||
      (capability.workflow === 'avatar' &&
        !draft.inputs.some((input) => input.role === 'audio') &&
        !parameters.providerOptions?.voice_id)
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
    if (!file || !host.canCreate || !capability || uploading) return;
    const imageCapabilities = capabilities?.find((item) => item.operation === 'image.edit');
    const roles =
      file.type.startsWith('image/') && imageCapabilities
        ? imageCapabilities.inputs.roles
        : capability.inputs.roles;
    let role: MediaDraft['inputs'][number]['role'] | undefined;
    if (file.type.startsWith('video/')) role = 'video';
    else if (file.type.startsWith('audio/')) role = 'audio';
    else if (file.type.startsWith('image/'))
      role = (['reference', 'start_frame', 'end_frame'] as const).find((value) =>
        roles.includes(value),
      );
    if (!role || !roles.includes(role)) {
      setError(localize('com_media_upload_unsupported'));
      return;
    }
    if (hostedRoles.some((hostedRole) => hostedRole === role)) {
      setError(localize('com_media_reference_needs_url'));
      return;
    }
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
      const response = await uploads.uploadFile(body);
      if (!response) return;
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
          file.type.startsWith('image/') && imageCapabilities ? 'image.edit' : previous.operation,
      }));
    } catch (failure) {
      setError(localize(mediaErrorLabels[mediaErrorCode(failure)]));
    }
  }
  async function uploadURL() {
    if (
      !host.canCreate ||
      !capability ||
      uploading ||
      !referenceURL.success ||
      !hostedRoles.includes(referenceURL.data.role) ||
      draft.inputs.length >= Math.min(catalog.limits.maxInputs, capability.inputs.max)
    )
      return;
    setError(undefined);
    const payload = referenceURL.data;
    change({ autoEdit: false, inputs: draft.inputs, assets: draft.assets });
    try {
      const response = await uploads.uploadURL(payload);
      if (!response) return;
      setDraft((previous) => ({
        ...previous,
        revision: previous.revision + 1,
        referenceURL: previous.referenceURL?.trim() === payload.url ? '' : previous.referenceURL,
        assets: [...previous.assets, response.file],
        inputs: [
          ...previous.inputs,
          { file_id: response.file.file_id, role: payload.role, sourceURL: response.sourceURL },
        ],
      }));
    } catch (failure) {
      setError(localize(mediaErrorLabels[mediaErrorCode(failure)]));
    }
  }
  if (!offering || !capability) {
    const integrations = catalog.integrations ?? catalog.offerings.map((item) => ({ ...item }));
    const unavailable = (
      <div className="space-y-3">
        <p role="status">{localize('com_media_no_models')}</p>
        <Label>{localize('com_media_connection')}</Label>
        <ControlCombobox
          ariaLabel={localize('com_media_connection')}
          selectedValue=""
          selectPlaceholder={localize('com_media_choose_model')}
          isCollapsed={false}
          variant="field"
          portal={portal}
          items={[...new Map(integrations.map((item) => [item.connectionId, item])).values()].map(
            (item) => ({
              value: item.connectionId,
              label: `${item.connectionName}${item.available ? '' : ` (${unavailableProvider(item.unavailableReason)})`}`,
              disabled: !offerings.some(
                (candidate) => candidate.connectionId === item.connectionId,
              ),
            }),
          )}
          setValue={(value) => {
            const next = offerings.find((item) => item.connectionId === value);
            if (next)
              change({
                offering: offeringId(next),
                operation: next.capabilities[0].operation,
                providerTag: next.defaultProviderTag,
                providerOptionsText: undefined,
                parameters: { count: 1 },
              });
          }}
        />
        {draft.offering && offerings.length > 0 && (
          <Button variant="outline" onClick={() => change({ offering: '' })}>
            {localize('com_media_choose_model')}
          </Button>
        )}
      </div>
    );
    return children ? children({ settings: unavailable, composer: unavailable }) : unavailable;
  }
  const operations = (['image.generate', 'image.edit', 'video.generate'] as const).filter(
    (operation) =>
      offerings.some((item) => item.capabilities.some((cap) => cap.operation === operation)),
  );
  const activeOperation = draft.operation === 'image.edit' ? draft.operation : capability.operation;
  const modeOfferings = catalog.offerings.filter((item) => supportsMode(item, activeOperation));
  const availableForMode = (item: MediaOffering) =>
    item.available && item.capabilities.some((cap) => cap.operation === activeOperation);
  const connections = new Map(
    modeOfferings.map((item) => [
      item.connectionId,
      {
        value: item.connectionId,
        label: item.connectionName,
        unavailableReason: item.unavailableReason,
      },
    ]),
  );
  for (const integration of catalog.integrations ?? []) {
    if (integration.api.endsWith('.videos') !== (activeOperation === 'video.generate')) continue;
    connections.set(integration.connectionId, {
      value: integration.connectionId,
      label: integration.connectionName,
      unavailableReason: integration.unavailableReason,
    });
  }
  const selectOffering = (next: typeof offering, operation: MediaOperation, switchMode = false) => {
    const preferredProvider =
      offeringId(next) === offeringId(offering) ? providerTag : next.defaultProviderTag;
    const route =
      next.routes?.find(
        (item) =>
          item.providerTag === preferredProvider &&
          item.capabilities.some((cap) => cap.operation === operation),
      ) ??
      next.routes?.find((item) => item.capabilities.some((cap) => cap.operation === operation));
    const cap = (route?.capabilities ?? next.capabilities).find(
      (item) => item.operation === operation,
    );
    if (!cap) return;
    const update: Partial<MediaDraft> = {
      offering: offeringId(next),
      providerTag: route?.providerTag ?? next.defaultProviderTag,
      providerOptionsText: undefined,
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
    draft.inputs.every((input) => capability.inputs.roles.includes(input.role)) &&
    draft.inputs.every(
      (input) => !hostedRoles.some((role) => role === input.role) || !!input.sourceURL,
    ) &&
    (capability.inputs.requiredRoles ?? []).every((role) =>
      draft.inputs.some((input) => input.role === role),
    );
  const avatarVoiceMissing =
    capability.workflow === 'avatar' &&
    !draft.inputs.some((input) => input.role === 'audio') &&
    (typeof parameters.providerOptions?.voice_id !== 'string' ||
      !parameters.providerOptions.voice_id.trim());
  const uploadLimit = Math.min(
    catalog.limits.maxInputs,
    Math.max(
      capability.inputs.max,
      capabilities?.find((item) => item.operation === 'image.edit')?.inputs.max ?? 0,
    ),
  );
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
        disabled={uploading || !host.canCreate || draft.inputs.length >= uploadLimit}
        onChange={(event) => {
          void uploadFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={uploading || !host.canCreate || draft.inputs.length >= uploadLimit}
        onClick={() => document.getElementById(`${id}-upload`)?.click()}
      >
        <Upload className="mr-1.5 size-4" aria-hidden="true" />
        {localize('com_media_upload')}
      </Button>
      {uploading && (
        <>
          <Spinner className="size-4" />
          <Button variant="ghost" size="sm" onClick={uploads.cancel}>
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
              variant={operation === activeOperation ? 'secondary' : 'ghost'}
              size="sm"
              aria-label={localize(mediaOperationLabels[operation])}
              aria-pressed={operation === activeOperation}
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
            items={[...connections.values()].map(({ value, label, unavailableReason }) => {
              const disabled = !modeOfferings.some(
                (item) => item.connectionId === value && availableForMode(item),
              );
              return {
                value,
                label: disabled ? `${label} (${unavailableProvider(unavailableReason)})` : label,
                disabled,
              };
            })}
            setValue={(value) => {
              const next = modeOfferings.find(
                (item) => item.connectionId === value && availableForMode(item),
              );
              if (next) selectOffering(next, activeOperation);
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
              .map((item) => ({
                value: offeringId(item),
                label: availableForMode(item)
                  ? item.modelName
                  : `${item.modelName} (${localize(mediaErrorLabels[item.unavailableReason ?? 'unsupported'])})`,
                disabled: !availableForMode(item),
              }))}
            setValue={(value) => {
              const next = modeOfferings.find((item) => offeringId(item) === value);
              if (next && availableForMode(next)) selectOffering(next, activeOperation);
            }}
          />
        </div>
        {offering.api === 'openrouter.images' && (offering.routes?.length || staleRoute) && (
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-route`}>{localize('com_media_provider_route')}</Label>
            <ControlCombobox
              showCarat
              selectId={`${id}-route`}
              ariaLabel={localize('com_media_provider_route')}
              ariaInvalid={staleRoute}
              ariaDescribedBy={staleRoute ? `${id}-stale-route` : undefined}
              variant="field"
              isCollapsed={false}
              portal={portal}
              selectedValue={providerTag ?? ''}
              displayValue={selectedRoute?.providerName ?? providerTag}
              items={(offering.routes ?? []).map((route) => ({
                value: route.providerTag,
                label: route.providerName,
                disabled: !route.capabilities.some((cap) => cap.operation === activeOperation),
              }))}
              setValue={(value) => {
                const route = offering.routes?.find((item) => item.providerTag === value);
                const cap = route?.capabilities.find((item) => item.operation === activeOperation);
                if (cap)
                  change({
                    providerTag: value,
                    providerOptionsText: undefined,
                    parameters: {
                      count: cap.controls.count?.default ?? cap.controls.count?.min ?? 1,
                    },
                  });
              }}
            />
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-border-light pt-4">
        {numeric('count', controls.count)}
        {controls.quality?.required && enumeration('quality', controls.quality)}
        {enumeration('aspectRatio', controls.aspectRatio)}
        {capability.operation === 'video.generate' ? (
          <>
            {numeric('durationSeconds', capability.controls.durationSeconds)}
            {enumeration('resolution', capability.controls.resolution)}
            {enumeration('size', capability.controls.size)}
            {numeric('upscaleFactor', capability.controls.upscaleFactor)}
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
          {numeric('outputCompression', controls.outputCompression)}
          {numeric('strength', controls.strength)}
          {numeric('guidance', controls.guidance)}
          {numeric('creativity', controls.creativity)}
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
              {!capability.controls.quality?.required &&
                enumeration('quality', capability.controls.quality)}
              {enumeration('format', capability.controls.format)}
              {enumeration('background', capability.controls.background)}
            </>
          )}
          {controls.negativePrompt && (
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor={`${id}-negative-prompt`}>
                {localize('com_media_negative_prompt')}
              </Label>
              <Textarea
                id={`${id}-negative-prompt`}
                value={draft.parameters.negativePrompt ?? ''}
                maxLength={catalog.limits.maxPromptChars}
                onChange={(event) => param('negativePrompt', event.target.value)}
                rows={2}
              />
            </div>
          )}
          {(controls.providerOptions?.length || providerOptionsText) && (
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor={`${id}-provider-options`}>
                {localize('com_media_provider_options')}
              </Label>
              <p
                id={`${id}-provider-options-hint`}
                className="text-xs leading-5 text-text-secondary"
              >
                {localize('com_media_provider_options_hint', {
                  names: controls.providerOptions?.join(', ') ?? '',
                })}
              </p>
              <Textarea
                id={`${id}-provider-options`}
                value={providerOptionsText}
                onChange={(event) => change({ providerOptionsText: event.target.value })}
                rows={4}
                spellCheck={false}
                aria-invalid={options.invalid || undefined}
                aria-describedby={`${id}-provider-options-hint${options.invalid ? ` ${id}-provider-options-error` : ''}`}
              />
            </div>
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
            const playable = asset?.type.startsWith('audio/') || asset?.type.startsWith('video/');
            return (
              <li
                key={`${input.file_id}:${index}`}
                className={`flex w-full items-center gap-2 rounded-xl border border-border-light p-2 sm:w-72 ${playable ? 'flex-wrap' : ''}`}
              >
                {asset && (
                  <span
                    className={`${playable ? 'w-full' : 'w-14'} shrink-0 overflow-hidden rounded-lg`}
                  >
                    <MediaPreview asset={asset} compact interactive={!!playable} />
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
                      items={capability.inputs.roles
                        .filter((role) => {
                          if (asset?.type.startsWith('audio/')) return role === 'audio';
                          if (asset?.type.startsWith('video/')) return role === 'video';
                          return role !== 'audio' && role !== 'video';
                        })
                        .map((role) => ({
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
      {draft.inputs.some(
        (input) => hostedRoles.some((role) => role === input.role) && !input.sourceURL,
      ) && (
        <p role="status" className="text-xs text-text-secondary">
          {localize('com_media_reference_needs_url')}
        </p>
      )}
      {!!capability.inputs.requiredRoles?.length && !inputsValid && (
        <p className="text-xs text-text-secondary">
          {localize('com_media_required_inputs', {
            roles: capability.inputs.requiredRoles
              .map((role) => localize(mediaInputRoleLabels[role]))
              .join(', '),
          })}
        </p>
      )}
      {avatarVoiceMissing && (
        <p role="status" className="text-xs text-text-secondary">
          {localize('com_media_avatar_voice_required')}
        </p>
      )}
      {staleRoute && (
        <Alert variant="warning" id={`${id}-stale-route`}>
          {localize('com_media_stale_provider_route')}
        </Alert>
      )}
      {options.invalid && (
        <Alert variant="warning" id={`${id}-provider-options-error`}>
          {localize('com_media_provider_options_invalid')}
        </Alert>
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
      {hostedRoles.length > 0 && (
        <div className="space-y-2 rounded-xl border border-border-light p-3">
          <Label htmlFor={`${id}-reference-url`}>{localize('com_media_reference_url')}</Label>
          <p id={`${id}-reference-url-hint`} className="text-xs text-text-secondary">
            {localize('com_media_reference_url_hint')}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {hostedRoles.length > 1 && (
              <ControlCombobox
                showCarat
                ariaLabel={localize('com_media_reference_url_role')}
                variant="field"
                isCollapsed={false}
                portal={portal}
                selectedValue={referenceURLRole}
                displayValue={
                  referenceURLRole ? localize(mediaInputRoleLabels[referenceURLRole]) : undefined
                }
                items={hostedRoles.map((role) => ({
                  value: role,
                  label: localize(mediaInputRoleLabels[role]),
                }))}
                setValue={(value) => {
                  if (value === 'video' || value === 'audio') change({ referenceURLRole: value });
                }}
              />
            )}
            <Input
              id={`${id}-reference-url`}
              type="url"
              className="min-w-0 flex-1"
              value={draft.referenceURL ?? ''}
              disabled={uploading || !host.canCreate}
              aria-invalid={(!!draft.referenceURL?.trim() && !referenceURL.success) || undefined}
              aria-describedby={`${id}-reference-url-hint`}
              onChange={(event) => change({ referenceURL: event.target.value })}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={
                uploading ||
                !host.canCreate ||
                !referenceURL.success ||
                draft.inputs.length >= uploadLimit
              }
              onClick={() => void uploadURL()}
            >
              <Link className="mr-1.5 size-4" aria-hidden="true" />
              {localize('com_media_add_reference_url')}
            </Button>
          </div>
          {uploading && (
            <p role="status" className="text-xs text-text-secondary">
              {localize('com_media_reference_loading')}
            </p>
          )}
        </div>
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
            !staleRoute &&
            !options.invalid &&
            !avatarVoiceMissing &&
            inputsValid &&
            invalidSettings.length === 0 &&
            draft.prompt.trim().length > 0 &&
            draft.prompt.length <= catalog.limits.maxPromptChars
          }
          submitLabel={localize('com_media_queue')}
          ariaLabel={localize('com_media_prompt')}
          placeholder={localize(placeholders[activeOperation])}
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
