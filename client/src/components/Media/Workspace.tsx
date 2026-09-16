import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { Button, ControlCombobox, Spinner } from '@librechat/client';
import type { MediaThreadListRequest } from 'librechat-data-provider';
import type { MediaReceipt } from '~/data-provider/Media';
import {
  mergeMediaTiles,
  useMediaCatalog,
  useMediaThread,
  useMediaThreads,
} from '~/data-provider/Media';
import { mediaErrorLabels, mediaThreadFilterLabels } from './labels';
import { useMediaCommands } from './commands';
import { mediaPendingFamily } from './state';
import { MediaThreadView } from './Thread';
import { MediaPreview } from './Asset';
import { useLocalize } from '~/hooks';
import { useMediaHost } from './host';
import { MediaForm } from './Form';

export default function MediaWorkspace({ threadId }: { threadId?: string }) {
  const host = useMediaHost();
  const localize = useLocalize();
  const [filter, setFilter] = useState<MediaThreadListRequest['filter']>('all');
  const catalog = useMediaCatalog(host);
  const threads = useMediaThreads(host, filter);
  const pendingCommands = useAtomValue(mediaPendingFamily(host.scope));
  const detail = useMediaThread(host, threadId, pendingCommands.length > 0);
  const visible = threads.data?.pages.flatMap((page) => page.items) ?? [];
  const commands = useMediaCommands([
    ...visible.map((thread) => thread.threadId),
    ...(detail.data ? [detail.data.thread.threadId] : []),
  ]);
  const recoverable = commands.pending.flatMap((command, index) => {
    const receipt = commands.receipts[index]?.data;
    if (!receipt) return [];
    let title = localize('com_media_retry_attempt');
    if (command.kind === 'submission') title = command.request.prompt;
    else if (command.kind === 'import')
      title = command.request.title ?? localize('com_media_imported');
    return [
      {
        receipt,
        title,
      },
    ];
  });
  const tiles = mergeMediaTiles(visible, recoverable);
  const preparing = recoverable.some(
    ({ receipt }) => receipt.threadId === threadId && receipt.phase !== 'rejected',
  );
  const pendingTitle = (receipt?: MediaReceipt) =>
    receipt?.phase === 'preparing'
      ? localize('com_media_preparing')
      : localize('com_media_restoring');
  return (
    <div
      data-media-workspace
      className="mx-auto w-full max-w-6xl space-y-6 p-4 text-text-primary sm:p-6"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{localize('com_media_studio')}</h1>
        {threadId && (
          <Button variant="outline" onClick={() => host.openThread('')}>
            {localize('com_media_new_thread')}
          </Button>
        )}
      </header>
      {catalog.isLoading && (
        <div role="status" className="flex items-center gap-2">
          <Spinner />
          {localize('com_media_loading')}
        </div>
      )}
      {catalog.isError && (
        <div role="alert">
          <p>{localize('com_media_load_failed')}</p>
          <Button variant="outline" onClick={() => void catalog.refetch()}>
            {localize('com_ui_retry')}
          </Button>
        </div>
      )}
      {catalog.data && (
        <MediaForm
          key={threadId ?? 'new'}
          catalog={catalog.data}
          threadId={threadId}
          send={commands.send}
          busy={commands.sending.size > 0}
        />
      )}
      {commands.error && (
        <div role="alert">
          <p>{localize(mediaErrorLabels[commands.error])}</p>
          {commands.error === 'stale_catalog' && (
            <Button variant="outline" onClick={() => void catalog.refetch()}>
              {localize('com_media_refresh_models')}
            </Button>
          )}
        </div>
      )}
      {commands.pending.length > 0 && (
        <section className="space-y-2" aria-label={localize('com_media_recovery')}>
          {commands.pending.map((command, index) => {
            const response = commands.receipts[index];
            return (
              <div
                key={command.request.clientRequestId}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border-light p-3"
              >
                <p role="status">
                  {response.data?.phase === 'rejected'
                    ? localize(mediaErrorLabels[response.data.error.code])
                    : pendingTitle(response.data)}
                </p>
                {response.data && response.data.phase !== 'rejected' && (
                  <Button variant="ghost" onClick={() => host.openThread(response.data!.threadId)}>
                    {localize('com_media_open_thread')}
                  </Button>
                )}
                {!response.data && !commands.sending.has(command.request.clientRequestId) && (
                  <>
                    <p className="text-sm text-text-secondary">{localize('com_media_uncertain')}</p>
                    <Button
                      variant="outline"
                      disabled={!host.canCreate}
                      onClick={() => void commands.send(command)}
                    >
                      {localize('com_media_recover_request')}
                    </Button>
                  </>
                )}
                {response.data?.phase === 'rejected' && (
                  <Button
                    variant="ghost"
                    onClick={() => commands.dismiss(command.request.clientRequestId)}
                  >
                    {localize('com_ui_dismiss')}
                  </Button>
                )}
              </div>
            );
          })}
        </section>
      )}
      {threadId ? (
        <>
          {detail.isLoading && <p role="status">{localize('com_media_loading')}</p>}
          {detail.isError && (
            <div role={preparing ? 'status' : 'alert'}>
              <p>
                {preparing
                  ? localize('com_media_preparing')
                  : localize('com_media_thread_unavailable')}
              </p>
              <Button variant="outline" onClick={() => void detail.refetch()}>
                {localize('com_ui_retry')}
              </Button>
            </div>
          )}
          {detail.data && (
            <MediaThreadView
              key={threadId}
              detail={detail.data}
              send={commands.send}
              onDeleted={() => host.openThread('')}
            />
          )}
        </>
      ) : (
        <section className="space-y-4" aria-label={localize('com_media_threads')}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{localize('com_media_threads')}</h2>
            <ControlCombobox
              variant="field"
              isCollapsed={false}
              portal={false}
              ariaLabel={localize('com_media_filter')}
              selectedValue={filter ?? 'all'}
              items={(['all', 'pending', 'completed'] as const).map((value) => ({
                value,
                label: localize(mediaThreadFilterLabels[value]),
              }))}
              setValue={(value) => setFilter(value as MediaThreadListRequest['filter'])}
            />
          </div>
          {threads.isLoading && <p role="status">{localize('com_media_loading')}</p>}
          {threads.isError && (
            <div role="alert">
              <p>{localize('com_media_load_failed')}</p>
              <Button variant="outline" onClick={() => void threads.refetch()}>
                {localize('com_ui_retry')}
              </Button>
            </div>
          )}
          {!threads.isLoading && !threads.isError && tiles.length === 0 && (
            <p className="text-text-secondary">{localize('com_media_empty')}</p>
          )}
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {tiles.map((tile) => (
              <li key={tile.threadId}>
                <button
                  type="button"
                  className="h-full w-full space-y-3 rounded-lg border border-border-light bg-surface-primary p-3 text-start hover:bg-surface-hover focus-visible:outline"
                  onClick={() => host.openThread(tile.threadId)}
                >
                  {tile.thread?.cover && <MediaPreview asset={tile.thread.cover} compact />}
                  <h3 className="break-words font-medium">{tile.title}</h3>
                  <p className="text-sm text-text-secondary">
                    {tile.thread
                      ? localize('com_media_thread_counts', {
                          turns: tile.thread.turnCount,
                          jobs: tile.thread.pendingJobCount,
                        })
                      : pendingTitle(tile.receipt)}
                  </p>
                  {tile.receipt?.phase === 'preparing' && <p>{localize('com_media_preparing')}</p>}
                </button>
              </li>
            ))}
          </ul>
          {threads.hasNextPage && (
            <Button
              variant="outline"
              disabled={threads.isFetchingNextPage}
              onClick={() => void threads.fetchNextPage()}
            >
              {localize('com_media_more_threads')}
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
