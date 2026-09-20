import { useId, useRef, useState } from 'react';
import { v4 } from 'uuid';
import * as Ariakit from '@ariakit/react';
import { useTranslation } from 'react-i18next';
import { useSetAtom, useAtomValue } from 'jotai';
import { Clock3, Ellipsis, HatGlasses, Images, Pen, Pencil, RotateCcw, Trash } from 'lucide-react';
import {
  Button,
  Alert,
  Chip,
  Spinner,
  Input,
  Label,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
  DropdownPopup,
  TooltipAnchor,
} from '@librechat/client';
import type {
  MediaAsset,
  MediaCatalog,
  MediaJob,
  MediaOutput,
  MediaThreadDetail,
  MediaTurn,
} from 'librechat-data-provider';
import type { MenuItemProps } from '~/common';
import type { MediaSend } from './state';
import {
  useMediaJobMutations,
  useMediaThreadMutations,
  useMediaTurns,
  useMediaTurnJobs,
  useMediaJobOutputs,
} from '~/data-provider';
import { mediaErrorLabels, mediaJobPhaseLabels, mediaOutputStateLabels } from './labels';
import { mediaDraftFamily, mediaPendingFamily } from './state';
import { MediaImagePending } from './ImagePending';
import { getMessageTimestamp } from '~/utils';
import { mediaErrorCode } from './commands';
import { compareTurns } from './context';
import { MediaAssetView } from './Asset';
import { MediaStatus } from './Status';
import { useLocalize } from '~/hooks';
import { useMediaHost } from './host';

function Outputs({
  outputs,
  refine,
  cover,
  imagePendingSince,
}: {
  outputs: MediaOutput[];
  refine?: (asset: MediaAsset) => void;
  cover: (asset: MediaAsset) => void;
  imagePendingSince?: string;
}) {
  const localize = useLocalize();
  return (
    <div
      className={
        outputs.filter((output) => output.kind !== 'text').length > 1
          ? 'grid grid-cols-1 gap-5 sm:grid-cols-2'
          : 'space-y-4'
      }
    >
      {[...outputs]
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((output) => {
          if (output.kind === 'text')
            return (
              <p
                key={output.outputId}
                className="col-span-full whitespace-pre-wrap text-sm leading-6 text-text-secondary"
              >
                {output.text}
              </p>
            );
          if (output.asset && output.state === 'ready')
            return (
              <MediaAssetView
                key={output.outputId}
                asset={output.asset}
                refine={refine ? () => refine(output.asset!) : undefined}
                cover={() => cover(output.asset!)}
                imagePendingSince={output.kind === 'image' ? imagePendingSince : undefined}
              />
            );
          return (
            <p key={output.outputId} role="status">
              {localize(mediaOutputStateLabels[output.state])}
            </p>
          );
        })}
    </div>
  );
}
function Job({
  job,
  send,
  refine,
  cover,
  catalog,
  edit,
  imageDimensions,
}: {
  job: MediaJob;
  send: MediaSend;
  refine?: (asset: MediaAsset) => void;
  cover: (asset: MediaAsset) => void;
  catalog?: MediaCatalog;
  edit: () => void;
  imageDimensions?: Pick<MediaAsset, 'width' | 'height'>;
}) {
  const host = useMediaHost();
  const pending = useAtomValue(mediaPendingFamily(host.scope));
  const retryPending = pending.some(
    (command) => command.kind === 'retry' && command.jobId === job.jobId,
  );
  const localize = useLocalize();
  const { cancel } = useMediaJobMutations(host);
  const retryUnavailableId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [expanded, setExpanded] = useState(false);
  const more = useMediaJobOutputs(host, job, expanded);
  const outputs = new Map(job.outputs.map((output) => [output.outputId, output]));
  more.data?.pages.forEach((page) =>
    page.items.forEach((output) => outputs.set(output.outputId, output)),
  );
  const offering = catalog?.offerings.find(
    (item) =>
      item.connectionId === job.selection.connectionId && item.modelId === job.selection.modelId,
  );
  const missingConnection =
    !!catalog &&
    !(catalog.integrations ?? catalog.offerings).some(
      (item) => item.connectionId === job.selection.connectionId,
    );
  const active = !['succeeded', 'failed', 'cancelled', 'requires_attention'].includes(job.phase);
  // Animate the completion of work observed in progress, while restored originals paint directly.
  const [animateResult] = useState(active);
  const imageJob = job.operation === 'image.generate' || job.operation === 'image.edit';
  const outputImage = [...outputs.values()].find(
    (output) => output.kind === 'image' && output.asset?.width && output.asset?.height,
  );
  return (
    <section className="space-y-4" aria-label={localize('com_media_job')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Images className="size-5 shrink-0 text-text-secondary" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="break-words text-sm font-semibold">
              {offering?.modelName ?? job.selection.modelId}
            </h3>
            <p className="mt-1 text-xs text-text-secondary">
              {offering?.connectionName ?? job.selection.connectionId}
              {job.selection.providerTag &&
                ` · ${offering?.routes?.find((route) => route.providerTag === job.selection.providerTag)?.providerName ?? job.selection.providerTag}`}
            </p>
          </div>
        </div>
        <span role="status">
          <MediaStatus phase={job.phase} />
        </span>
      </div>
      {job.retryOfJobId && (
        <p className="text-sm text-text-secondary">{localize('com_media_retry_attempt')}</p>
      )}
      {job.error && (
        <Alert variant="error">
          <p>{localize(mediaErrorLabels[job.error.code])}</p>
        </Alert>
      )}
      {active && imageJob && (
        <MediaImagePending
          createdAt={job.createdAt}
          dimensions={outputImage?.kind === 'image' ? outputImage.asset : imageDimensions}
          label={localize(mediaJobPhaseLabels[job.phase])}
          hint={localize('com_media_generation_hint')}
        />
      )}
      {active && !imageJob && outputs.size === 0 && (
        <div
          role="status"
          className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl bg-surface-secondary p-6 text-center"
        >
          <Spinner className="size-6" />
          <p className="font-medium">{localize(mediaJobPhaseLabels[job.phase])}</p>
          <p className="max-w-sm text-sm leading-6 text-text-secondary">
            {localize('com_media_generation_hint')}
          </p>
        </div>
      )}
      {job.phase === 'cancelled' && outputs.size === 0 && (
        <p className="text-sm text-text-secondary">{localize('com_media_cancelled_hint')}</p>
      )}
      {job.cancellation && job.phase !== 'cancelled' && (
        <p role="status" className="text-sm text-text-secondary">
          {localize(
            job.cancellation === 'confirmed'
              ? 'com_media_cancellation_confirmed'
              : 'com_media_cancellation_requested',
          )}
        </p>
      )}
      <Outputs
        outputs={[...outputs.values()]}
        refine={refine}
        cover={cover}
        imagePendingSince={imageJob && animateResult ? job.createdAt : undefined}
      />
      {job.outputsNextCursor && (
        <Button
          variant="ghost"
          disabled={more.isFetching || (expanded && !more.hasNextPage && !!more.data)}
          onClick={() => {
            if (!expanded) setExpanded(true);
            else void more.fetchNextPage();
          }}
        >
          {localize('com_media_more_outputs')}
        </Button>
      )}
      {more.isError && (
        <Button variant="outline" onClick={() => void more.refetch()}>
          {localize('com_ui_retry')}
        </Button>
      )}
      <div className="flex flex-wrap gap-2">
        {job.allowedActions.cancel && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy || cancel.isLoading}
            onClick={async () => {
              setError(undefined);
              try {
                await cancel.mutateAsync(job.jobId);
              } catch (failure) {
                if (host.isCurrentSession())
                  setError(localize(mediaErrorLabels[mediaErrorCode(failure)]));
              }
            }}
          >
            {localize(
              job.phase === 'queued' ? 'com_media_cancel_job' : 'com_media_request_cancellation',
            )}
          </Button>
        )}
        {job.allowedActions.retry && (
          <Button
            variant="outline"
            size="sm"
            disabled={
              busy || cancel.isLoading || retryPending || !host.canCreate || missingConnection
            }
            aria-describedby={missingConnection ? retryUnavailableId : undefined}
            onClick={async () => {
              setBusy(true);
              await send({
                kind: 'retry',
                jobId: job.jobId,
                request: { clientRequestId: v4() },
                draftKey: `${host.scope}:${job.threadId}`,
                draftRevision: -1,
              });
              if (host.isCurrentSession()) setBusy(false);
            }}
          >
            <RotateCcw className="mr-1.5 size-4" aria-hidden="true" />
            {localize('com_media_retry_job')}
          </Button>
        )}
        <Button variant="ghost" size="sm" disabled={!host.canCreate} onClick={edit}>
          <Pencil className="mr-1.5 size-4" aria-hidden="true" />
          {localize('com_media_edit_request')}
        </Button>
      </div>
      {job.allowedActions.retry && missingConnection && (
        <p id={retryUnavailableId} className="text-sm text-text-secondary">
          {localize('com_media_selection_unavailable')}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
function TurnPrompt({ turn }: { turn: MediaTurn }) {
  const localize = useLocalize();
  const { i18n } = useTranslation();
  const when = getMessageTimestamp(turn.createdAt, i18n.language);
  return (
    <div className="flex justify-end" role="group" aria-label={localize('com_media_request')}>
      <div className="max-w-[90%] space-y-2 sm:max-w-[85%]">
        <p className="whitespace-pre-wrap break-words rounded-theme-surface rounded-br-theme-control bg-surface-tertiary px-theme-normal py-2.5 text-sm leading-6 text-text-primary">
          {turn.prompt || localize('com_media_imported')}
        </p>
        {when && (
          <time
            className="flex items-center justify-end gap-1.5 text-xs text-text-secondary"
            dateTime={when.iso}
            title={when.absolute}
          >
            <Clock3 className="size-3.5" aria-hidden="true" />
            {when.relative}
          </time>
        )}
      </div>
    </div>
  );
}
/** Turns submitted together for a comparison share a prompt and render side by side. */
function groupTurns(turns: MediaTurn[]): MediaTurn[][] {
  const blocks: MediaTurn[][] = [];
  for (const turn of [...turns].sort(compareTurns)) {
    const last = blocks[blocks.length - 1];
    if (turn.comparisonId && last?.[0].comparisonId === turn.comparisonId) last.push(turn);
    else blocks.push([turn]);
  }
  return blocks;
}
function Turn({
  turn,
  send,
  cover,
  catalog,
  onCompose,
  showPrompt = true,
}: {
  turn: MediaTurn;
  send: MediaSend;
  cover: (asset: MediaAsset) => void;
  catalog?: MediaCatalog;
  onCompose?: () => void;
  showPrompt?: boolean;
}) {
  const host = useMediaHost();
  const localize = useLocalize();
  const [expanded, setExpanded] = useState(false);
  const setDraft = useSetAtom(mediaDraftFamily(`${host.scope}:${turn.threadId}`));
  const more = useMediaTurnJobs(host, turn, expanded);
  const jobs = new Map(turn.jobs.map((job) => [job.jobId, job]));
  more.data?.pages.forEach((page) =>
    page.items.forEach((job) => {
      if ((jobs.get(job.jobId)?.version ?? 0) <= job.version) jobs.set(job.jobId, job);
    }),
  );
  const refine = (asset: MediaAsset) => {
    const mediaRole = asset.type.startsWith('audio/') ? 'audio' : 'video';
    setDraft((previous) => ({
      ...previous,
      revision: previous.revision + 1,
      autoEdit: false,
      parentTurnId: turn.turnId,
      offering: turn.selection
        ? JSON.stringify([turn.selection.connectionId, turn.selection.modelId])
        : previous.offering,
      providerTag: turn.selection?.providerTag,
      providerOptionsText: undefined,
      parameters: turn.selection ? { count: 1 } : previous.parameters,
      operation: asset.type.startsWith('image/') ? 'image.edit' : 'video.generate',
      inputs: [
        {
          file_id: asset.file_id,
          role: asset.type.startsWith('image/') ? 'reference' : mediaRole,
          sourceURL: turn.inputs.find((input) => input.file_id === asset.file_id)?.sourceURL,
        },
      ],
      assets: [asset],
    }));
    onCompose?.();
  };
  const edit = () => {
    setDraft((previous) => ({
      ...previous,
      revision: previous.revision + 1,
      autoEdit: false,
      prompt: turn.prompt,
      parentTurnId: turn.parentTurnId,
      offering: turn.selection
        ? JSON.stringify([turn.selection.connectionId, turn.selection.modelId])
        : previous.offering,
      providerTag: turn.selection?.providerTag,
      providerOptionsText: undefined,
      operation: turn.operation ?? previous.operation,
      parameters: turn.parameters ?? { count: 1 },
      inputs: turn.inputs,
      assets: turn.assets,
    }));
    onCompose?.();
  };
  const offering = catalog?.offerings.find(
    (item) =>
      item.connectionId === turn.selection?.connectionId && item.modelId === turn.selection.modelId,
  );
  const canRefine =
    !catalog ||
    offering?.capabilities.some(
      (capability) =>
        capability.operation === 'image.edit' ||
        (capability.operation === 'video.generate' && capability.inputs.roles.includes('video')),
    );
  return (
    <article className="space-y-6">
      {showPrompt && <TurnPrompt turn={turn} />}
      {turn.assets.map((asset) => (
        <MediaAssetView
          key={asset.file_id}
          asset={asset}
          refine={canRefine ? () => refine(asset) : undefined}
          cover={() => cover(asset)}
        />
      ))}
      {[...jobs.values()]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((job) => (
          <Job
            key={job.jobId}
            job={job}
            catalog={catalog}
            send={send}
            refine={canRefine ? refine : undefined}
            cover={cover}
            edit={edit}
            imageDimensions={turn.assets.find((asset) => asset.type.startsWith('image/'))}
          />
        ))}
      {turn.jobsNextCursor && (
        <Button
          variant="ghost"
          disabled={more.isFetching || (expanded && !more.hasNextPage && !!more.data)}
          onClick={() => {
            if (!expanded) setExpanded(true);
            else void more.fetchNextPage();
          }}
        >
          {localize('com_media_more_jobs')}
        </Button>
      )}
      {more.isError && (
        <Button variant="outline" onClick={() => void more.refetch()}>
          {localize('com_ui_retry')}
        </Button>
      )}
    </article>
  );
}
export function MediaThreadView({
  detail,
  send,
  onDeleted,
  catalog,
  onCompose,
  onLoadOlder,
}: {
  detail: MediaThreadDetail;
  send: MediaSend;
  onDeleted: () => void;
  catalog?: MediaCatalog;
  onCompose?: () => void;
  onLoadOlder?: () => void;
}) {
  const host = useMediaHost();
  const localize = useLocalize();
  const { i18n } = useTranslation();
  const { update: updateThread, remove: removeThread } = useMediaThreadMutations(host);
  const [expanded, setExpanded] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const titleId = useId();
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string>();
  const busy = updateThread.isLoading || removeThread.isLoading;
  const [title, setTitle] = useState(detail.thread.title);
  const threadId = detail.thread.threadId;
  const more = useMediaTurns(host, detail, expanded);
  const turns = new Map(detail.turns.items.map((turn) => [turn.turnId, turn]));
  more.data?.pages.forEach((page) =>
    page.items.forEach((turn) => {
      if ((turns.get(turn.turnId)?.version ?? 0) <= turn.version) turns.set(turn.turnId, turn);
    }),
  );
  const update = async (change: { title?: string; coverFileId?: string }) => {
    setError(undefined);
    try {
      await updateThread.mutateAsync({
        threadId,
        update: { expectedVersion: detail.thread.version, ...change },
      });
      return host.isCurrentSession();
    } catch (failure) {
      if (host.isCurrentSession()) setError(localize(mediaErrorLabels[mediaErrorCode(failure)]));
      return false;
    }
  };
  const expires = getMessageTimestamp(detail.thread.expiresAt, i18n.language);
  const menuItems: MenuItemProps[] = [
    {
      label: localize('com_media_rename'),
      icon: <Pen className="icon-sm mr-2 text-text-primary" aria-hidden="true" />,
      disabled: busy,
      onClick: () => {
        setTitle(detail.thread.title);
        setError(undefined);
        setRenameOpen(true);
      },
    },
    { separate: true },
    {
      label: localize('com_ui_delete'),
      icon: <Trash className="icon-sm mr-2 text-text-primary" aria-hidden="true" />,
      disabled: busy,
      onClick: () => setDeleteOpen(true),
    },
  ];
  return (
    <section className="space-y-8" aria-label={localize('com_media_history')}>
      <div className="flex items-start justify-between gap-3 border-b border-border-light pb-4">
        <div className="min-w-0">
          <h2 className="line-clamp-2 break-words text-lg font-semibold">{detail.thread.title}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            <span>{localize('com_media_revision_count', { count: detail.thread.turnCount })}</span>
            {(detail.thread.temporary ?? !!detail.thread.expiresAt) && expires && (
              <Chip
                role="status"
                title={expires.absolute}
                leading={<HatGlasses className="size-3.5 shrink-0" aria-hidden="true" />}
              >
                {localize('com_media_temporary_creation')} ·{' '}
                {localize('com_media_temporary_expires', { when: expires.relative })}
              </Chip>
            )}
          </p>
        </div>
        <DropdownPopup
          portal
          focusLoop
          unmountOnHide
          menuId={menuId}
          isOpen={menuOpen}
          setIsOpen={setMenuOpen}
          items={menuItems}
          trigger={
            <TooltipAnchor
              description={localize('com_media_thread_options')}
              render={
                <Ariakit.MenuButton
                  ref={menuTrigger}
                  id={`${menuId}-trigger`}
                  aria-label={localize('com_media_thread_options')}
                  aria-expanded={menuOpen}
                  render={<Button variant="ghost" size="icon-sm" className="shrink-0" />}
                >
                  <Ellipsis className="size-4" aria-hidden="true" />
                </Ariakit.MenuButton>
              }
            />
          }
        />
      </div>
      {error && <p role="alert">{error}</p>}
      {detail.turns.nextCursor && (
        <Button
          variant="outline"
          disabled={more.isFetching || (expanded && !more.hasNextPage && !!more.data)}
          onClick={() => {
            onLoadOlder?.();
            if (!expanded) setExpanded(true);
            else void more.fetchNextPage();
          }}
        >
          {localize('com_media_more_turns')}
        </Button>
      )}
      {more.isError && (
        <Button variant="outline" onClick={() => void more.refetch()}>
          {localize('com_ui_retry')}
        </Button>
      )}
      {groupTurns([...turns.values()]).map((block) =>
        block.length === 1 ? (
          <Turn
            key={block[0].turnId}
            turn={block[0]}
            send={send}
            catalog={catalog}
            onCompose={onCompose}
            cover={(asset) => void update({ coverFileId: asset.file_id })}
          />
        ) : (
          <section
            key={block[0].comparisonId}
            className="space-y-6"
            aria-label={localize('com_media_comparison')}
          >
            <TurnPrompt turn={block[0]} />
            <div className="grid gap-6 lg:grid-cols-2">
              {block.map((turn) => (
                <Turn
                  key={turn.turnId}
                  turn={turn}
                  send={send}
                  catalog={catalog}
                  onCompose={onCompose}
                  showPrompt={false}
                  cover={(asset) => void update({ coverFileId: asset.file_id })}
                />
              ))}
            </div>
          </section>
        ),
      )}
      <OGDialog open={renameOpen} onOpenChange={setRenameOpen} triggerRef={menuTrigger}>
        <OGDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            menuTrigger.current?.focus();
          }}
        >
          <OGDialogTitle>{localize('com_media_rename')}</OGDialogTitle>
          <OGDialogDescription>{localize('com_media_rename_description')}</OGDialogDescription>
          <Label htmlFor={titleId}>{localize('com_media_title')}</Label>
          <Input
            id={titleId}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={catalog?.limits.maxTitleChars}
          />
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>
              {localize('com_ui_cancel')}
            </Button>
            <Button
              disabled={busy || !title.trim()}
              onClick={async () => {
                if (await update({ title })) setRenameOpen(false);
              }}
            >
              {localize('com_ui_save')}
            </Button>
          </div>
        </OGDialogContent>
      </OGDialog>
      <OGDialog open={deleteOpen} onOpenChange={setDeleteOpen} triggerRef={menuTrigger}>
        <OGDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            menuTrigger.current?.focus();
          }}
        >
          <OGDialogTitle>{localize('com_media_delete_title')}</OGDialogTitle>
          <OGDialogDescription>{localize('com_media_delete_description')}</OGDialogDescription>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {localize('com_ui_cancel')}
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                try {
                  await removeThread.mutateAsync(threadId);
                  if (host.isCurrentSession()) onDeleted();
                } catch (failure) {
                  if (host.isCurrentSession())
                    setError(localize(mediaErrorLabels[mediaErrorCode(failure)]));
                } finally {
                  if (host.isCurrentSession()) setDeleteOpen(false);
                }
              }}
            >
              {localize('com_ui_delete')}
            </Button>
          </div>
        </OGDialogContent>
      </OGDialog>
    </section>
  );
}
