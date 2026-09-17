import { useId, useMemo } from 'react';
import { Button, Chip, EmptyState, Input, Skeleton } from '@librechat/client';
import { Film, Image, Images, Search, Plus, ArrowUpRight } from 'lucide-react';
import type { MediaCatalog, MediaThreadListRequest } from 'librechat-data-provider';
import type { MediaTile, useMediaThreads } from '~/data-provider/Media';
import { mediaThreadFilterLabels } from './labels';
import { MediaPreview } from './Asset';
import { MediaStatus } from './Status';
import { useLocalize } from '~/hooks';
import { useMediaHost } from './host';

export function MediaGallery({
  tiles,
  catalog,
  query,
  filter,
  search,
  onFilter,
  onSearch,
  onCreate,
}: {
  tiles: MediaTile[];
  catalog?: MediaCatalog;
  query: ReturnType<typeof useMediaThreads>;
  filter: NonNullable<MediaThreadListRequest['filter']>;
  search: string;
  onFilter: (value: NonNullable<MediaThreadListRequest['filter']>) => void;
  onSearch: (value: string) => void;
  onCreate: () => void;
}) {
  const host = useMediaHost();
  const localize = useLocalize();
  const id = useId();
  const offerings = useMemo(
    () =>
      new Map(
        catalog?.offerings.map((item) => [JSON.stringify([item.connectionId, item.modelId]), item]),
      ),
    [catalog],
  );
  const needle = search.trim().toLocaleLowerCase();
  const visible = tiles.flatMap((tile) => {
    const latest = tile.thread?.activity?.latestJob;
    const offering =
      latest &&
      offerings.get(JSON.stringify([latest.selection.connectionId, latest.selection.modelId]));
    const model = offering?.modelName ?? latest?.selection.modelId;
    const connection = offering?.connectionName ?? latest?.selection.connectionId;
    if (
      needle &&
      ![tile.title, model, connection].some((value) => value?.toLocaleLowerCase().includes(needle))
    )
      return [];
    return [{ tile, latest, model, connection }];
  });
  return (
    <section className="min-w-0 space-y-5" aria-label={localize('com_media_threads')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{localize('com_media_threads')}</h2>
          <p className="mt-1 text-sm text-text-secondary">
            {localize('com_media_library_description')}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onCreate}>
          <Plus className="mr-1.5 size-4" aria-hidden="true" />
          {localize('com_media_create')}
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label={localize('com_media_filter')}
          className="flex flex-wrap gap-1"
        >
          {(['all', 'completed', 'pending'] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={filter === value ? 'secondary' : 'ghost'}
              aria-pressed={filter === value}
              onClick={() => onFilter(value)}
            >
              {localize(mediaThreadFilterLabels[value])}
            </Button>
          ))}
        </div>
        <div className="relative w-full min-w-0 sm:w-auto sm:max-w-64 sm:flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-3 size-4 text-text-secondary"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label={localize('com_media_search')}
            placeholder={localize('com_media_search')}
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            className="pl-9"
          />
        </div>
      </div>
      {query.isLoading && (
        <div role="status" className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          <span className="sr-only">{localize('com_media_loading')}</span>
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="aspect-square motion-reduce:animate-none" />
          ))}
        </div>
      )}
      {query.isError && (
        <div role="alert">
          <EmptyState
            icon={Images}
            description={localize('com_media_load_failed')}
            action={
              <Button variant="outline" onClick={() => void query.refetch()}>
                {localize('com_ui_retry')}
              </Button>
            }
          />
        </div>
      )}
      {!query.isLoading && !query.isError && visible.length === 0 && (
        <EmptyState
          icon={Images}
          title={localize(
            needle || filter !== 'all' ? 'com_media_no_matches' : 'com_media_empty_title',
          )}
          description={localize(
            needle || filter !== 'all' ? 'com_media_no_matches_hint' : 'com_media_empty',
          )}
          action={
            needle || filter !== 'all' ? (
              <Button
                variant="outline"
                onClick={() => {
                  onSearch('');
                  onFilter('all');
                }}
              >
                {localize('com_media_show_all')}
              </Button>
            ) : (
              <Button onClick={onCreate}>{localize('com_media_create')}</Button>
            )
          }
          className="min-h-72"
        />
      )}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        {visible.map(({ tile, latest, model, connection }) => {
          const cover = tile.thread?.cover;
          const phase =
            (tile.thread?.pendingJobCount ?? 0) > 0 &&
            (!latest || ['succeeded', 'failed', 'cancelled'].includes(latest.phase))
              ? 'running'
              : latest?.phase;
          const video = cover?.type.startsWith('video/') || latest?.operation === 'video.generate';
          const Icon = video ? Film : Image;
          const status = phase ?? (cover ? 'succeeded' : undefined);
          let emptyLabel = localize('com_media_open_thread');
          if (phase === 'failed') emptyLabel = localize('com_media_no_output');
          else if (phase === 'cancelled') emptyLabel = localize('com_media_phase_cancelled');
          else if ((tile.thread?.pendingJobCount ?? 0) > 0)
            emptyLabel = localize('com_media_phase_running');
          return (
            <li key={tile.threadId}>
              <Button
                variant="outline"
                className="group h-full w-full flex-col items-stretch justify-start gap-0 overflow-hidden whitespace-normal rounded-2xl bg-surface-primary p-0 text-start"
                onClick={() => host.openThread(tile.threadId)}
                aria-label={localize('com_media_open_named', { title: tile.title })}
                aria-describedby={`${id}-${tile.threadId}`}
              >
                <span className="relative block w-full">
                  {cover ? (
                    <MediaPreview asset={cover} compact />
                  ) : (
                    <span className="flex aspect-[4/3] flex-col items-center justify-center gap-3 bg-surface-secondary text-text-secondary">
                      <Icon className="size-9" strokeWidth={1.25} aria-hidden="true" />
                      <span className="text-sm">{emptyLabel}</span>
                    </span>
                  )}
                  {video && (
                    <span className="absolute left-3 top-3">
                      <Chip leading={<Film className="size-3.5" aria-hidden="true" />}>
                        {localize('com_media_video')}
                      </Chip>
                    </span>
                  )}
                </span>
                <span id={`${id}-${tile.threadId}`} className="flex flex-1 flex-col gap-3 p-4">
                  <span className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 break-words text-sm font-medium leading-6">
                      {tile.title}
                    </span>
                    <ArrowUpRight
                      className="mt-1 size-4 shrink-0 text-text-tertiary"
                      aria-hidden="true"
                    />
                  </span>
                  {(model || connection) && (
                    <span className="block min-w-0 text-xs text-text-secondary">
                      <span className="block truncate">{connection}</span>
                      <span className="block truncate">{model}</span>
                    </span>
                  )}
                  <span className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
                    {status ? (
                      <MediaStatus phase={status} />
                    ) : (
                      <Chip>
                        {localize(tile.receipt ? 'com_media_preparing' : 'com_media_saved_thread')}
                      </Chip>
                    )}
                    {(tile.thread?.activity?.readyOutputs ?? 0) > 0 && (
                      <span className="text-xs text-text-secondary">
                        {localize('com_media_result_count', {
                          count: tile.thread!.activity!.readyOutputs,
                        })}
                      </span>
                    )}
                  </span>
                </span>
              </Button>
            </li>
          );
        })}
      </ul>
      {query.hasNextPage && (
        <div className="flex flex-col items-center gap-2">
          {needle && (
            <p className="text-xs text-text-secondary">{localize('com_media_search_more')}</p>
          )}
          <Button
            variant="outline"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {localize('com_media_more_threads')}
          </Button>
        </div>
      )}
    </section>
  );
}
