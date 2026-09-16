import { useState } from 'react';
import { v4 } from 'uuid';
import { useSetAtom, useAtomValue } from 'jotai';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Input,
  Label,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
} from '@librechat/client';
import {
  dataService,
  QueryKeys,
  mediaJobPageSchema,
  mediaOutputPageSchema,
  mediaTurnPageSchema,
} from 'librechat-data-provider';
import type {
  MediaAsset,
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
import { useLocalize } from '~/hooks';
import { useMediaHost } from './host';

function Outputs({
  outputs,
  refine,
  cover,
}: {
  outputs: MediaOutput[];
  refine: (asset: MediaAsset) => void;
  cover: (asset: MediaAsset) => void;
}) {
  const localize = useLocalize();
  return (
    <div className="space-y-4">
      {[...outputs]
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((output) => {
          if (output.kind === 'text')
            return (
              <p key={output.outputId} className="whitespace-pre-wrap">
                {output.text}
              </p>
            );
          if (output.asset && output.state === 'ready')
            return (
              <MediaAssetView
                key={output.outputId}
                asset={output.asset}
                refine={() => refine(output.asset!)}
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
}: {
  job: MediaJob;
  send: (command: PendingMedia) => Promise<void>;
  refine: (asset: MediaAsset) => void;
  cover: (asset: MediaAsset) => void;
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
  return (
    <section
      className="space-y-3 rounded-lg border border-border-light p-3"
      aria-label={localize('com_media_job')}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status">{localize(mediaJobPhaseLabels[job.phase])}</p>
        <span className="text-sm text-text-secondary">{job.selection.modelId}</span>
      </div>
      {job.retryOfJobId && (
        <p className="text-sm text-text-secondary">{localize('com_media_retry_attempt')}</p>
      )}
      {job.error && <p role="alert">{localize(mediaErrorLabels[job.error.code])}</p>}
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
      <div className="flex gap-2">
        {job.allowedActions.cancel && (
          <Button
            variant="outline"
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
            {localize('com_media_retry_job')}
          </Button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
function Turn({
  turn,
  send,
  cover,
}: {
  turn: MediaTurn;
  send: (command: PendingMedia) => Promise<void>;
  cover: (asset: MediaAsset) => void;
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
    document.querySelector<HTMLTextAreaElement>('[data-media-workspace] textarea')?.focus();
  };
  return (
    <article className="space-y-3 border-t border-border-light pt-4">
      <p className="whitespace-pre-wrap font-medium">
        {turn.prompt || localize('com_media_imported')}
      </p>
      <time className="text-sm text-text-secondary" dateTime={turn.createdAt}>
        {new Date(turn.createdAt).toLocaleString()}
      </time>
      {turn.assets.map((asset) => (
        <MediaAssetView
          key={asset.file_id}
          asset={asset}
          refine={() => refine(asset)}
          cover={() => cover(asset)}
        />
      ))}
      {[...jobs.values()].map((job) => (
        <Job key={job.jobId} job={job} send={send} refine={refine} cover={cover} />
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
}: {
  detail: MediaThreadDetail;
  send: (command: PendingMedia) => Promise<void>;
  onDeleted: () => void;
}) {
  const host = useMediaHost();
  const localize = useLocalize();
  const client = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
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
    } catch (failure) {
      if (host.isCurrentSession()) setError(localize(mediaErrorLabels[mediaErrorCode(failure)]));
    } finally {
      if (host.isCurrentSession()) setBusy(false);
    }
  };
  return (
    <section className="space-y-4" aria-label={localize('com_media_history')}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <Label htmlFor="media-thread-title">{localize('com_media_title')}</Label>
          <Input
            id="media-thread-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <Button
          variant="outline"
          disabled={busy || !title.trim()}
          onClick={() => void update({ title })}
        >
          {localize('com_ui_save')}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => setDeleteOpen(true)}>
          {localize('com_ui_delete')}
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
      {[...turns.values()].map((turn) => (
        <Turn
          key={turn.turnId}
          turn={turn}
          send={send}
          cover={(asset) => void update({ coverFileId: asset.file_id })}
        />
      ))}
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
      <OGDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <OGDialogContent>
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
