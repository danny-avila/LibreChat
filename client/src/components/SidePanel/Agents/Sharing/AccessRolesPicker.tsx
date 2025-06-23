import React from 'react';
import { ACCESS_ROLE_IDS } from 'librechat-data-provider';
import type { AccessRole } from 'librechat-data-provider';
import { useGetAccessRolesQuery } from 'librechat-data-provider/react-query';
import SelectDropDownPop from '~/components/Input/ModelSelect/SelectDropDownPop';
import { useLocalize } from '~/hooks';

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

  if (rolesLoading || !accessRoles) {
    return (
      <div className={className}>
        <div className="flex items-center justify-center py-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"></div>
          <span className="ml-2 text-sm text-gray-500">Loading roles...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <SelectDropDownPop
        availableValues={accessRoles.map((role: AccessRole) => {
          const localizedInfo = getLocalizedRoleInfo(role.accessRoleId);
          return {
            value: role.accessRoleId,
            label: localizedInfo.name,
            description: localizedInfo.description,
          };
        })}
        showLabel={false}
        value={
          selectedRole
            ? (() => {
                const localizedInfo = getLocalizedRoleInfo(selectedRole.accessRoleId);
                return {
                  value: selectedRole.accessRoleId,
                  label: localizedInfo.name,
                  description: localizedInfo.description,
                };
              })()
            : null
        }
        setValue={onRoleChange}
      />
    </div>
  );
}
