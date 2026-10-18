import { useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import * as Ariakit from '@ariakit/react';
import { disabledInkClasses } from '@librechat/client';
import {
  ADMIN_PLATFORM_SCOPE,
  AdminErrorCode,
  OrganizationLifecycle,
} from 'librechat-data-provider';
import type { TAdminOrganization } from 'librechat-data-provider';
import { organizationQueryOptions, organizationsQueryOptions } from '~/admin/api';
import { useSwitchAdminScope } from '~/admin/hooks/useAdminScope';
import { useQuery, keepPreviousData } from '~/admin/query';
import { adminErrorCode } from '~/admin/utils/errors';
import { adminScopeAtom } from '~/admin/store';
import { useLocalize } from '~/admin/hooks';
import { notifyError } from '~/admin/utils';
import { useDebounce } from '~/hooks';
import { cn } from '~/admin/utils';
import { Icon } from '~/admin/ui';

const RESULTS = 20;

const ITEM_CLASS = cn(
  'text-text-primary data-active-item:bg-surface-hover aria-selected:font-medium flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
  disabledInkClasses,
);

/**
 * Where the panel acts (organizations mode): the platform, whose settings every organization
 * inherits, or one organization. The choice lives in this tab only.
 */
export function ScopePicker() {
  const localize = useLocalize();
  const scope = useAtomValue(adminScopeAtom);
  const switchScope = useSwitchAdminScope();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const term = useDebounce(search.trim(), 250);
  const atPlatform = scope === ADMIN_PLATFORM_SCOPE;

  const current = useQuery(organizationQueryOptions(atPlatform ? undefined : scope));
  const results = useQuery({
    ...organizationsQueryOptions({ search: term || undefined, limit: RESULTS }),
    enabled: open,
    placeholderData: keepPreviousData,
  });

  /* A scope kept from earlier in this tab can name an organization deleted since. */
  const gone =
    !atPlatform &&
    ((current.isError && adminErrorCode(current.error) === AdminErrorCode.ORGANIZATION_NOT_FOUND) ||
      current.data?.organization.status === OrganizationLifecycle.DELETING);
  useEffect(() => {
    if (gone) {
      notifyError(localize('com_admin_acting_in_reset'));
      switchScope(ADMIN_PLATFORM_SCOPE);
    }
  }, [gone, localize, switchScope]);

  const platformLabel = localize('com_admin_acting_in_platform');
  const currentLabel = atPlatform
    ? platformLabel
    : (current.data?.organization.name ?? localize('com_ui_loading'));
  const organizations: TAdminOrganization[] = results.data?.organizations ?? [];

  return (
    <Ariakit.ComboboxProvider resetValueOnHide setValue={setSearch} open={open} setOpen={setOpen}>
      <Ariakit.SelectProvider
        value={scope}
        setValue={(next) => {
          if (typeof next === 'string' && next !== scope) {
            switchScope(next);
          }
        }}
      >
        <Ariakit.Select
          aria-label={localize('com_admin_acting_in_label', { scope: currentLabel })}
          className="flex h-8 max-w-64 min-w-0 items-center gap-2 rounded-lg border border-(--cui-color-stroke-default) bg-transparent px-2.5 text-sm text-(--cui-color-text-default) transition-colors hover:bg-(--cui-color-background-hover) focus-visible:ring-2 focus-visible:ring-(--focus-ring-color) focus-visible:outline-hidden"
        >
          <Icon name={atPlatform ? 'globe' : 'building'} size="sm" aria-hidden />
          <span className="truncate">{currentLabel}</span>
          <Icon name="chevron-down" size="xs" aria-hidden className="text-text-secondary" />
        </Ariakit.Select>
        <Ariakit.SelectPopover
          gutter={4}
          unmountOnHide
          className="border-border-light bg-surface-primary z-(--z-command) flex max-h-96 w-72 flex-col gap-0.5 overflow-auto rounded-lg border p-1 shadow-lg"
        >
          <Ariakit.Combobox
            autoSelect
            placeholder={localize('com_admin_acting_in_search')}
            aria-label={localize('com_admin_acting_in_search')}
            className="border-border-light bg-surface-primary text-text-primary mb-1 rounded-md border px-2 py-1.5 text-sm outline-hidden"
          />
          <Ariakit.ComboboxList aria-busy={results.isFetching}>
            <Ariakit.SelectItem
              value={ADMIN_PLATFORM_SCOPE}
              className={ITEM_CLASS}
              render={<Ariakit.ComboboxItem />}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Icon name="globe" size="sm" aria-hidden />
                <span className="truncate">{platformLabel}</span>
              </span>
              <Ariakit.SelectItemCheck className="text-text-secondary size-4" />
            </Ariakit.SelectItem>
            <Ariakit.SelectGroup className="flex flex-col">
              <Ariakit.SelectGroupLabel className="text-text-secondary px-2 pt-2 pb-1 text-xs font-medium">
                {localize('com_admin_nav_organizations')}
              </Ariakit.SelectGroupLabel>
              {results.isPending && (
                <p className="text-text-secondary px-2 py-1.5 text-sm">
                  {localize('com_ui_loading')}
                </p>
              )}
              {results.isError && (
                <p role="alert" className="text-text-destructive px-2 py-1.5 text-sm">
                  {localize('com_admin_acting_in_load_failed')}
                </p>
              )}
              {!results.isPending && !results.isError && organizations.length === 0 && (
                <p className="text-text-secondary px-2 py-1.5 text-sm">
                  {localize('com_admin_orgs_empty')}
                </p>
              )}
              {organizations.map((organization) => (
                <Ariakit.SelectItem
                  key={organization.id}
                  value={organization.id}
                  disabled={organization.status === OrganizationLifecycle.DELETING}
                  className={ITEM_CLASS}
                  render={<Ariakit.ComboboxItem />}
                >
                  <span className="truncate">{organization.name}</span>
                  <Ariakit.SelectItemCheck className="text-text-secondary size-4" />
                </Ariakit.SelectItem>
              ))}
            </Ariakit.SelectGroup>
          </Ariakit.ComboboxList>
        </Ariakit.SelectPopover>
      </Ariakit.SelectProvider>
    </Ariakit.ComboboxProvider>
  );
}
