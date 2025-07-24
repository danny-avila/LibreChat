import React from 'react';
import * as Ariakit from '@ariakit/react';
import { ChevronDown } from 'lucide-react';
import { ACCESS_ROLE_IDS } from 'librechat-data-provider';
import { useGetAccessRolesQuery } from 'librechat-data-provider/react-query';
import type { AccessRole } from 'librechat-data-provider';
import type * as t from '~/common';
import { DropdownPopup } from '~/components/ui';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface AccessRolesPickerProps {
  resourceType?: string;
  selectedRoleId?: string;
  onRoleChange: (roleId: string) => void;
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

  // Fetch access roles from API
  const { data: accessRoles, isLoading: rolesLoading } = useGetAccessRolesQuery(resourceType);

  // Helper function to get localized role name and description
  const getLocalizedRoleInfo = (roleId: string) => {
    switch (roleId) {
      case 'agent_viewer':
        return {
          name: localize('com_ui_role_viewer'),
          description: localize('com_ui_role_viewer_desc'),
        };
      case 'agent_editor':
        return {
          name: localize('com_ui_role_editor'),
          description: localize('com_ui_role_editor_desc'),
        };
      case 'agent_manager':
        return {
          name: localize('com_ui_role_manager'),
          description: localize('com_ui_role_manager_desc'),
        };
      case 'agent_owner':
        return {
          name: localize('com_ui_role_owner'),
          description: localize('com_ui_role_owner_desc'),
        };
      default:
        return {
          name: localize('com_ui_unknown'),
          description: localize('com_ui_unknown'),
        };
    }
  };

  // Find the currently selected role
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
