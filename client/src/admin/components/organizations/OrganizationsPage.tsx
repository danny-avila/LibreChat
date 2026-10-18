import { useState } from 'react';
import { OrganizationLifecycle } from 'librechat-data-provider';
import type { TAdminOrganization } from 'librechat-data-provider';
import {
  EmptyState,
  LoadingState,
  SearchInput,
  ScreenReaderAnnouncer,
} from '~/admin/components/shared';
import { useAnnouncement, useDebouncedFilter, useLocalize } from '~/admin/hooks';
import { OrganizationDetailDialog } from './OrganizationDetailDialog';
import { OrganizationStatusBadge } from './OrganizationStatusBadge';
import { useQuery, keepPreviousData } from '~/admin/query';
import { adminErrorMessage } from '~/admin/utils/errors';
import { organizationsQueryOptions } from '~/admin/api';
import { Alert, Button, Select } from '~/admin/ui';
import { cn } from '~/admin/utils';

const PAGE_SIZE = 25;

const STATUS_FILTERS: Array<{ value: string; labelKey: string }> = [
  { value: '', labelKey: 'com_admin_orgs_status_all' },
  { value: OrganizationLifecycle.ACTIVE, labelKey: 'com_admin_orgs_status_active' },
  { value: OrganizationLifecycle.SUSPENDED, labelKey: 'com_admin_orgs_status_suspended' },
  { value: OrganizationLifecycle.DELETING, labelKey: 'com_admin_orgs_status_deleting' },
];

/**
 * Every organization on the platform, for the operator: search, filter by status, page through,
 * and open one to rename, suspend, reactivate, delete, manage or enter it.
 */
export function OrganizationsPage() {
  const localize = useLocalize();
  const { message: announcement, announce } = useAnnouncement();
  const [status, setStatus] = useState('');
  /** The cursors of the pages before the current one, so Previous can go back. */
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const [selected, setSelected] = useState<string | null>(null);
  const search = useDebouncedFilter('', () => setCursors([undefined]));
  const after = cursors[cursors.length - 1];

  const query = useQuery({
    ...organizationsQueryOptions({
      search: search.debouncedValue.trim() || undefined,
      status: status || undefined,
      limit: PAGE_SIZE,
      after,
    }),
    placeholderData: keepPreviousData,
  });
  const organizations: TAdminOrganization[] = query.data?.organizations ?? [];
  const nextCursor = query.data?.nextCursor;

  const renderBody = () => {
    if (query.isPending) {
      return <LoadingState />;
    }
    if (query.isError) {
      return (
        <div className="flex flex-col items-start gap-3">
          <Alert state="danger" text={adminErrorMessage(query.error, localize)} />
          <Button
            type="secondary"
            label={localize('com_admin_ui_retry')}
            onClick={() => query.refetch()}
          />
        </div>
      );
    }
    if (organizations.length === 0) {
      return <EmptyState message={localize('com_admin_orgs_empty')} />;
    }
    return (
      <div className="overflow-x-auto rounded-lg border border-(--cui-color-stroke-default)">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{localize('com_admin_orgs_title')}</caption>
          <thead>
            <tr className="border-b border-(--cui-color-stroke-default) bg-(--cui-color-background-muted)">
              {[
                'com_admin_orgs_col_name',
                'com_admin_orgs_col_status',
                'com_admin_orgs_col_members',
                'com_admin_orgs_col_admins',
                'com_admin_orgs_col_created',
              ].map((key) => (
                <th
                  key={key}
                  scope="col"
                  className="px-4 py-2.5 font-medium text-(--cui-color-text-muted)"
                >
                  {localize(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {organizations.map((organization, index) => (
              <OrganizationRow
                key={organization.id}
                organization={organization}
                isLast={index === organizations.length - 1}
                onOpen={() => setSelected(organization.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div
      role="region"
      aria-label={localize('com_admin_orgs_title')}
      className="flex flex-1 flex-col gap-4 overflow-auto p-6"
    >
      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          value={search.value}
          onChange={search.onChange}
          placeholder={localize('com_admin_orgs_search')}
          className="relative min-w-60 flex-1"
        />
        <div className="w-48">
          <Select
            aria-label={localize('com_admin_orgs_status_filter')}
            value={status}
            onSelect={(next) => {
              setStatus(next);
              setCursors([undefined]);
              announce(localize('com_admin_orgs_filter_changed'));
            }}
            options={STATUS_FILTERS.map((filter) => ({
              value: filter.value,
              label: localize(filter.labelKey),
            }))}
          />
        </div>
      </div>

      <div aria-busy={query.isFetching}>{renderBody()}</div>

      {(cursors.length > 1 || nextCursor) && (
        <nav
          aria-label={localize('com_admin_a11y_pagination')}
          className="flex items-center justify-end gap-2"
        >
          <Button
            type="secondary"
            iconLeft="chevron-left"
            label={localize('com_admin_a11y_previous_page')}
            disabled={cursors.length <= 1}
            onClick={() => setCursors((current) => current.slice(0, -1))}
          />
          <Button
            type="secondary"
            iconRight="chevron-right"
            label={localize('com_admin_a11y_next_page')}
            disabled={!nextCursor}
            onClick={() => nextCursor && setCursors((current) => [...current, nextCursor])}
          />
        </nav>
      )}

      <OrganizationDetailDialog organizationId={selected} onClose={() => setSelected(null)} />
      <ScreenReaderAnnouncer message={announcement} />
    </div>
  );
}

function OrganizationRow({
  organization,
  isLast,
  onOpen,
}: {
  organization: TAdminOrganization;
  isLast: boolean;
  onOpen: () => void;
}) {
  const localize = useLocalize();
  const creator = organization.createdBy?.email ?? organization.createdBy?.name;
  return (
    <tr
      className={cn(
        'bg-(--cui-color-background-panel) transition-colors hover:bg-(--cui-color-background-hover)',
        !isLast && 'border-b border-(--cui-color-stroke-default)',
      )}
    >
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={onOpen}
          className="flex flex-col text-left focus-visible:ring-2 focus-visible:ring-(--focus-ring-color) focus-visible:outline-hidden"
          aria-label={localize('com_admin_orgs_open', { name: organization.name })}
        >
          <span className="font-medium text-(--cui-color-text-default)">{organization.name}</span>
          {creator && (
            <span className="text-xs text-(--cui-color-text-muted)">
              {localize('com_admin_orgs_created_by', { name: creator })}
            </span>
          )}
        </button>
      </td>
      <td className="px-4 py-3">
        <OrganizationStatusBadge status={organization.status} />
      </td>
      <td className="px-4 py-3 text-(--cui-color-text-default) tabular-nums">
        {organization.memberCount}
      </td>
      <td className="px-4 py-3 text-(--cui-color-text-default) tabular-nums">
        {organization.adminCount}
      </td>
      <td className="px-4 py-3 text-(--cui-color-text-muted)">
        {organization.createdAt ? new Date(organization.createdAt).toLocaleDateString() : '—'}
      </td>
    </tr>
  );
}
