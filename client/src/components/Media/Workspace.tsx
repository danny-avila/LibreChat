import { useEffect, useRef, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { ArrowLeft, Images, Plus, X } from 'lucide-react';
import { Button, EmptyState, Skeleton, Spinner } from '@librechat/client';
import type { ReactNode } from 'react';
import type { MediaReceipt } from '~/data-provider/Media';
import {
  mergeMediaTiles,
  useMediaCatalog,
  useMediaThread,
  useMediaThreads,
} from '~/data-provider/Media';
import { mediaLibraryFamily, mediaPendingFamily } from './state';
import { useMediaCommands } from './commands';
import { mediaErrorLabels } from './labels';
import { MediaThreadView } from './Thread';
import { MediaGallery } from './Gallery';
import { useLocalize } from '~/hooks';
import { useMediaHost } from './host';
import { MediaForm } from './Form';

export default function MediaWorkspace({
  threadId,
  libraryFirst = false,
  navigation,
}: {
  threadId?: string;
  libraryFirst?: boolean;
  navigation?: ReactNode;
}) {
  const host = useMediaHost();
  const localize = useLocalize();
  const workspace = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const composerTrigger = useRef<HTMLButtonElement>();
  const [composerOpen, setComposerOpen] = useState(!libraryFirst && !threadId);
  useEffect(() => {
    setComposerOpen(!libraryFirst && !threadId);
    workspace.current?.scrollIntoView({ block: 'start' });
  }, [threadId, libraryFirst]);
  const [library, setLibrary] = useAtom(mediaLibraryFamily(host.scope));
  const catalog = useMediaCatalog(host);
  const threads = useMediaThreads(host, library.filter);
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
    return [{ receipt, title }];
  });
  const tiles = mergeMediaTiles(visible, recoverable);
  const preparing = recoverable.some(
    ({ receipt }) => receipt.threadId === threadId && receipt.phase !== 'rejected',
  );
  const pendingTitle = (receipt?: MediaReceipt) =>
    receipt?.phase === 'preparing'
      ? localize('com_media_preparing')
      : localize('com_media_restoring');
  const focusComposer = () => {
    if (document.activeElement instanceof HTMLButtonElement)
      composerTrigger.current = document.activeElement;
    setComposerOpen(true);
    requestAnimationFrame(() => {
      const prompt = workspace.current?.querySelector<HTMLTextAreaElement>('aside textarea');
      prompt?.focus();
      prompt?.scrollIntoView({ block: 'center' });
    });
  };
  const latestTurn = detail.data?.turns.items.reduce(
    (latest, turn) => (!latest || turn.createdAt > latest.createdAt ? turn : latest),
    detail.data.turns.items[0],
  );
  return (
    <div
      ref={workspace}
      data-media-workspace
      className="mx-auto w-full max-w-screen-2xl space-y-6 p-4 text-text-primary sm:p-6"
    >
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border-light pb-5">
        <div className="flex items-center gap-3">
          {navigation}
          <span
            className={
              'size-11 items-center justify-center rounded-2xl bg-surface-secondary ' +
              (navigation ? 'hidden md:flex' : 'flex')
            }
          >
            <Images className="size-6" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {localize('com_media_studio')}
            </h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              {localize('com_media_studio_description')}
            </p>
          </div>
        </div>
        {threadId && (
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => host.openThread('')}>
              <ArrowLeft className="mr-1.5 size-4" aria-hidden="true" />
              {localize('com_media_back_library')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                host.openThread('');
                requestAnimationFrame(focusComposer);
              }}
            >
              <Plus className="mr-1.5 size-4" aria-hidden="true" />
              {localize('com_media_new_thread')}
            </Button>
          </div>
        )}
      </header>
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        <aside
          className={
            'min-w-0 rounded-2xl border border-border-light bg-surface-primary p-4 lg:block ' +
            (composerOpen ? 'block' : 'hidden')
          }
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">{localize('com_media_create')}</h2>
            <Button
              variant="ghost"
              size="icon-sm"
              className="lg:hidden"
              aria-label={localize('com_media_close_editor')}
              onClick={() => {
                setComposerOpen(false);
                requestAnimationFrame(() => {
                  if (composerTrigger.current?.isConnected) {
                    composerTrigger.current.focus();
                    composerTrigger.current.scrollIntoView({ block: 'center' });
                  } else content.current?.scrollIntoView({ block: 'start' });
                });
              }}
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
          {(catalog.isLoading || (threadId && detail.isLoading)) && (
            <div role="status" className="space-y-4">
              <span className="sr-only">{localize('com_media_loading')}</span>
              <Skeleton className="h-10 motion-reduce:animate-none" />
              <Skeleton className="h-48 motion-reduce:animate-none" />
            </div>
          )}
          {catalog.isError && (
            <div role="alert">
              <EmptyState
                icon={Images}
                description={localize('com_media_load_failed')}
                action={
                  <Button variant="outline" onClick={() => void catalog.refetch()}>
                    {localize('com_ui_retry')}
                  </Button>
                }
              />
            </div>
          )}
          {catalog.data && (!threadId || detail.data) && (
            <MediaForm
              key={threadId ?? 'new'}
              catalog={catalog.data}
              threadId={threadId}
              initialSelection={latestTurn?.selection}
              send={commands.send}
              busy={commands.sending.size > 0}
            />
          )}
          {commands.error && (
            <div role="alert" className="mt-4 space-y-2 text-sm">
              <p>{localize(mediaErrorLabels[commands.error])}</p>
              {commands.error === 'stale_catalog' && (
                <Button variant="outline" onClick={() => void catalog.refetch()}>
                  {localize('com_media_refresh_models')}
                </Button>
              )}
            </div>
          )}
        </aside>
        <div ref={content} className="min-w-0 space-y-5">
          {commands.pending.length > 0 && (
            <section className="space-y-2" aria-label={localize('com_media_recovery')}>
              {commands.pending.map((command, index) => {
                const response = commands.receipts[index];
                return (
                  <div
                    key={command.request.clientRequestId}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-border-light bg-surface-secondary p-4"
                  >
                    {response.data?.phase !== 'rejected' && <Spinner className="size-4" />}
                    <p role="status" className="text-sm">
                      {response.data?.phase === 'rejected'
                        ? localize(mediaErrorLabels[response.data.error.code])
                        : pendingTitle(response.data)}
                    </p>
                    {response.data && response.data.phase !== 'rejected' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => host.openThread(response.data!.threadId)}
                      >
                        {localize('com_media_open_thread')}
                      </Button>
                    )}
                    {!response.data && !commands.sending.has(command.request.clientRequestId) && (
                      <>
                        <p className="text-sm text-text-secondary">
                          {localize('com_media_uncertain')}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
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
                        size="sm"
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
              {detail.isLoading && (
                <div role="status">
                  <span className="sr-only">{localize('com_media_loading')}</span>
                  <Skeleton className="aspect-square motion-reduce:animate-none" />
                </div>
              )}
              {detail.isError && (
                <div role={preparing ? 'status' : 'alert'}>
                  <EmptyState
                    icon={Images}
                    description={localize(
                      preparing ? 'com_media_preparing' : 'com_media_thread_unavailable',
                    )}
                    action={
                      <Button variant="outline" onClick={() => void detail.refetch()}>
                        {localize('com_ui_retry')}
                      </Button>
                    }
                  />
                </div>
              )}
              {detail.data && (
                <MediaThreadView
                  key={threadId}
                  detail={detail.data}
                  catalog={catalog.data}
                  send={commands.send}
                  onCompose={focusComposer}
                  onDeleted={() => host.openThread('')}
                />
              )}
            </>
          ) : (
            <MediaGallery
              tiles={tiles}
              catalog={catalog.data}
              query={threads}
              filter={library.filter}
              search={library.search}
              onFilter={(value) => setLibrary((previous) => ({ ...previous, filter: value }))}
              onSearch={(value) => setLibrary((previous) => ({ ...previous, search: value }))}
              onCreate={focusComposer}
            />
          )}
        </div>
      </div>
    </div>
  );
}
