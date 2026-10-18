import { useState } from 'react';
import { OrganizationMemberStatus } from 'librechat-data-provider';
import type { TAdminAccount, TAdminAccountDetail } from 'librechat-data-provider';
import { Avatar, EmptyState, LoadingState, SearchInput } from '~/admin/components/shared';
import { OrganizationStatusBadge } from '~/admin/components/organizations';
import { accountQueryOptions, accountsQueryOptions } from '~/admin/api';
import { useSwitchAdminScope } from '~/admin/hooks/useAdminScope';
import { useDebouncedFilter, useLocalize } from '~/admin/hooks';
import { useQuery, keepPreviousData } from '~/admin/query';
import { Alert, Badge, Button, Dialog } from '~/admin/ui';
import { adminErrorMessage } from '~/admin/utils/errors';
import { cn } from '~/admin/utils';

const PAGE_SIZE = 25;

/**
 * Everyone who can sign in to the platform, for the operator at the platform scope: one login
 * account per person, with the organizations it belongs to. Members of one organization are
 * listed on this page when that organization is the scope.
 */
export function AccountsPage() {
  const localize = useLocalize();
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const [selected, setSelected] = useState<string | null>(null);
  const search = useDebouncedFilter('', () => setCursors([undefined]));
  const after = cursors[cursors.length - 1];

  const query = useQuery({
    ...accountsQueryOptions({
      search: search.debouncedValue.trim() || undefined,
      limit: PAGE_SIZE,
      after,
    }),
    placeholderData: keepPreviousData,
  });
  const accounts: TAdminAccount[] = query.data?.accounts ?? [];
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
    if (accounts.length === 0) {
      return <EmptyState message={localize('com_admin_accounts_empty')} />;
    }
    return (
      <ul
        aria-label={localize('com_admin_accounts_title')}
        className="divide-y divide-(--cui-color-stroke-default) overflow-hidden rounded-lg border border-(--cui-color-stroke-default)"
      >
        {accounts.map((account) => (
          <li key={account.id}>
            <button
              type="button"
              onClick={() => setSelected(account.id)}
              className="flex w-full items-center gap-3 bg-(--cui-color-background-panel) px-4 py-3 text-left transition-colors hover:bg-(--cui-color-background-hover) focus-visible:ring-2 focus-visible:ring-(--focus-ring-color) focus-visible:outline-hidden focus-visible:ring-inset"
            >
              <Avatar name={account.name || account.email} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium text-(--cui-color-text-default)">
                  {account.name || account.email}
                </span>
                <span className="truncate text-xs text-(--cui-color-text-muted)">
                  {account.email}
                </span>
              </span>
              {account.isPlatformOperator && (
                <Badge state="info" text={localize('com_admin_accounts_operator')} />
              )}
              {account.emailVerified === false && (
                <Badge state="warning" text={localize('com_admin_accounts_unverified')} />
              )}
              <span className="hidden text-xs text-(--cui-color-text-muted) sm:inline">
                {account.createdAt ? new Date(account.createdAt).toLocaleDateString() : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div
      role="region"
      aria-label={localize('com_admin_accounts_title')}
      className="flex flex-1 flex-col gap-4 overflow-auto p-6"
    >
      <p className="text-sm text-(--cui-color-text-muted)">
        {localize('com_admin_accounts_description')}
      </p>
      <SearchInput
        value={search.value}
        onChange={search.onChange}
        placeholder={localize('com_admin_accounts_search')}
        className="relative max-w-xl"
      />
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
      <AccountDetailDialog accountId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function AccountDetailDialog({
  accountId,
  onClose,
}: {
  accountId: string | null;
  onClose: () => void;
}) {
  const localize = useLocalize();
  const switchScope = useSwitchAdminScope();
  const query = useQuery(accountQueryOptions(accountId ?? undefined));
  const account: TAdminAccountDetail | undefined = query.data?.account;

  const renderBody = () => {
    if (query.isPending) {
      return <LoadingState />;
    }
    if (query.isError || !account) {
      return <Alert state="danger" text={adminErrorMessage(query.error, localize)} />;
    }
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Avatar name={account.name || account.email} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-(--cui-color-text-default)">
              {account.name || account.email}
            </span>
            <span className="truncate text-sm text-(--cui-color-text-muted)">{account.email}</span>
          </div>
        </div>
        <section aria-labelledby="account-memberships" className="flex flex-col gap-2">
          <h3
            id="account-memberships"
            className="text-sm font-semibold text-(--cui-color-text-default)"
          >
            {localize('com_admin_accounts_memberships')}
          </h3>
          {account.memberships.length === 0 ? (
            <p className="text-sm text-(--cui-color-text-muted)">
              {localize('com_admin_accounts_no_memberships')}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {account.memberships.map((membership) => (
                <li
                  key={membership.organization.id}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-2 py-1.5',
                    'hover:bg-(--cui-color-background-hover)',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-(--cui-color-text-default)">
                      {membership.organization.name}
                    </span>
                    <span className="block text-xs text-(--cui-color-text-muted)">
                      {localize('com_admin_accounts_membership', {
                        role: membership.role,
                        status: localize(
                          membership.status === OrganizationMemberStatus.ACTIVE
                            ? 'com_admin_accounts_member_active'
                            : 'com_admin_accounts_member_deactivated',
                        ),
                      })}
                    </span>
                  </span>
                  <OrganizationStatusBadge status={membership.organization.status} />
                  <Button
                    type="empty"
                    label={localize('com_admin_orgs_manage')}
                    aria-label={localize('com_admin_orgs_manage_named', {
                      name: membership.organization.name,
                    })}
                    onClick={() => {
                      onClose();
                      switchScope(membership.organization.id);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  };

  return (
    <Dialog
      open={accountId != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Content
        title={localize('com_admin_accounts_detail_title')}
        showClose
        onClose={onClose}
        className="max-w-lg!"
      >
        {renderBody()}
      </Dialog.Content>
    </Dialog>
  );
}
