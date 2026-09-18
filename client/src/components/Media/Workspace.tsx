import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { ArrowLeft, HatGlasses, History, Images, Plus, SlidersHorizontal } from 'lucide-react';
import {
  Button,
  EmptyState,
  Skeleton,
  Spinner,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
  TooltipAnchor,
} from '@librechat/client';
import type { ReactNode } from 'react';
import type { MediaReceipt } from '~/data-provider/Media';
import type { MediaFormParts } from './Form';
import {
  mergeMediaTiles,
  useMediaCatalog,
  useMediaThread,
  useMediaThreads,
} from '~/data-provider/Media';
import { mediaDraftFamily, mediaLibraryFamily, mediaPendingFamily } from './state';
import { mediaFeatures, useMediaHost } from './host';
import { mediaThreadContext } from './context';
import { cn, setDocumentTitle } from '~/utils';
import { useMediaCommands } from './commands';
import { mediaErrorLabels } from './labels';
import { MediaThreadView } from './Thread';
import { MediaGallery } from './Gallery';
import { useLocalize } from '~/hooks';
import { MediaForm } from './Form';

export default function MediaWorkspace({
  threadId,
  navigation,
  settingsHost,
}: {
  threadId?: string;
  navigation?: ReactNode;
  settingsHost?: { render: (settings: ReactNode) => ReactNode; toggle: ReactNode };
}) {
  const host = useMediaHost();
  const features = mediaFeatures(host);
  const localize = useLocalize();
  const workspace = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const galleryScroll = useRef<HTMLDivElement>(null);
  const galleryPosition = useRef(0);
  const followLatest = useRef(true);
  const focusRequested = useRef(false);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [library, setLibrary] = useAtom(mediaLibraryFamily(host.scope));
  const [newDraft, setNewDraft] = useAtom(mediaDraftFamily(`${host.scope}:new`));
  const gallery = library.view === 'gallery' && library.threadId === threadId;
  const setView = (view: 'thread' | 'gallery') =>
    setLibrary((previous) => ({ ...previous, view, threadId }));
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
    localize(receipt?.phase === 'preparing' ? 'com_media_preparing' : 'com_media_restoring');
  const focusPrompt = useCallback(() => {
    const prompt = workspace.current?.querySelector<HTMLTextAreaElement>(
      '[data-media-composer] textarea',
    );
    if (!prompt || prompt.closest('[hidden]')) return;
    prompt.focus();
    focusRequested.current = false;
  }, []);
  const focusComposer = () => {
    setView('thread');
    focusRequested.current = true;
    requestAnimationFrame(focusPrompt);
  };
  const create = () => {
    host.openThread('');
    focusComposer();
  };
  const { latestTurn, image: imageContext } = useMemo(
    () => mediaThreadContext(detail.data?.turns.items ?? []),
    [detail.data?.turns.items],
  );
  const hasDetail = !!detail.data;
  const hasCatalog = !!catalog.data;
  const studioTitle = localize('com_media_studio');
  const threadTitle = detail.data?.thread.title;
  useEffect(() => {
    setDocumentTitle(threadTitle ? `${threadTitle} | ${studioTitle}` : studioTitle);
  }, [threadTitle, studioTitle]);
  useEffect(() => {
    if (!focusRequested.current || gallery) return;
    const frame = requestAnimationFrame(focusPrompt);
    return () => cancelAnimationFrame(frame);
  }, [threadId, hasDetail, hasCatalog, gallery, focusPrompt]);
  useLayoutEffect(() => {
    followLatest.current = true;
  }, [threadId]);
  useLayoutEffect(() => {
    const viewport = scroll.current;
    const body = transcript.current;
    if (!viewport || !body || gallery) return;
    const settle = () => {
      if (followLatest.current) viewport.scrollTop = viewport.scrollHeight;
    };
    settle();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(settle);
    observer.observe(body);
    return () => observer.disconnect();
  }, [threadId, hasDetail, hasCatalog, gallery]);
  useEffect(() => {
    if (gallery && galleryScroll.current) galleryScroll.current.scrollTop = galleryPosition.current;
  }, [gallery, hasCatalog, hasDetail]);

  const recovery = commands.pending.length > 0 && (
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
                onClick={() => {
                  setView('thread');
                  host.openThread(response.data!.threadId);
                }}
              >
                {localize('com_media_open_thread')}
              </Button>
            )}
            {!response.data && !commands.sending.has(command.request.clientRequestId) && (
              <>
                <p className="text-sm text-text-secondary">{localize('com_media_uncertain')}</p>
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
  );
  const loading = (
    <div role="status" className="space-y-4">
      <span className="sr-only">{localize('com_media_loading')}</span>
      <Skeleton className="h-10 motion-reduce:animate-none" />
      <Skeleton className="h-24 motion-reduce:animate-none" />
    </div>
  );
  const catalogStatus = catalog.isError ? (
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
  ) : (
    loading
  );
  const conversation = threadId && detail.data && (
    <MediaThreadView
      key={threadId}
      detail={detail.data}
      catalog={catalog.data}
      send={commands.send}
      onCompose={focusComposer}
      onDeleted={create}
      onLoadOlder={() => {
        followLatest.current = false;
      }}
    />
  );
  const renderWorkspace = ({ settings, composer }: MediaFormParts) => (
    <div
      ref={workspace}
      data-media-workspace
      className="flex h-full min-h-0 w-full flex-col bg-presentation text-text-primary"
    >
      {settingsHost?.render(
        <div className="space-y-5 px-3 pb-6 pt-4">
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => (gallery ? create() : setView('gallery'))}
          >
            {gallery ? (
              <Plus className="size-4" aria-hidden="true" />
            ) : (
              <History className="size-4" aria-hidden="true" />
            )}
            {localize(gallery ? 'com_media_new_thread' : 'com_media_open_gallery')}
          </Button>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            {localize('com_media_settings')}
          </h2>
          {settings}
        </div>,
      )}
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-border-light px-3 py-2 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          {navigation}
          <Images
            className="hidden size-5 shrink-0 text-text-secondary sm:block"
            aria-hidden="true"
          />
          <h1 className="truncate text-base font-semibold">{localize('com_media_studio')}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {features.temporary && !threadId && !gallery && (
            <TooltipAnchor
              description={localize('com_media_temporary_creation')}
              render={
                <Button
                  size="icon"
                  variant="header-action"
                  className={cn('size-9', newDraft.temporary && 'bg-surface-active')}
                  aria-pressed={!!newDraft.temporary}
                  aria-label={localize('com_media_temporary_creation')}
                  onClick={() =>
                    setNewDraft((previous) => ({
                      ...previous,
                      temporary: !previous.temporary,
                      revision: previous.revision + 1,
                    }))
                  }
                >
                  <HatGlasses className="icon-md" aria-hidden="true" />
                </Button>
              }
            />
          )}
          <TooltipAnchor
            description={localize(gallery ? 'com_media_back_creation' : 'com_media_open_gallery')}
            render={
              <Button
                size="icon"
                variant="header-action"
                className={cn('size-9', gallery && 'bg-surface-active-alt')}
                aria-pressed={gallery}
                aria-label={localize(
                  gallery ? 'com_media_back_creation' : 'com_media_open_gallery',
                )}
                onClick={() => (gallery ? focusComposer() : setView('gallery'))}
              >
                {gallery ? (
                  <ArrowLeft className="icon-md" aria-hidden="true" />
                ) : (
                  <History className="icon-md" aria-hidden="true" />
                )}
              </Button>
            }
          />
          <TooltipAnchor
            description={localize('com_media_new_thread')}
            render={
              <Button
                size="icon"
                variant="header-action"
                className="size-9"
                aria-label={localize('com_media_new_thread')}
                onClick={create}
              >
                <Plus className="icon-md" aria-hidden="true" />
              </Button>
            }
          />
          {settingsHost ? (
            settingsHost.toggle
          ) : (
            <TooltipAnchor
              description={localize('com_media_settings')}
              render={
                <Button
                  size="icon"
                  variant="header-action"
                  className="size-9"
                  ref={settingsTrigger}
                  aria-label={localize('com_media_settings')}
                  aria-expanded={settingsOpen}
                  onClick={() => setSettingsOpen(true)}
                >
                  <SlidersHorizontal className="icon-md" aria-hidden="true" />
                </Button>
              }
            />
          )}
        </div>
      </header>
      <div
        hidden={gallery}
        className={
          gallery
            ? 'hidden'
            : `flex min-h-0 flex-1 flex-col ${threadId ? '' : 'justify-end sm:justify-center'}`
        }
      >
        <div
          ref={scroll}
          data-media-transcript
          className={
            'scrollbar-gutter-stable min-h-0 overflow-y-auto overscroll-contain ' +
            (threadId ? 'flex-1' : '')
          }
          onScroll={() => {
            const viewport = scroll.current;
            if (viewport && !gallery)
              followLatest.current =
                viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 80;
          }}
        >
          <div
            ref={transcript}
            className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 xl:max-w-4xl"
          >
            {recovery}
            {!threadId && (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 py-6 text-center">
                <Images
                  className="size-10 text-text-secondary"
                  strokeWidth={1.25}
                  aria-hidden="true"
                />
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  {localize('com_media_welcome')}
                </h2>
                <p className="max-w-md text-sm leading-6 text-text-secondary">
                  {localize('com_media_welcome_description')}
                </p>
              </div>
            )}
            {threadId && detail.isLoading && loading}
            {threadId && detail.isError && (
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
            {conversation}
          </div>
        </div>
        <div className="shrink-0 bg-presentation px-4 pb-4 pt-2 sm:px-6">
          <div className="mx-auto w-full max-w-3xl space-y-3 xl:max-w-4xl">
            {composer}
            {commands.error && (
              <div role="alert" className="space-y-2 text-sm">
                <p>{localize(mediaErrorLabels[commands.error])}</p>
                {commands.error === 'stale_catalog' && (
                  <Button variant="outline" onClick={() => void catalog.refetch()}>
                    {localize('com_media_refresh_models')}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {gallery && (
        <div
          ref={galleryScroll}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6"
          onScroll={() => {
            galleryPosition.current = galleryScroll.current?.scrollTop ?? 0;
          }}
        >
          <div className="mx-auto max-w-screen-2xl space-y-5">
            {recovery}
            <MediaGallery
              tiles={tiles}
              catalog={catalog.data}
              query={threads}
              filter={library.filter}
              search={library.search}
              columns={library.columns}
              onFilter={(filter) => setLibrary((previous) => ({ ...previous, filter }))}
              onSearch={(search) => setLibrary((previous) => ({ ...previous, search }))}
              onColumns={(columns) => setLibrary((previous) => ({ ...previous, columns }))}
              onOpen={(id) => {
                host.openThread(id);
                focusComposer();
              }}
              onCreate={create}
            />
          </div>
        </div>
      )}
      {!settingsHost && (
        <OGDialog open={settingsOpen} onOpenChange={setSettingsOpen} triggerRef={settingsTrigger}>
          <OGDialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto">
            <OGDialogTitle>{localize('com_media_settings')}</OGDialogTitle>
            <OGDialogDescription>{localize('com_media_settings_description')}</OGDialogDescription>
            {settings}
          </OGDialogContent>
        </OGDialog>
      )}
    </div>
  );
  if (!catalog.data || (threadId && !detail.data)) {
    const status =
      catalog.data && detail.isError && !preparing ? (
        <p className="text-sm text-text-secondary">{localize('com_media_thread_unavailable')}</p>
      ) : (
        catalogStatus
      );
    return renderWorkspace({ settings: status, composer: status });
  }
  return (
    <MediaForm
      key={threadId ?? 'new'}
      catalog={catalog.data}
      threadId={threadId}
      initialSelection={latestTurn?.selection}
      imageContext={imageContext}
      send={commands.send}
      busy={commands.sending.size > 0}
      portal={!!settingsHost}
    >
      {renderWorkspace}
    </MediaForm>
  );
}
