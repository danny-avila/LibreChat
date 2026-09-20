import { v4 } from 'uuid';
import { HatGlasses, X } from 'lucide-react';
import { Alert, Button, Composer, Spinner } from '@librechat/client';
import type { Ref } from 'react';
import type { MediaFormActions } from './useMediaFormActions';
import type { MediaDraftForm } from './useMediaDraftForm';
import type { MediaSend } from './state';
import { mediaControlLabels, mediaInputRoleLabels } from './labels';
import { MediaReferenceUpload } from './Reference';
import { getMediaSelection } from './selection';
import { MediaReferences } from './References';
export function MediaComposer({
  form,
  send,
  busy,
  composerRef,
  actions,
}: {
  form: MediaDraftForm;
  send: MediaSend;
  busy: boolean;
  composerRef?: Ref<HTMLTextAreaElement>;
  actions: MediaFormActions;
}) {
  const {
    id,
    catalog,
    threadId,
    host,
    localize,
    draftKey,
    offerings,
    staleRoute,
    draft,
    automaticImage,
    referenceOwner,
    hostedRoles,
    referenceURLRole,
    referenceURL,
    unsupportedContext,
    change,
    invalidSettings,
    optionsInvalid,
    maxPromptChars,
    promptInvalid,
  } = form;
  const selection = getMediaSelection(form);
  const { error, uploads, uploading, submit, uploadFile, uploadFiles, uploadURL } = actions;
  if (!selection) {
    const message = localize(
      offerings.length > 0 ? 'com_media_selection_unavailable' : 'com_media_no_models',
    );
    const hasDraft = !!draft.offering || !!draft.prompt || draft.inputs.length > 0;
    return (
      <section
        className="space-y-3"
        aria-label={localize('com_media_create')}
        data-testid="media-composer"
      >
        <p role="status" className="text-sm text-text-secondary">
          {message}
        </p>
        <MediaReferences form={form} />
        {hasDraft && (
          <Composer
            ref={composerRef}
            value={draft.prompt}
            onChange={(prompt) => change({ prompt })}
            onSubmit={() => {}}
            canSubmit={false}
            submitLabel={localize('com_media_queue')}
            ariaLabel={localize('com_media_prompt')}
            minRows={1}
            maxRows={6}
            maxLength={maxPromptChars}
            submitOnEnter={host.enterToSend}
            resolveKeyVerdict={host.resolveKeyVerdict}
          />
        )}
      </section>
    );
  }
  const {
    offering,
    capability,
    activeOperation,
    inputsValid,
    compareInvalid,
    uploadLimit,
    localAccept,
  } = selection;
  const placeholders = {
    'image.generate': 'com_media_image_placeholder',
    'image.edit': 'com_media_edit_placeholder',
    'video.generate': 'com_media_video_placeholder',
  } as const;
  const referenceActions = (
    <div className="flex flex-wrap items-center gap-2">
      <MediaReferenceUpload
        id={id}
        ownerKey={referenceOwner}
        hostedRoles={hostedRoles}
        localAccept={localAccept}
        disabled={!host.canCreate || draft.inputs.length >= uploadLimit}
        uploading={uploading}
        url={draft.referenceURL ?? ''}
        role={referenceURLRole}
        valid={referenceURL.success}
        error={error}
        onURLChange={(referenceURL) => change({ referenceURL })}
        onRoleChange={(referenceURLRole) => change({ referenceURLRole })}
        uploadURL={uploadURL}
        uploadFile={uploadFile}
        cancel={uploads.cancel}
      />
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
                temporary: !threadId && draft.temporary ? true : undefined,
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
  return (
    <section
      className="space-y-3"
      aria-label={localize('com_media_create')}
      data-testid="media-composer"
    >
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
      <MediaReferences form={form} />
      {promptInvalid && (
        <p role="status" className="text-sm text-text-secondary">
          {localize('com_media_prompt_limit', { max: maxPromptChars })}
        </p>
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
      {staleRoute && (
        <Alert variant="warning" id={`${id}-stale-route`}>
          {localize('com_media_stale_provider_route')}
        </Alert>
      )}
      {optionsInvalid && (
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
      {!threadId && draft.temporary && (
        <p role="status" className="flex items-center gap-1.5 text-xs text-text-secondary">
          <HatGlasses className="size-3.5 shrink-0" aria-hidden="true" />
          {localize('com_media_temporary_hint')}
        </p>
      )}
      <div className="space-y-2">
        <Composer
          ref={composerRef}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files);
            if (!files.length) return;
            event.preventDefault();
            void uploadFiles(files);
          }}
          value={draft.prompt}
          onChange={(prompt) => change({ prompt })}
          onSubmit={() => void submit()}
          canSubmit={
            host.canCreate &&
            !busy &&
            !uploading &&
            !unsupportedContext &&
            !staleRoute &&
            !optionsInvalid &&
            !promptInvalid &&
            !compareInvalid &&
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
          maxLength={maxPromptChars}
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
}
