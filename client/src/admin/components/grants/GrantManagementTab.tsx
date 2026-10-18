import { useMemo, useRef, useState } from 'react';
import type * as t from '~/admin/types';
import {
  EmptyState,
  LoadingState,
  Pagination,
  ScreenReaderAnnouncer,
  SearchInput,
} from '~/admin/components/shared';
import { aggregatePrincipals, buildRoleNames, filterPrincipals } from './utils';
import { allGrantsQueryOptions, allRolesQueryOptions } from '~/admin/api';
import { EditCapabilitiesDialog } from './EditCapabilitiesDialog';
import { useAnnouncement, useLocalize } from '~/admin/hooks';
import { GrantTableRow } from './GrantTableRow';
import { useQuery } from '~/admin/query';

const PAGE_SIZE = 50;

export function GrantManagementTab() {
  const localize = useLocalize();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editTarget, setEditTarget] = useState<t.PrincipalRow | null>(null);
  const { message: announcement, announce } = useAnnouncement();
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  const { data: grants = [], isLoading: grantsLoading } = useQuery(allGrantsQueryOptions);
  const { data: roles = [] } = useQuery(allRolesQueryOptions);

  const roleNames = useMemo(() => buildRoleNames(roles), [roles]);

  const principals = useMemo(() => aggregatePrincipals(grants, roleNames), [grants, roleNames]);

  const filtered = useMemo(() => filterPrincipals(principals, search), [principals, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
    const count = filterPrincipals(principals, value).length;
    announce(localize('com_admin_a11y_cap_filter_changed', { count }));
  };

  const handleDialogClose = () => {
    const key = editTarget ? `${editTarget.principalType}:${editTarget.principalId}` : null;
    setEditTarget(null);
    if (key) {
      requestAnimationFrame(() => rowRefs.current.get(key)?.focus());
    }
  };

  if (grantsLoading) {
    return <LoadingState />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-2 pr-1">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={handleSearchChange}
          placeholder={localize('com_admin_ui_search')}
          className="relative flex-1"
        />
      </div>

      {/* Raw <table> kept (not click-ui Table): rows act as buttons with tabIndex,
          role, aria-label, onKeyDown, and a ref for focus restoration — semantics
          the click-ui Table API does not expose. Matches AuditLogTab's choice. */}
      <div className="overflow-x-auto rounded-lg border border-(--cui-color-stroke-default)">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{localize('com_admin_grants_title')}</caption>
          <thead>
            <tr className="border-b border-(--cui-color-stroke-default) bg-(--cui-color-background-muted)">
              <th scope="col" className="px-4 py-2.5 font-medium text-(--cui-color-text-muted)">
                {localize('com_admin_cap_col_name')}
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium text-(--cui-color-text-muted)">
                {localize('com_admin_cap_col_capabilities')}
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium text-(--cui-color-text-muted)">
                {localize('com_admin_cap_col_status')}
              </th>
            </tr>
          </thead>
          <tbody>
            {paged.map((row, i) => {
              const key = `${row.principalType}:${row.principalId}`;
              return (
                <GrantTableRow
                  key={key}
                  row={row}
                  isLast={i === paged.length - 1}
                  onClick={() => setEditTarget(row)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setEditTarget(row);
                    }
                  }}
                  rowRef={(el) => {
                    if (el) rowRefs.current.set(key, el);
                  }}
                />
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3}>
                  <EmptyState message={localize('com_admin_cap_empty')} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />

      <EditCapabilitiesDialog
        principalType={editTarget?.principalType ?? null}
        principalId={editTarget?.principalId ?? null}
        principalName={editTarget?.name ?? ''}
        onClose={handleDialogClose}
      />

      <ScreenReaderAnnouncer message={announcement} />
    </div>
  );
}
