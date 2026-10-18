import { useId, useState } from 'react';
import { OrganizationLifecycle } from 'librechat-data-provider';
import {
  Input,
  Label,
  Spinner,
  OGDialog,
  OGDialogTemplate,
  disabledInkClasses,
} from '@librechat/client';
import type { TAdminOrganization } from 'librechat-data-provider';
import type { RefObject } from 'react';
import { useAdminOrganizationsQuery } from '~/data-provider';
import { useLocalize, useDebounce } from '~/hooks';
import { cn } from '~/utils';

const PAGE_SIZE = 25;

function StatusLabel({ status }: { status: string }) {
  const localize = useLocalize();
  if (status === OrganizationLifecycle.SUSPENDED) {
    return (
      <span className="bg-status-warning-subtle text-status-warning rounded-full px-2 py-0.5 text-xs font-medium">
        {localize('com_nav_org_status_suspended')}
      </span>
    );
  }
  if (status === OrganizationLifecycle.DELETING) {
    return (
      <span className="bg-alert-error-fill text-status-error rounded-full px-2 py-0.5 text-xs font-medium">
        {localize('com_nav_org_status_deleting')}
      </span>
    );
  }
  return null;
}

/**
 * The platform operator's way into any organization: search the platform's organizations and
 * enter one with full access. The visit is recorded on the platform's audit log only.
 */
export default function AllOrganizationsDialog({
  open,
  onOpenChange,
  triggerRef,
  currentId,
  busy,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  /** The organization the session acts in now. */
  currentId?: string;
  busy: boolean;
  onSelect: (organizationId: string) => void;
}) {
  const localize = useLocalize();
  const searchId = useId();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search.trim(), 300);
  const { data, isLoading, isError, isFetching } = useAdminOrganizationsQuery(
    { search: debounced || undefined, limit: PAGE_SIZE },
    { enabled: open },
  );
  const organizations: TAdminOrganization[] = data?.organizations ?? [];

  const renderResults = () => {
    if (isLoading) {
      return (
        <div role="status" className="flex justify-center py-6">
          <Spinner className="size-5" aria-hidden="true" />
          <span className="sr-only">{localize('com_ui_loading')}</span>
        </div>
      );
    }
    if (isError) {
      return (
        <p role="alert" className="text-status-error py-4 text-center text-sm">
          {localize('com_nav_org_all_error')}
        </p>
      );
    }
    if (organizations.length === 0) {
      return (
        <p className="text-text-secondary py-4 text-center text-sm">
          {localize('com_nav_org_all_empty')}
        </p>
      );
    }
    return (
      <ul className="flex flex-col gap-1" aria-label={localize('com_nav_org_all_title')}>
        {organizations.map((organization) => {
          const current = organization.id === currentId;
          const closed = organization.status === OrganizationLifecycle.DELETING;
          return (
            <li key={organization.id}>
              <button
                type="button"
                disabled={busy || current || closed}
                aria-current={current ? 'true' : undefined}
                onClick={() => onSelect(organization.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm',
                  'hover:bg-surface-hover focus-visible:ring-ring-primary focus-visible:ring-2 focus-visible:outline-hidden',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                  disabledInkClasses,
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="text-text-primary block truncate font-medium">
                    {organization.name}
                  </span>
                  <span className="text-text-secondary block truncate text-xs">
                    {localize('com_nav_org_all_members', { 0: organization.memberCount })}
                  </span>
                </span>
                <StatusLabel status={organization.status} />
                {current && (
                  <span className="text-text-secondary text-xs">
                    {localize('com_nav_org_all_current')}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <OGDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setSearch('');
        }
      }}
      triggerRef={triggerRef}
    >
      <OGDialogTemplate
        title={localize('com_nav_org_all_title')}
        description={localize('com_nav_org_all_description')}
        className="w-11/12 max-w-lg"
        showCancelButton={false}
        main={
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor={searchId}>{localize('com_nav_org_all_search')}</Label>
              <Input
                id={searchId}
                type="search"
                value={search}
                maxLength={100}
                autoComplete="off"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="max-h-80 overflow-y-auto" aria-busy={isFetching}>
              {renderResults()}
            </div>
            {data?.nextCursor != null && (
              <p className="text-text-secondary text-xs">
                {localize('com_nav_org_all_more', { 0: PAGE_SIZE })}
              </p>
            )}
          </div>
        }
      />
    </OGDialog>
  );
}
