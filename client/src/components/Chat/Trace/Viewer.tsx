import { useId, useRef, useMemo, useState, useEffect, useCallback, useDeferredValue } from 'react';
import axios from 'axios';
import { resolveTraceViewerConfig } from 'librechat-data-provider';
import { Button, Spinner, EmptyState, FilterInput, buttonVariants } from '@librechat/client';
import {
  X,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  ExternalLink,
  ChevronsUpDown,
  ChevronsDownUp,
  TriangleAlert,
  ChartNoAxesGantt,
} from 'lucide-react';
import type { TTraceErrorCode, TTraceErrorResponse } from 'librechat-data-provider';
import type { KeyboardEvent } from 'react';
import type { TranslationKeys } from '~/hooks';
import type { TraceWindow } from './model';
import {
  useGetStartupConfig,
  useGetLangfuseSessionLinkQuery,
  useConversationTraceRecordsQuery,
} from '~/data-provider';
import { ZOOM_STEP, zoomWindow, flattenRows, buildTraceModel, collapsibleKeys } from './model';
import { useTraceFormat } from './format';
import { useLocalize } from '~/hooks';
import Inspector from './Inspector';
import Timeline from './Timeline';
import Summary from './Summary';
import Ledger from './Ledger';
import { cn } from '~/utils';

const ERROR_MESSAGES: Partial<Record<TTraceErrorCode, TranslationKeys>> = {
  not_found: 'com_ui_trace_error_not_found',
  rate_limited: 'com_ui_trace_error_rate_limited',
  timeout: 'com_ui_trace_error_timeout',
  unauthorized: 'com_ui_trace_error_unauthorized',
  unsupported: 'com_ui_trace_error_unsupported',
};

function errorMessageKey(error: unknown): TranslationKeys {
  if (!axios.isAxiosError<TTraceErrorResponse>(error)) {
    return 'com_ui_trace_error_generic';
  }
  const code = error.response?.data?.errorCode;
  return (code != null ? ERROR_MESSAGES[code] : undefined) ?? 'com_ui_trace_error_generic';
}

/**
 * The conversation trace: a summary, a pinned overview of every loaded record,
 * the record ledger and an inspector. It covers the chat surface and returns
 * focus to whatever opened it when it closes.
 */
export default function Viewer({
  conversationId,
  onClose,
}: {
  conversationId: string;
  onClose: () => void;
}) {
  const localize = useLocalize();
  const format = useTraceFormat();
  const headingId = useId();
  const searchId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const { data: startupConfig } = useGetStartupConfig();
  const settings = resolveTraceViewerConfig(startupConfig?.interface?.traceViewer);
  const showCost = startupConfig?.interface?.contextCost === true;
  const currency = startupConfig?.interface?.currency;

  const recordsQuery = useConversationTraceRecordsQuery(conversationId, true);
  const { data: langfuseSession } = useGetLangfuseSessionLinkQuery(
    conversationId,
    startupConfig?.langfuseConnectionAccess === true,
  );

  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [query, setQuery] = useState('');
  const [view, setView] = useState<TraceWindow | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);

  const pages = recordsQuery.data?.pages;
  const records = useMemo(() => pages?.flatMap((page) => page.records) ?? [], [pages]);
  const recordSources = useMemo(() => {
    const sources = new Map<string, string>();
    for (const page of pages ?? []) {
      for (const record of page.records) {
        if (page.sourceId != null) {
          sources.set(record.id, page.sourceId);
        }
      }
    }
    return sources;
  }, [pages]);
  /** The session link opens one project; offer it only when that project served every loaded page. */
  const langfuseUrl =
    langfuseSession?.url != null &&
    langfuseSession.destinationId != null &&
    pages != null &&
    pages.length > 0 &&
    pages.every((page) => page.sourceId === langfuseSession.destinationId)
      ? langfuseSession.url
      : undefined;
  const model = useMemo(() => buildTraceModel(records), [records]);
  const rows = useMemo(
    () => flattenRows(model, { collapsed, query: deferredQuery, window: view }),
    [model, collapsed, deferredQuery, view],
  );
  const selectedNode = selectedId != null ? model.nodes.get(selectedId) : undefined;
  const selectedTurnStart =
    model.turns.find((turn) => turn.messageId === selectedNode?.record.messageId)?.start ??
    model.start;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => {
      /** Only reclaim focus the trace took with it; a close caused by navigating
       *  elsewhere leaves focus wherever that navigation put it. */
      const active = document.activeElement;
      if (active != null && active !== document.body) {
        return;
      }
      const target = opener?.isConnected ? opener : document.getElementById('header-menu-button');
      target?.focus();
    };
  }, []);

  const toggle = useCallback((key: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const closeInspector = useCallback(() => {
    setSelectedId(null);
    treeRef.current?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    if (selectedId != null) {
      closeInspector();
      return;
    }
    onClose();
  };

  const refreshButton = (
    <Button
      size="icon-sm"
      variant="outline"
      aria-label={localize('com_ui_trace_refresh')}
      disabled={recordsQuery.isFetching}
      onClick={() => recordsQuery.refetch()}
    >
      <RefreshCw
        aria-hidden="true"
        className={cn(
          'size-4',
          recordsQuery.isFetching && 'animate-spin motion-reduce:animate-none',
        )}
      />
    </Button>
  );

  const renderBody = () => {
    if (recordsQuery.isLoading) {
      return (
        <div role="status" className="flex flex-1 items-center justify-center gap-2">
          <Spinner className="size-5 text-text-secondary" />
          <span className="sr-only">{localize('com_ui_trace_loading')}</span>
        </div>
      );
    }

    if (recordsQuery.isError && recordsQuery.data == null) {
      return (
        <div className="flex flex-1 items-center justify-center p-4">
          <EmptyState
            icon={TriangleAlert}
            title={localize('com_ui_trace_error_title')}
            description={localize(errorMessageKey(recordsQuery.error))}
            action={
              <Button size="sm" variant="outline" onClick={() => recordsQuery.refetch()}>
                {localize('com_ui_retry')}
              </Button>
            }
          />
        </div>
      );
    }

    if (model.nodes.size === 0 && recordsQuery.hasNextPage !== true) {
      return (
        <div className="flex flex-1 items-center justify-center p-4">
          <EmptyState
            icon={ChartNoAxesGantt}
            title={localize('com_ui_trace_empty_title')}
            description={localize('com_ui_trace_empty_description')}
            action={
              <Button size="sm" variant="outline" onClick={() => recordsQuery.refetch()}>
                {localize('com_ui_trace_refresh')}
              </Button>
            }
          />
        </div>
      );
    }

    /** A refresh or an older page failed while earlier results stay on screen. */
    const cachedReadFailed = recordsQuery.isError && recordsQuery.data != null;
    return (
      <>
        <div className="flex flex-col gap-3 border-b border-border-light px-3 py-3 md:px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Summary summary={model.summary} showCost={showCost} currency={currency} />
            {recordsQuery.hasNextPage === true && (
              <p className="text-xs text-text-secondary">
                {localize('com_ui_trace_partial', { 0: String(records.length) })}
              </p>
            )}
          </div>
          <Timeline model={model} view={view} onViewChange={setView} />
          <div className="flex flex-wrap items-center gap-2">
            <FilterInput
              inputId={searchId}
              label={localize('com_ui_trace_search')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && query !== '') {
                  event.preventDefault();
                  setQuery('');
                }
              }}
              containerClassName="min-w-[10rem] flex-1 md:max-w-xs"
            />
            <Button
              size="sm"
              variant="outline"
              aria-label={localize('com_ui_trace_expand_all')}
              onClick={() => setCollapsed(new Set())}
              disabled={collapsed.size === 0}
            >
              <ChevronsUpDown className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">{localize('com_ui_trace_expand_all')}</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-label={localize('com_ui_trace_collapse_all')}
              onClick={() => setCollapsed(new Set(collapsibleKeys(model)))}
            >
              <ChevronsDownUp className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">{localize('com_ui_trace_collapse_all')}</span>
            </Button>
            <div className="ml-auto flex items-center gap-1">
              {view != null && (
                <span className="text-xs tabular-nums text-text-secondary" aria-live="polite">
                  {localize('com_ui_trace_selection', {
                    0: format.duration(view.start - model.start),
                    1: format.duration(view.end - model.start),
                  })}
                </span>
              )}
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={localize('com_ui_zoom_out')}
                disabled={view == null}
                onClick={() => setView(zoomWindow(model, view, 1 / ZOOM_STEP))}
              >
                <ZoomOut className="size-4" aria-hidden="true" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={localize('com_ui_zoom_in')}
                onClick={() => setView(zoomWindow(model, view, ZOOM_STEP))}
              >
                <ZoomIn className="size-4" aria-hidden="true" />
              </Button>
              {view != null && (
                <Button size="sm" variant="ghost" onClick={() => setView(null)}>
                  {localize('com_ui_trace_clear_selection')}
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="relative flex min-h-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {rows.length === 0 ? (
              <p role="status" className="p-4 text-sm text-text-secondary">
                {localize('com_ui_trace_no_matches')}
              </p>
            ) : (
              <Ledger
                rows={rows}
                model={model}
                view={view}
                selectedId={selectedId}
                treeRef={treeRef}
                onSelect={setSelectedId}
                onToggle={toggle}
              />
            )}
            {(recordsQuery.hasNextPage === true || cachedReadFailed) && (
              <div className="flex flex-wrap items-center justify-center gap-2 border-t border-border-light p-2">
                {cachedReadFailed && (
                  <>
                    <span role="alert" className="text-xs text-status-error">
                      {localize(errorMessageKey(recordsQuery.error))}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={recordsQuery.isFetching}
                      onClick={() => recordsQuery.refetch()}
                    >
                      {localize('com_ui_retry')}
                    </Button>
                  </>
                )}
                {recordsQuery.hasNextPage === true && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={recordsQuery.isFetchingNextPage}
                    onClick={() => recordsQuery.fetchNextPage()}
                  >
                    {recordsQuery.isFetchingNextPage && <Spinner className="size-3.5" />}
                    {localize('com_ui_trace_load_older')}
                  </Button>
                )}
              </div>
            )}
          </div>
          {selectedNode && (
            <Inspector
              node={selectedNode}
              turnStart={selectedTurnStart}
              sourceId={recordSources.get(selectedNode.record.id)}
              conversationId={conversationId}
              showContent={settings.showInputOutput}
              showCost={showCost}
              currency={currency}
              onClose={closeInspector}
            />
          )}
        </div>
      </>
    );
  };

  return (
    <section
      aria-labelledby={headingId}
      data-testid="trace-viewer"
      onKeyDown={handleKeyDown}
      className="absolute inset-0 z-20 flex flex-col bg-presentation text-text-primary"
    >
      <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border-light px-2 md:px-4">
        <h2 id={headingId} className="text-base font-semibold">
          {localize('com_ui_trace_title')}
        </h2>
        <div className="ml-auto flex items-center gap-2">
          {langfuseUrl != null && (
            <a
              href={langfuseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">{localize('com_ui_trace_open_langfuse')}</span>
              <span className="sr-only sm:hidden">{localize('com_ui_trace_open_langfuse')}</span>
            </a>
          )}
          {refreshButton}
          <Button
            ref={closeRef}
            size="icon-sm"
            variant="outline"
            aria-label={localize('com_ui_trace_close')}
            onClick={onClose}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      {renderBody()}
    </section>
  );
}
