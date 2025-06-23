import React, { useState, useId } from 'react';
import * as Menu from '@ariakit/react/menu';
import { Button, DropdownPopup } from '@librechat/client';
import { Users, X, ExternalLink, ChevronDown } from 'lucide-react';
import type { TPrincipal, TAccessRole } from 'librechat-data-provider';
import PrincipalAvatar from '../PrincipalAvatar';
import { useLocalize } from '~/hooks';

interface SelectedPrincipalsListProps {
  principles: TPrincipal[];
  onRemoveHandler: (idOnTheSource: string) => void;
  onRoleChange?: (idOnTheSource: string, newRoleId: string) => void;
  availableRoles?: Omit<TAccessRole, 'resourceType'>[];
  className?: string;
}

export default function SelectedPrincipalsList({
  principles,
  onRemoveHandler,
  className = '',
  onRoleChange,
  availableRoles,
}: SelectedPrincipalsListProps) {
  const localize = useLocalize();

  const getPrincipalDisplayInfo = (principal: TPrincipal) => {
    const displayName = principal.name || localize('com_ui_unknown');
    const subtitle = principal.email || `${principal.type} (${principal.source || 'local'})`;

    return { displayName, subtitle };
  };

  if (principles.length === 0) {
    return (
      <div className={`space-y-3 ${className}`}>
        <div className="rounded-lg border border-dashed border-border py-8 text-center text-muted-foreground">
          <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />
          <p className="mt-1 text-xs">{localize('com_ui_search_above_to_add')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="space-y-2">
        {principles.map((share) => {
          const { displayName, subtitle } = getPrincipalDisplayInfo(share);
          return (
            <div
              key={share.idOnTheSource + '-principalList'}
              className="bg-surface flex items-center justify-between rounded-lg border border-border p-3"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <PrincipalAvatar principal={share} size="md" />

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{displayName}</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>{subtitle}</span>
                    {share.source === 'entra' && (
                      <>
                        <ExternalLink className="h-3 w-3" />
                        <span>{localize('com_ui_azure_ad')}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-shrink-0 items-center gap-2">
                {!!share.accessRoleId && !!onRoleChange && (
                  <RoleSelector
                    currentRole={share.accessRoleId}
                    onRoleChange={(newRole) => {
                      onRoleChange?.(share.idOnTheSource!, newRole);
                    }}
                    availableRoles={availableRoles ?? []}
                  />
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveHandler(share.idOnTheSource!)}
                  className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                  aria-label={localize('com_ui_remove_user', { 0: displayName })}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface RoleSelectorProps {
  currentRole: string;
  onRoleChange: (newRole: string) => void;
  availableRoles: Omit<TAccessRole, 'resourceType'>[];
}

function RoleSelector({ currentRole, onRoleChange, availableRoles }: RoleSelectorProps) {
  const menuId = useId();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const localize = useLocalize();

  const getLocalizedRoleName = (roleId: string) => {
    switch (roleId) {
      case 'agent_viewer':
        return localize('com_ui_role_viewer');
      case 'agent_editor':
        return localize('com_ui_role_editor');
      case 'agent_manager':
        return localize('com_ui_role_manager');
      case 'agent_owner':
        return localize('com_ui_role_owner');
      default:
        return localize('com_ui_unknown');
    }
  };

  return (
    <DropdownPopup
      portal={true}
      mountByState={true}
      unmountOnHide={true}
      preserveTabOrder={true}
      isOpen={isMenuOpen}
      setIsOpen={setIsMenuOpen}
      trigger={
        <Menu.MenuButton className="flex h-8 items-center gap-2 rounded-md border border-border-medium bg-surface-secondary px-2 py-1 text-sm font-medium transition-colors duration-200 hover:bg-surface-tertiary">
          <span className="hidden sm:inline">{getLocalizedRoleName(currentRole)}</span>
          <ChevronDown className="h-3 w-3" />
        </Menu.MenuButton>
      }
      items={availableRoles?.map((role) => ({
        id: role.accessRoleId,
        label: getLocalizedRoleName(role.accessRoleId),

        onClick: () => onRoleChange(role.accessRoleId),
      }))}
      menuId={menuId}
      className="z-50 [pointer-events:auto]"
    />
  );
}
