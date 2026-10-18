import { useId, useRef, useState } from 'react';
import { useSetAtom } from 'jotai';
import * as Ariakit from '@ariakit/react';
import { Plus, Settings2, MailPlus, Building2 } from 'lucide-react';
import { SettingsTabValues, OrganizationLifecycle } from 'librechat-data-provider';
import { DropdownPopup, TooltipAnchor, Button, useToastContext } from '@librechat/client';
import type * as t from '~/common';
import {
  useOrganizationsQuery,
  useGetStartupConfig,
  useSwitchOrganizationMutation,
  usePendingOrganizationInvitesQuery,
  useAcceptPendingOrganizationInviteMutation,
} from '~/data-provider';
import { settingsOpenAtom, settingsInitialTabAtom } from '~/components/Nav/Settings';
import { useAuthContext, useLocalize, useOrganizationErrorMessage } from '~/hooks';
import CreateOrganizationDialog from './CreateOrganizationDialog';
import AllOrganizationsDialog from './AllOrganizationsDialog';
import { cn, enterOrganizationSession } from '~/utils';

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

/**
 * The organization the session acts in, and the way to another: every organization the
 * account belongs to, invitations waiting for it, creating a new one, and the current one's
 * settings. Switching reloads the app into the chosen organization.
 */
export default function OrganizationSwitcher({ className }: { className?: string }) {
  const localize = useLocalize();
  const menuId = useId();
  const { showToast } = useToastContext();
  const getOrganizationError = useOrganizationErrorMessage();
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuthContext();
  const isOperator = user?.isPlatformOperator === true;
  const [createOpen, setCreateOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const allButtonRef = useRef<HTMLButtonElement>(null);
  const setShowSettings = useSetAtom(settingsOpenAtom);
  const setSettingsTab = useSetAtom(settingsInitialTabAtom);
  const { data: startupConfig } = useGetStartupConfig();
  const organizationsEnabled = startupConfig?.organizations?.enabled === true;
  const { data } = useOrganizationsQuery(undefined, { enabled: organizationsEnabled });
  const { data: pending } = usePendingOrganizationInvitesQuery(undefined, {
    enabled: organizationsEnabled && isOpen,
  });

  const onError = (error: unknown) =>
    showToast({ message: getOrganizationError(error), status: 'error' });
  const switchOrganization = useSwitchOrganizationMutation({
    onSuccess: (session) => enterOrganizationSession(session.organization.id),
    onError,
  });
  const acceptInvite = useAcceptPendingOrganizationInviteMutation(undefined, {
    onSuccess: (session) => enterOrganizationSession(session.organization.id),
    onError,
  });

  if (!organizationsEnabled || !data) {
    return null;
  }

  const memberships = data.organizations;
  const current = memberships.find((membership) => membership.current);
  const currentName = current?.organization.name ?? '';
  const busy = switchOrganization.isLoading || acceptInvite.isLoading;
  /* The operator's visits never count toward the limit, as on the server. */
  const joined = memberships.filter((membership) => membership.visiting !== true).length;
  const atLimit = joined >= (startupConfig?.organizations?.maxPerAccount ?? Infinity);

  const pendingInvites = pending?.invites ?? [];
  const canCreate = startupConfig?.organizations?.allowCreate !== false && !atLimit;
  /** The label names a state that changes what choosing the organization does. */
  const labelOf = (membership: (typeof memberships)[number]): string => {
    const { name, status } = membership.organization;
    if (membership.visiting) {
      return localize('com_nav_org_visiting', { 0: name });
    }
    return status === OrganizationLifecycle.SUSPENDED
      ? localize('com_nav_org_suspended', { 0: name })
      : name;
  };
  /* Only the operator can enter a suspended organization; for everyone else it stays listed. */
  const isClosed = (membership: (typeof memberships)[number]): boolean =>
    !isOperator &&
    !membership.current &&
    membership.organization.status != null &&
    membership.organization.status !== OrganizationLifecycle.ACTIVE;
  /* A `separate` entry renders only a divider, so dividers are entries of their own. */
  const items: t.MenuItemProps[] = [
    ...memberships.map(
      (membership): t.MenuItemProps => ({
        id: `organization-${membership.organization.id}`,
        label: labelOf(membership),
        ariaChecked: membership.current,
        ariaRole: 'menuitemradio',
        disabled: busy || isClosed(membership),
        onClick: () => {
          if (!membership.current) {
            switchOrganization.mutate(membership.organization.id);
          }
        },
      }),
    ),
    { id: 'organization-invites-divider', separate: true, show: pendingInvites.length > 0 },
    ...pendingInvites.map(
      (invite): t.MenuItemProps => ({
        id: `organization-invite-${invite.id}`,
        label: localize('com_auth_join_org', { 0: invite.organization.name }),
        icon: <MailPlus className="text-text-secondary size-4" aria-hidden="true" />,
        disabled: busy,
        onClick: () => acceptInvite.mutate(invite.id),
      }),
    ),
    { id: 'organization-actions-divider', separate: true },
    {
      id: 'organization-all',
      label: localize('com_nav_org_all'),
      icon: <Building2 className="text-text-secondary size-4" aria-hidden="true" />,
      show: isOperator,
      onClick: () => setAllOpen(true),
      /** NOTE: THE FOLLOWING PROPS ARE REQUIRED FOR MENU ITEMS THAT OPEN DIALOGS */
      hideOnClick: false,
      ref: allButtonRef,
      render: (props) => <button {...props} data-testid="all-organizations-menu-item" />,
    },
    {
      id: 'organization-create',
      label: localize('com_nav_org_create'),
      icon: <Plus className="text-text-secondary size-4" aria-hidden="true" />,
      show: canCreate,
      onClick: () => setCreateOpen(true),
      /** NOTE: THE FOLLOWING PROPS ARE REQUIRED FOR MENU ITEMS THAT OPEN DIALOGS */
      hideOnClick: false,
      ref: createButtonRef,
      render: (props) => <button {...props} data-testid="create-organization-menu-item" />,
    },
    {
      id: 'organization-settings',
      label: localize('com_nav_org_settings'),
      icon: <Settings2 className="text-text-secondary size-4" aria-hidden="true" />,
      onClick: () => {
        setSettingsTab(SettingsTabValues.ORGANIZATION);
        setShowSettings(true);
      },
    },
  ];

  const description = localize('com_nav_org_current', { 0: currentName });

  return (
    <>
      <DropdownPopup
        portal={true}
        menuId={menuId}
        focusLoop={true}
        unmountOnHide={true}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        items={items}
        trigger={
          <TooltipAnchor
            side="right"
            description={description}
            render={
              <Ariakit.MenuButton
                data-testid="organization-switcher"
                aria-label={`${localize('com_nav_org_switcher')}. ${description}`}
                aria-expanded={isOpen}
                render={
                  <Button size="icon" variant="nav" className={cn('h-9 w-9 shrink-0', className)} />
                }
              >
                <span
                  aria-hidden="true"
                  className="bg-surface-tertiary text-text-primary flex size-7 items-center justify-center rounded-md text-sm font-semibold"
                >
                  {initialOf(currentName)}
                </span>
              </Ariakit.MenuButton>
            }
          />
        }
      />
      <CreateOrganizationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        triggerRef={createButtonRef}
      />
      {isOperator && (
        <AllOrganizationsDialog
          open={allOpen}
          onOpenChange={setAllOpen}
          triggerRef={allButtonRef}
          currentId={current?.organization.id}
          busy={busy}
          onSelect={(organizationId) => switchOrganization.mutate(organizationId)}
        />
      )}
    </>
  );
}
