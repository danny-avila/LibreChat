import React from 'react';
import * as Ariakit from '@ariakit/react';
import { ChevronDown } from 'lucide-react';
import { DropdownPopup } from '@librechat/client';
import { ACCESS_ROLE_IDS } from 'librechat-data-provider';
import { useGetAccessRolesQuery } from 'librechat-data-provider/react-query';
import type { AccessRole } from 'librechat-data-provider';
import type * as t from '~/common';
import { cn, getRoleLocalizationKeys } from '~/utils';
import { useLocalize } from '~/hooks';

interface AccessRolesPickerProps {
  resourceType?: string;
  selectedRoleId?: ACCESS_ROLE_IDS;
  onRoleChange: (roleId: ACCESS_ROLE_IDS) => void;
  className?: string;
}

export default function AccessRolesPicker({
  resourceType = 'agent',
  selectedRoleId = ACCESS_ROLE_IDS.AGENT_VIEWER,
  onRoleChange,
  className = '',
}: AccessRolesPickerProps) {
  const localize = useLocalize();
  const [isOpen, setIsOpen] = React.useState(false);
  const { data: accessRoles, isLoading: rolesLoading } = useGetAccessRolesQuery(resourceType);

  /** Helper function to get localized role name and description */
  const getLocalizedRoleInfo = (roleId: ACCESS_ROLE_IDS) => {
    const keys = getRoleLocalizationKeys(roleId);
    return {
      name: localize(keys.name),
      description: localize(keys.description),
    };
  };

  const selectedRole = accessRoles?.find((role) => role.accessRoleId === selectedRoleId);
  const selectedRoleInfo = selectedRole ? getLocalizedRoleInfo(selectedRole.accessRoleId) : null;

  if (rolesLoading || !accessRoles) {
    return (
      <div className={className}>
        <div className="flex items-center justify-center py-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-border-light border-t-blue-600"></div>
          <span className="ml-2 text-sm text-text-secondary">{localize('com_ui_loading')}</span>
        </div>
      </div>
    );
  }

  const dropdownItems: t.MenuItemProps[] = accessRoles.map((role: AccessRole) => {
    const localizedInfo = getLocalizedRoleInfo(role.accessRoleId);
    return {
      id: role.accessRoleId,
      label: localizedInfo.name,
      onClick: () => {
        onRoleChange(role.accessRoleId);
        setIsOpen(false);
      },
      render: (props) => (
        <button {...props}>
          <div className="flex flex-col items-start gap-0.5 text-left">
            <span className="font-medium text-text-primary">{localizedInfo.name}</span>
            <span className="text-xs text-text-secondary">{localizedInfo.description}</span>
          </div>
        </button>
      ),
    };
  });

  return (
    <div className={className}>
      <DropdownPopup
        menuId="access-roles-menu"
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        trigger={
          <Ariakit.MenuButton
            aria-label={selectedRoleInfo?.description || 'Select role'}
            className={cn(
              'flex items-center justify-between gap-2 rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm transition-colors hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-ring-primary',
              'min-w-[200px]',
            )}
          >
            <span className="font-medium">
              {selectedRoleInfo?.name || localize('com_ui_select')}
            </span>
            <ChevronDown className="h-4 w-4 text-text-secondary" />
          </Ariakit.MenuButton>
        }
        items={dropdownItems}
        className="w-[280px]"
      />
    </div>
  );
}
