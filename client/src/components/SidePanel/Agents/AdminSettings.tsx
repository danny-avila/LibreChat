import { Permissions, PermissionTypes } from 'librechat-data-provider';
import { useToastContext } from '@librechat/client';
import { AdminSettingsDialog } from '~/components/ui';
import { useUpdateAgentPermissionsMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import type { PermissionConfig } from '~/components/ui';

const permissions: PermissionConfig[] = [
  { permission: Permissions.SHARED_GLOBAL, labelKey: 'com_ui_agents_allow_share' },
  { permission: Permissions.CREATE, labelKey: 'com_ui_agents_allow_create' },
  { permission: Permissions.USE, labelKey: 'com_ui_agents_allow_use' },
];

const AdminSettings = () => {
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const mutation = useUpdateAgentPermissionsMutation({
    onSuccess: () => {
      showToast({ status: 'success', message: localize('com_ui_saved') });
    },
    onError: () => {
      showToast({ status: 'error', message: localize('com_ui_error_save_admin_settings') });
    },
  });

  return (
    <AdminSettingsDialog
      permissionType={PermissionTypes.AGENTS}
      sectionKey="com_ui_agents"
      permissions={permissions}
      menuId="agent-role-dropdown"
      mutation={mutation}
    />
  );
};

export default AdminSettings;
