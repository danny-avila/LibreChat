import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiBaseUrl, PrincipalType, ResourceType } from 'librechat-data-provider';
import type { GrantAuditAction } from '~/admin/constants';
import type { AuditFilters } from '~/admin/api';
import type * as t from '~/admin/types';
import {
  ACTION_BADGE_STATE,
  ACTION_LABEL_KEY,
  auditSubject,
  auditTargetConfig,
  buildEntryPermalink,
  dateToIsoDate,
  formatTimestamp,
  isoDateToDate,
  localDayBoundaryIso,
} from './auditLogUtils';
import {
  DecorativeIcon,
  EmptyState,
  LoadingState,
  Pagination,
  ScreenReaderAnnouncer,
  SearchInput,
} from '~/admin/components/shared';
import {
  AUDIT_LOG_PAGE_SIZE,
  auditLogEntryQueryOptions,
  auditLogQueryOptions,
  exportAuditLogServerFn,
} from '~/admin/api';
import { useAnnouncement, useDebouncedFilter, useLocalize } from '~/admin/hooks';
import { Badge, Button, DatePicker, Select, TextField } from '~/admin/ui';
import { useNavigate, useSearch, ADMIN_BASE_PATH } from '~/admin/router';
import { AUDIT_ACTIONS, isAuditEntryId } from '~/admin/constants';
import { AuditLogDetailDrawer } from './AuditLogDetailDrawer';
import { keepPreviousData, useQuery } from '~/admin/query';
import { cn } from '~/admin/utils';

const TARGET_TYPE_OPTIONS: readonly t.AuditTargetType[] = [
  PrincipalType.USER,
  PrincipalType.GROUP,
  PrincipalType.ROLE,
  ResourceType.AGENT,
] as const;
/** Radix `Select.Item` cannot use `value=""` (Radix reserves empty string for
 * "no selection"). Use a non-empty sentinel and translate to `''` in state. */
const TARGET_TYPE_ALL = '__all__';

/**
 * Wraps a click-ui DatePicker so only the trigger button is tab-focusable.
 * click-ui renders both a PopoverTrigger button AND an inner readonly input,
 * which produces two stops in the tab order. The input has no exposed `tabIndex`
 * prop, so we reach for the DOM node and set it to -1. The class hooks the
 * CSS rule that rounds the trigger's focus outline to match the wrapper border.
 *
 * `resetKey` is the caller's signal that the inner DatePicker has been keyed
 * to remount (e.g. the Clear button bumping a nonce): the inner `<input>` is
 * replaced and the previous patch is lost, so the effect must re-run and
 * re-apply `tabIndex = -1` against the fresh DOM node.
 */
function DatePickerCell({
  children,
  resetKey,
  inputId,
}: {
  children: React.ReactNode;
  resetKey?: unknown;
  /**
   * Stamps the click-ui-rendered `<input>` with an `id` so an external
   * `<label htmlFor={...}>` (and the e2e WCAG check) can target it. click-ui
   * has no `id` prop, so we apply it via DOM ref in the same effect that
   * removes the input from the tab order.
   */
  inputId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const input = node.querySelector('input');
    if (!input) return;
    input.tabIndex = -1;
    if (inputId) input.id = inputId;
  }, [resetKey, inputId]);
  return (
    <div ref={ref} className="audit-date-cell contents">
      {children}
    </div>
  );
}

function downloadBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function AuditLogTab() {
  const localize = useLocalize();
  const navigate = useNavigate({ from: '/grants' });
  const search = useSearch({ from: '/_app/grants' });
  const entryId = typeof search.entryId === 'string' ? search.entryId : undefined;

  const [actionFilter, setActionFilter] = useState<GrantAuditAction[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  /** Bumped each clear so DatePicker remounts and drops its internal selection state. */
  const [dateResetNonce, setDateResetNonce] = useState(0);
  const [targetTypeFilter, setTargetTypeFilter] = useState<t.AuditTargetType | ''>('');

  const [currentPage, setCurrentPage] = useState(1);
  const { message: announcement, announce } = useAnnouncement();

  const resetToFirstPage = useCallback(() => setCurrentPage(1), []);
  const searchFilter = useDebouncedFilter('', resetToFirstPage);
  const actorIdFilter = useDebouncedFilter('', resetToFirstPage);
  const targetIdFilter = useDebouncedFilter('', resetToFirstPage);
  const capabilityFilter = useDebouncedFilter('', resetToFirstPage);

  /**
   * Build the wire filter object from one snapshot of inputs. Used by both the
   * page query (passing the debounced values, so a typing user does not trigger
   * a refetch on every keystroke) and the export handler (passing the
   * immediate input values, so a click within the 300ms debounce window exports
   * exactly what the user can see in the inputs).
   */
  const buildFilters = useCallback(
    (
      search: string,
      actorQuery: string,
      targetQuery: string,
      capability: string,
    ): Omit<AuditFilters, 'offset' | 'limit'> => {
      const trimmedSearch = search.trim();
      return {
        search: trimmedSearch ? trimmedSearch : undefined,
        action: actionFilter.length ? actionFilter : undefined,
        from: localDayBoundaryIso(dateFrom, 'start'),
        to: localDayBoundaryIso(dateTo, 'end'),
        /**
         * Wire-format keys are the canonical `actorQuery` / `targetQuery` —
         * the backend treats the older `actorId` / `targetPrincipalId` names
         * as deprecated aliases that log a warning per request. UI state
         * variable names stay as `actorIdFilter` / `targetIdFilter` to avoid
         * a churny rename in the JSX layer.
         */
        actorQuery: actorQuery || undefined,
        targetQuery: targetQuery || undefined,
        targetType: targetTypeFilter ? targetTypeFilter : undefined,
        capability: capability || undefined,
      };
    },
    [actionFilter, dateFrom, dateTo, targetTypeFilter],
  );

  const filters = useMemo<Omit<AuditFilters, 'offset' | 'limit'>>(
    () =>
      buildFilters(
        searchFilter.debouncedValue,
        actorIdFilter.debouncedValue,
        targetIdFilter.debouncedValue,
        capabilityFilter.debouncedValue,
      ),
    [
      buildFilters,
      searchFilter.debouncedValue,
      actorIdFilter.debouncedValue,
      targetIdFilter.debouncedValue,
      capabilityFilter.debouncedValue,
    ],
  );

  const { data, isPending, isFetching, isError } = useQuery({
    ...auditLogQueryOptions(currentPage, filters),
    placeholderData: keepPreviousData,
  });

  const pageEntries = useMemo<t.AuditLogEntryWithDiff[]>(() => data?.entries ?? [], [data]);
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / AUDIT_LOG_PAGE_SIZE));
  /**
   * Surface-level views of `total`/`totalPages` for the footer + pagination
   * UI. `keepPreviousData` means a failed refetch still has the last page's
   * counts in `data`, but we render the error EmptyState in the table — so
   * showing "showing 47 of 482 entries" with working pagination next to a
   * "failed to load" message is misleading. On error we collapse both to
   * zero/one so the user sees a clean error state rather than mixed signals.
   */
  const displayTotal = isError ? 0 : total;
  const displayTotalPages = isError ? 1 : totalPages;

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  /**
   * Page reset is wired inline at each filter call-site (action toggle, date
   * pickers, date clear, target type, debounced text filters via `onCommit`)
   * so the new query key fires once with `currentPage = 1` rather than running
   * a stale page-N fetch first and then re-fetching after a deferred effect.
   */

  /**
   * Single-line signature of the active filter set so the announcement effect
   * can short-circuit when nothing about the filter actually changed. Without
   * this, every pagination click (which toggles `isFetching`) would re-fire
   * the same "X entries match" message to screen readers.
   */
  const filterSignature = useMemo(
    () =>
      JSON.stringify({
        search: searchFilter.debouncedValue,
        action: actionFilter,
        dateFrom,
        dateTo,
        actorId: actorIdFilter.debouncedValue,
        targetId: targetIdFilter.debouncedValue,
        capability: capabilityFilter.debouncedValue,
        targetType: targetTypeFilter,
      }),
    [
      searchFilter.debouncedValue,
      actionFilter,
      dateFrom,
      dateTo,
      actorIdFilter.debouncedValue,
      targetIdFilter.debouncedValue,
      capabilityFilter.debouncedValue,
      targetTypeFilter,
    ],
  );
  const lastAnnouncedSignature = useRef<string | null>(null);

  useEffect(() => {
    if (isFetching) return;
    if (lastAnnouncedSignature.current === filterSignature) return;
    /**
     * Don't announce a match count when the fetch failed: the table is showing
     * an error EmptyState, so reading "X entries match the current filters"
     * (where X is a stale or zero count) misrepresents what the user can see.
     * The signature stays untracked so a retry that succeeds will announce.
     */
    if (isError) return;
    lastAnnouncedSignature.current = filterSignature;
    /**
     * Announce the full match count, not the per-page slice. The visible
     * bottom-of-page counter uses `total` for the same reason: a filter
     * that matches 200 rows should announce 200, not the 50 currently
     * rendered on this page.
     */
    announce(localize('com_admin_a11y_audit_filter_changed', { count: total }));
  }, [filterSignature, isFetching, isError, total, announce, localize]);

  /**
   * Gate on `!isError` so a failed list refetch (which `keepPreviousData`
   * leaves with stale `pageEntries` in memory) does not surface a cached row
   * here. Falling through to `entryFetch` instead is the right behavior on
   * error — the single-entry endpoint is independent of the list query.
   */
  const entryOnPage = useMemo(
    () => (entryId && !isError ? (pageEntries.find((e) => e.id === entryId) ?? null) : null),
    [pageEntries, entryId, isError],
  );

  // Fall back to a direct single-entry fetch when the deep-linked id isn't on
  // the current page (older entries, or arriving via permalink with no filters
  // loaded yet). Skip the round-trip whenever the row is already in `pageEntries`.
  const entryFetch = useQuery({
    ...auditLogEntryQueryOptions(entryId),
    /** Keep the option's id-validity guard (a malformed `?entryId=` must not
     * reach the server fn) AND skip the round-trip when the row is on-page. */
    enabled: isAuditEntryId(entryId) && !entryOnPage,
  });

  const selectedEntry: t.AuditLogEntryWithDiff | null =
    entryOnPage ?? entryFetch.data?.entry ?? null;
  /** A malformed `entryId` never fetches (guarded above), so treat it as
   * not-found rather than leaving the drawer to latch a previously-opened
   * entry under the bad permalink. */
  const entryNotFound =
    !!entryId &&
    !entryOnPage &&
    (!isAuditEntryId(entryId) || (entryFetch.isSuccess && entryFetch.data?.entry === null));

  const openEntry = useCallback(
    (id: string) => {
      void navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, entryId: id }) });
    },
    [navigate],
  );

  const closeEntry = useCallback(() => {
    void navigate({
      search: (prev: Record<string, unknown>) => {
        /** Keep the audit-log tab explicit so closing a bare `?entryId=`
         * permalink (which has no `tab`) returns to the audit list rather than
         * falling back to the Management tab. */
        const next: Record<string, unknown> = { ...prev, tab: 'audit-log' };
        delete next.entryId;
        return next;
      },
    });
  }, [navigate]);

  const handleCopyPermalink = useCallback(
    async (id: string): Promise<boolean> => {
      if (typeof window === 'undefined') return false;
      if (typeof navigator === 'undefined' || !navigator.clipboard) {
        announce(localize('com_admin_a11y_copy_failed'));
        return false;
      }
      const url = buildEntryPermalink(
        id,
        window.location.origin,
        `${apiBaseUrl()}${ADMIN_BASE_PATH}`,
      );
      try {
        await navigator.clipboard.writeText(url);
        return true;
      } catch {
        announce(localize('com_admin_a11y_copy_failed'));
        return false;
      }
    },
    [announce, localize],
  );

  const handleRowKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTableRowElement>, id: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openEntry(id);
      }
    },
    [openEntry],
  );

  const [exporting, setExporting] = useState(false);

  // Always export via the backend: the client only holds the current page (≤50
  // rows) of a filter that may match thousands. The previous two-path approach
  // silently truncated CSVs whenever the result set fell between the page size
  // and the old `CLIENT_EXPORT_THRESHOLD`.
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      /**
       * Use the immediate input values (not the debounced snapshot) so that
       * a click inside the 300 ms debounce window exports exactly what the
       * user sees in the inputs rather than a stale broader filter set.
       */
      const exportFilters = buildFilters(
        searchFilter.value,
        actorIdFilter.value,
        targetIdFilter.value,
        capabilityFilter.value,
      );
      /** The server fn streams the backend CSV through as a `Response`; turn its
       * body into a Blob for the browser download (no BFF-side buffering). */
      const response = await exportAuditLogServerFn({ data: exportFilters });
      downloadBlob(await response.blob());
    } catch {
      /**
       * Surface the failure to screen readers — without this branch the
       * promise rejects unhandled and the only signal a sighted user gets
       * is the export button toggling out of its loading state with no
       * download arriving. Mirrors `com_admin_a11y_copy_failed` for copy paths.
       */
      announce(localize('com_admin_a11y_audit_export_failed'));
    } finally {
      setExporting(false);
    }
  }, [
    buildFilters,
    searchFilter.value,
    actorIdFilter.value,
    targetIdFilter.value,
    capabilityFilter.value,
    announce,
    localize,
  ]);

  const showLoading = isPending && !data;
  const exportLabel = localize('com_admin_audit_export_server');

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pt-4 pr-1 pl-1">
      <div className="flex items-center justify-between gap-3">
        <div
          className="flex flex-1 flex-wrap items-center gap-3"
          role="group"
          aria-label={localize('com_admin_a11y_filters')}
        >
          <SearchInput
            value={searchFilter.value}
            onChange={searchFilter.onChange}
            placeholder={localize('com_admin_ui_search')}
            ariaLabel={localize('com_admin_audit_search_label')}
            className="relative min-w-50 flex-1"
          />

          <div
            aria-label={localize('com_admin_audit_filter_action_label')}
            role="group"
            className="flex items-center gap-1.5"
          >
            {AUDIT_ACTIONS.map((act) => {
              const selected = actionFilter.includes(act);
              return (
                <Button
                  htmlType="button"
                  key={act}
                  type={selected ? 'primary' : 'secondary'}
                  label={localize(ACTION_LABEL_KEY[act])}
                  aria-pressed={selected}
                  onClick={() => {
                    setActionFilter((prev) =>
                      prev.includes(act) ? prev.filter((a) => a !== act) : [...prev, act],
                    );
                    resetToFirstPage();
                  }}
                />
              );
            })}
          </div>

          <div className="flex items-center gap-1.5">
            <label htmlFor="audit-date-from" className="text-xs text-(--cui-color-text-muted)">
              {localize('com_admin_audit_date_from')}
            </label>
            <DatePickerCell resetKey={dateResetNonce} inputId="audit-date-from">
              <DatePicker
                key={`from-${dateResetNonce}`}
                date={isoDateToDate(dateFrom)}
                onSelectDate={(d) => {
                  setDateFrom(d ? dateToIsoDate(d) : '');
                  resetToFirstPage();
                }}
                placeholder={localize('com_admin_audit_date_from')}
              />
            </DatePickerCell>
          </div>
          <div className="flex items-center gap-1.5">
            <label htmlFor="audit-date-to" className="text-xs text-(--cui-color-text-muted)">
              {localize('com_admin_audit_date_to')}
            </label>
            <DatePickerCell resetKey={dateResetNonce} inputId="audit-date-to">
              <DatePicker
                key={`to-${dateResetNonce}`}
                date={isoDateToDate(dateTo)}
                onSelectDate={(d) => {
                  setDateTo(d ? dateToIsoDate(d) : '');
                  resetToFirstPage();
                }}
                placeholder={localize('com_admin_audit_date_to')}
              />
            </DatePickerCell>
          </div>
          {(dateFrom || dateTo) && (
            <Button
              htmlType="button"
              type="danger"
              iconLeft="cross"
              label={localize('com_admin_ui_clear')}
              aria-label={localize('com_admin_a11y_clear_dates')}
              onClick={() => {
                setDateFrom('');
                setDateTo('');
                setDateResetNonce((n) => n + 1);
                resetToFirstPage();
              }}
            />
          )}
        </div>

        <div className="flex flex-col items-end gap-1">
          <Button
            htmlType="button"
            type="secondary"
            iconLeft="download"
            onClick={() => void handleExport()}
            disabled={displayTotal === 0 || exporting}
            loading={exporting}
            label={exportLabel}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TextField
          label={localize('com_admin_audit_filter_actor_id')}
          value={actorIdFilter.value}
          onChange={actorIdFilter.onChange}
          placeholder={localize('com_admin_audit_filter_actor_id')}
        />
        <TextField
          label={localize('com_admin_audit_filter_target_id')}
          value={targetIdFilter.value}
          onChange={targetIdFilter.onChange}
          placeholder={localize('com_admin_audit_filter_target_id')}
        />
        <div className="select-field-a11y">
          <Select
            label={localize('com_admin_audit_filter_target_type')}
            value={targetTypeFilter === '' ? TARGET_TYPE_ALL : targetTypeFilter}
            onSelect={(v) => {
              setTargetTypeFilter(v === TARGET_TYPE_ALL ? '' : (v as t.AuditTargetType));
              resetToFirstPage();
            }}
            placeholder={localize('com_admin_ui_all')}
          >
            <Select.Item value={TARGET_TYPE_ALL}>{localize('com_admin_ui_all')}</Select.Item>
            {TARGET_TYPE_OPTIONS.map((pt) => (
              <Select.Item key={pt} value={pt}>
                {pt}
              </Select.Item>
            ))}
          </Select>
        </div>
        <TextField
          label={localize('com_admin_audit_filter_capability')}
          value={capabilityFilter.value}
          onChange={capabilityFilter.onChange}
          placeholder={localize('com_admin_audit_filter_capability')}
        />
      </div>

      <div
        className="overflow-x-auto rounded-lg border border-(--cui-color-stroke-default)"
        role="region"
        aria-label={localize('com_admin_audit_title')}
      >
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{localize('com_admin_audit_title')}</caption>
          <thead className="sticky top-0 z-(--z-sticky)">
            <tr className="border-b border-(--cui-color-stroke-default) bg-(--cui-color-background-muted)">
              <th
                scope="col"
                className="w-24 px-4 py-2.5 font-medium text-(--cui-color-text-muted)"
              >
                {localize('com_admin_audit_col_action')}
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium text-(--cui-color-text-muted)">
                {localize('com_admin_audit_col_target')}
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium text-(--cui-color-text-muted)">
                {localize('com_admin_audit_col_capability')}
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium text-(--cui-color-text-muted)">
                {localize('com_admin_audit_col_actor')}
              </th>
              <th
                scope="col"
                className="px-4 py-2.5 font-medium whitespace-nowrap text-(--cui-color-text-muted)"
              >
                {localize('com_admin_audit_col_timestamp')}
              </th>
            </tr>
          </thead>
          <tbody>
            {showLoading && (
              <tr>
                <td colSpan={5}>
                  <LoadingState />
                </td>
              </tr>
            )}
            {!showLoading && isError && (
              <tr>
                <td colSpan={5}>
                  <EmptyState message={localize('com_admin_audit_error')} />
                </td>
              </tr>
            )}
            {!showLoading &&
              !isError &&
              pageEntries.map((entry, i) => (
                <AuditLogTableRow
                  key={entry.id}
                  entry={entry}
                  isLast={i === pageEntries.length - 1}
                  onActivate={() => openEntry(entry.id)}
                  onKeyDown={(e) => handleRowKeyDown(e, entry.id)}
                  localize={localize}
                />
              ))}
            {!showLoading && !isError && pageEntries.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <EmptyState message={localize('com_admin_audit_empty')} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={displayTotalPages}
        onPageChange={setCurrentPage}
      />

      {/*
        Hide the count footer entirely on error so the aria-live region does
        not contradict the table EmptyState by announcing "No entries" when
        the actual situation is "failed to load". The visible table already
        carries the error message; doubling up here would mislead screen
        readers and produce mixed signals.
      */}
      {!isError && (
        <div className="flex items-center justify-between gap-3 pb-4">
          <p
            className="text-xs text-(--cui-color-text-muted)"
            aria-live="polite"
            aria-atomic="true"
          >
            {localize('com_admin_audit_entry_count', { count: displayTotal })}
          </p>
        </div>
      )}

      <ScreenReaderAnnouncer message={announcement} />

      <AuditLogDetailDrawer
        entry={selectedEntry}
        /**
         * Drawer is open whenever a deep-link `entryId` is in the URL. This
         * keeps the panel mounted (showing a Loading state inside) while the
         * single-entry fetch is in flight after navigating off the row's
         * page or arriving on a cold permalink; without this, `open` was
         * false until the fetch resolved and the drawer either flickered or
         * never appeared.
         */
        open={!!entryId}
        loading={!!entryId && entryFetch.isFetching && !entryOnPage && !entryNotFound}
        notFound={entryNotFound}
        /**
         * Non-404 fetch failures (5xx, network) leave `entryNotFound` false
         * because that flag requires `isSuccess` + `entry === null` for a
         * positive 404. Without this signal the drawer would render no
         * content while `open` stayed true — `entryId` stuck in the URL with
         * no panel and no way to close. Surfacing the error gets a proper
         * dialog shell with an error message and a close affordance.
         */
        loadError={!!entryId && !entryOnPage && entryFetch.isError}
        onClose={closeEntry}
        onCopyPermalink={handleCopyPermalink}
        onCopyFailed={() => announce(localize('com_admin_a11y_copy_failed'))}
      />
    </div>
  );
}

function AuditLogTableRow({
  entry,
  isLast,
  onActivate,
  onKeyDown,
  localize,
}: {
  entry: t.AuditLogEntryWithDiff;
  isLast: boolean;
  onActivate: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTableRowElement>) => void;
  localize: ReturnType<typeof useLocalize>;
}) {
  const targetConfig = auditTargetConfig(entry.target.type);
  const subject = auditSubject(entry, localize);
  return (
    <tr
      role="button"
      tabIndex={0}
      aria-label={localize('com_admin_a11y_audit_row_open')}
      onClick={onActivate}
      onKeyDown={onKeyDown}
      className={cn(
        'cursor-pointer bg-(--cui-color-background-panel) outline-none hover:bg-(--cui-color-background-hover) focus-visible:bg-(--cui-color-background-hover) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--cui-color-outline)',
        !isLast && 'border-b border-(--cui-color-stroke-default)',
      )}
    >
      <td className="px-4 py-3">
        <Badge
          size="sm"
          state={ACTION_BADGE_STATE[entry.action]}
          text={localize(ACTION_LABEL_KEY[entry.action])}
        />
      </td>
      <td className="px-4 py-3">
        <span className="flex items-center gap-2">
          <Badge
            size="sm"
            state="neutral"
            text={
              <span className="inline-flex items-center gap-1">
                <DecorativeIcon name={targetConfig.icon} size="xs" />
                {localize(targetConfig.labelKey)}
              </span>
            }
          />
          <span className="text-(--cui-color-text-default)">
            {entry.target.name ?? entry.target.id}
          </span>
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="text-(--cui-color-text-default)">{subject.label}</span>
          <span aria-hidden="true" className="text-3xs text-(--cui-color-text-muted)">
            {subject.value}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 font-medium text-(--cui-color-text-default)">{entry.actor.name}</td>
      <td className="px-4 py-3 text-xs whitespace-nowrap text-(--cui-color-text-muted)">
        <time dateTime={entry.timestamp}>{formatTimestamp(entry.timestamp)}</time>
      </td>
    </tr>
  );
}
