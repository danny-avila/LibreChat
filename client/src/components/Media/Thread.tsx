import { useRef, useState } from 'react';
import { v4 } from 'uuid';
import { useSetAtom, useAtomValue } from 'jotai';
import { Clock3, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
  dataService,
  QueryKeys,
  mediaJobPageSchema,
  mediaOutputPageSchema,
  mediaTurnPageSchema,
} from 'librechat-data-provider';
import {
  Button,
  Alert,
  Spinner,
  Input,
  Label,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
} from '@librechat/client';
import type {
  MediaAsset,
  MediaCatalog,
  MediaJob,
  MediaOutput,
  MediaThreadDetail,
  MediaTurn,
} from 'librechat-data-provider';
import type { PendingMedia } from './state';
import { mediaErrorLabels, mediaJobPhaseLabels, mediaOutputStateLabels } from './labels';
import { mediaDraftFamily, mediaPendingFamily } from './state';
import { invalidateMedia } from '~/data-provider/Media';
import { mediaErrorCode } from './commands';
import { MediaAssetView } from './Asset';
import { MediaStatus } from './Status';
import { useLocalize } from '~/hooks';
import { useMediaHost } from './host';

function Outputs({
  outputs,
  refine,
  cover,
}: {
  outputs: MediaOutput[];
  refine?: (asset: MediaAsset) => void;
  cover: (asset: MediaAsset) => void;
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
}: {
  job: MediaJob;
  send: (command: PendingMedia) => Promise<void>;
  refine?: (asset: MediaAsset) => void;
  cover: (asset: MediaAsset) => void;
  catalog?: MediaCatalog;
  edit: () => void;
}) {
  const host = useMediaHost();
  const pending = useAtomValue(mediaPendingFamily(host.scope));
  const retryPending = pending.some(
    (command) => command.kind === 'retry' && command.jobId === job.jobId,
  );
  const localize = useLocalize();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [expanded, setExpanded] = useState(false);
  const more = useInfiniteQuery(
    [QueryKeys.mediaJobOutputs, host.scope, job.jobId, job.outputsNextCursor],
    async ({ pageParam, signal }) => {
      const page = mediaOutputPageSchema.parse(
        await dataService.listMediaJobOutputs(
          job.jobId,
          { cursor: pageParam ?? job.outputsNextCursor },
          signal,
        ),
      );
      if (!host.isCurrentSession()) throw new Error('Session ended');
      return page;
    },
    {
      enabled: expanded && !!job.outputsNextCursor,
      getNextPageParam: (page) => page.nextCursor,
      retry: false,
      refetchInterval: host.catchUpIntervalMs,
      refetchIntervalInBackground: false,
    },
  );
  const outputs = new Map(job.outputs.map((output) => [output.outputId, output]));
  more.data?.pages.forEach((page) =>
    page.items.forEach((output) => outputs.set(output.outputId, output)),
  );
  const offering = catalog?.offerings.find(
    (item) =>
      item.connectionId === job.selection.connectionId && item.modelId === job.selection.modelId,
  );
  const active = !['succeeded', 'failed', 'cancelled', 'requires_attention'].includes(job.phase);
  return (
    <section
      className="space-y-4 rounded-2xl border border-border-light bg-surface-primary p-4 sm:p-5"
      aria-label={localize('com_media_job')}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-sm font-semibold">
            {offering?.modelName ?? job.selection.modelId}
          </h3>
          <p className="mt-1 text-xs text-text-secondary">
            {offering?.connectionName ?? job.selection.connectionId}
          </p>
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
      {active && outputs.size === 0 && (
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
      <Outputs outputs={[...outputs.values()]} refine={refine} cover={cover} />
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
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(undefined);
              try {
                await dataService.cancelMediaJob(job.jobId);
                if (host.isCurrentSession()) await invalidateMedia(client, host.scope);
              } catch (failure) {
                if (host.isCurrentSession())
                  setError(localize(mediaErrorLabels[mediaErrorCode(failure)]));
              } finally {
                if (host.isCurrentSession()) setBusy(false);
              }
            }}
          >
            {localize('com_media_cancel_job')}
          </Button>
        )}
        {job.allowedActions.retry && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy || retryPending || !host.canCreate}
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
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
function Turn({
  turn,
  send,
  cover,
  catalog,
  onCompose,
}: {
  turn: MediaTurn;
  send: (command: PendingMedia) => Promise<void>;
  cover: (asset: MediaAsset) => void;
  catalog?: MediaCatalog;
  onCompose?: () => void;
}) {
  const host = useMediaHost();
  const localize = useLocalize();
  const [expanded, setExpanded] = useState(false);
  const setDraft = useSetAtom(mediaDraftFamily(`${host.scope}:${turn.threadId}`));
  const more = useInfiniteQuery(
    [QueryKeys.mediaTurnJobs, host.scope, turn.threadId, turn.turnId, turn.jobsNextCursor],
    async ({ pageParam, signal }) => {
      const page = mediaJobPageSchema.parse(
        await dataService.listMediaTurnJobs(
          turn.threadId,
          turn.turnId,
          { cursor: pageParam ?? turn.jobsNextCursor },
          signal,
        ),
      );
      if (!host.isCurrentSession()) throw new Error('Session ended');
      return page;
    },
    {
      enabled: expanded && !!turn.jobsNextCursor,
      getNextPageParam: (page) => page.nextCursor,
      retry: false,
      refetchInterval: host.pollIntervalMs,
      refetchIntervalInBackground: false,
    },
  );
  const jobs = new Map(turn.jobs.map((job) => [job.jobId, job]));
  more.data?.pages.forEach((page) =>
    page.items.forEach((job) => {
      if ((jobs.get(job.jobId)?.version ?? 0) <= job.version) jobs.set(job.jobId, job);
    }),
  );
  const refine = (asset: MediaAsset) => {
    setDraft((previous) => ({
      ...previous,
      revision: previous.revision + 1,
      parentTurnId: turn.turnId,
      offering: turn.selection
        ? JSON.stringify([turn.selection.connectionId, turn.selection.modelId])
        : previous.offering,
      parameters: turn.selection ? { count: 1 } : previous.parameters,
      operation: asset.type.startsWith('image/') ? 'image.edit' : 'video.generate',
      inputs: [
        { file_id: asset.file_id, role: asset.type.startsWith('image/') ? 'reference' : 'video' },
      ],
      assets: [asset],
    }));
    onCompose?.();
  };
  const edit = () => {
    setDraft((previous) => ({
      ...previous,
      revision: previous.revision + 1,
      prompt: turn.prompt,
      parentTurnId: turn.parentTurnId,
      offering: turn.selection
        ? JSON.stringify([turn.selection.connectionId, turn.selection.modelId])
        : previous.offering,
      operation: turn.operation ?? previous.operation,
      parameters: { count: 1 },
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
    <article className="space-y-4">
      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-text-primary">
        {turn.prompt || localize('com_media_imported')}
      </p>
      <time
        className="flex items-center gap-1.5 text-xs text-text-secondary"
        dateTime={turn.createdAt}
      >
        <Clock3 className="size-3.5" aria-hidden="true" />
        {new Date(turn.createdAt).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })}
      </time>
      {turn.assets.map((asset) => (
        <MediaAssetView
          key={asset.file_id}
          asset={asset}
          refine={canRefine ? () => refine(asset) : undefined}
          cover={() => cover(asset)}
        />
      ))}
      {[...jobs.values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((job) => (
          <Job
            key={job.jobId}
            job={job}
            catalog={catalog}
            send={send}
            refine={canRefine ? refine : undefined}
            cover={cover}
            edit={edit}
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
}: {
  detail: MediaThreadDetail;
  send: (command: PendingMedia) => Promise<void>;
  onDeleted: () => void;
  catalog?: MediaCatalog;
  onCompose?: () => void;
}) {
  const host = useMediaHost();
  const localize = useLocalize();
  const client = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const renameTrigger = useRef<HTMLButtonElement>(null);
  const deleteTrigger = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(detail.thread.title);
  const threadId = detail.thread.threadId;
  const more = useInfiniteQuery(
    [QueryKeys.mediaTurns, host.scope, threadId, detail.turns.nextCursor],
    async ({ pageParam, signal }) => {
      const page = mediaTurnPageSchema.parse(
        await dataService.listMediaTurns(
          threadId,
          { cursor: pageParam ?? detail.turns.nextCursor },
          signal,
        ),
      );
      if (!host.isCurrentSession()) throw new Error('Session ended');
      return page;
    },
    {
      enabled: expanded && !!detail.turns.nextCursor,
      getNextPageParam: (page) => page.nextCursor,
      retry: false,
      refetchInterval: detail.thread.pendingJobCount ? host.pollIntervalMs : host.catchUpIntervalMs,
      refetchIntervalInBackground: false,
    },
  );
  const turns = new Map(detail.turns.items.map((turn) => [turn.turnId, turn]));
  more.data?.pages.forEach((page) =>
    page.items.forEach((turn) => {
      if ((turns.get(turn.turnId)?.version ?? 0) <= turn.version) turns.set(turn.turnId, turn);
    }),
  );
  const update = async (change: { title?: string; coverFileId?: string }) => {
    setBusy(true);
    setError(undefined);
    try {
      await dataService.updateMediaThread(threadId, {
        expectedVersion: detail.thread.version,
        ...change,
      });
      if (host.isCurrentSession()) await invalidateMedia(client, host.scope);
      return true;
    } catch (failure) {
      if (host.isCurrentSession()) setError(localize(mediaErrorLabels[mediaErrorCode(failure)]));
      return false;
    } finally {
      if (host.isCurrentSession()) setBusy(false);
    }
  };
  return (
    <section className="space-y-6" aria-label={localize('com_media_history')}>
      <div className="flex items-start justify-between gap-3 border-b border-border-light pb-4">
        <div className="min-w-0">
          <h2 className="line-clamp-2 break-words text-lg font-semibold">{detail.thread.title}</h2>
          <p className="mt-1 text-xs text-text-secondary">
            {localize('com_media_revision_count', { count: detail.thread.turnCount })}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={localize('com_media_rename')}
            ref={renameTrigger}
            title={localize('com_media_rename')}
            disabled={busy}
            onClick={() => {
              setTitle(detail.thread.title);
              setError(undefined);
              setRenameOpen(true);
            }}
          >
            <Pencil className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={localize('com_ui_delete')}
            ref={deleteTrigger}
            title={localize('com_ui_delete')}
            disabled={busy}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {[...turns.values()]
        .sort(
          (a, b) => (b.sequence ?? 0) - (a.sequence ?? 0) || b.createdAt.localeCompare(a.createdAt),
        )
        .map((turn) => (
          <Turn
            key={turn.turnId}
            turn={turn}
            send={send}
            catalog={catalog}
            onCompose={onCompose}
            cover={(asset) => void update({ coverFileId: asset.file_id })}
          />
        ))}
      <OGDialog open={renameOpen} onOpenChange={setRenameOpen} triggerRef={renameTrigger}>
        <OGDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            renameTrigger.current?.focus();
          }}
        >
          <OGDialogTitle>{localize('com_media_rename')}</OGDialogTitle>
          <OGDialogDescription>{localize('com_media_rename_description')}</OGDialogDescription>
          <Label htmlFor="media-thread-title">{localize('com_media_title')}</Label>
          <Input
            id="media-thread-title"
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
      {detail.turns.nextCursor && (
        <Button
          variant="outline"
          disabled={more.isFetching || (expanded && !more.hasNextPage && !!more.data)}
          onClick={() => {
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
      <OGDialog open={deleteOpen} onOpenChange={setDeleteOpen} triggerRef={deleteTrigger}>
        <OGDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            deleteTrigger.current?.focus();
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
                setBusy(true);
                try {
                  await dataService.deleteMediaThread(threadId);
                  if (host.isCurrentSession()) {
                    await invalidateMedia(client, host.scope);
                    onDeleted();
                  }
                } catch (failure) {
                  if (host.isCurrentSession())
                    setError(localize(mediaErrorLabels[mediaErrorCode(failure)]));
                } finally {
                  if (host.isCurrentSession()) {
                    setBusy(false);
                    setDeleteOpen(false);
                  }
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
