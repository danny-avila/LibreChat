import { Permissions, PermissionTypes } from 'librechat-data-provider';
import { useToastContext } from '@librechat/client';
import { AdminSettingsDialog } from '~/components/ui';
import { useUpdateMemoryPermissionsMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import type { PermissionConfig } from '~/components/ui';

const permissions: PermissionConfig[] = [
  { permission: Permissions.USE, labelKey: 'com_ui_memories_allow_use' },
  { permission: Permissions.CREATE, labelKey: 'com_ui_memories_allow_create' },
  { permission: Permissions.UPDATE, labelKey: 'com_ui_memories_allow_update' },
  { permission: Permissions.READ, labelKey: 'com_ui_memories_allow_read' },
  { permission: Permissions.OPT_OUT, labelKey: 'com_ui_memories_allow_opt_out' },
];

const AdminSettings = () => {
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const mutation = useUpdateMemoryPermissionsMutation({
    onSuccess: () => {
      showToast({ status: 'success', message: localize('com_ui_saved') });
    },
    onError: () => {
      showToast({ status: 'error', message: localize('com_ui_error_save_admin_settings') });
    },
  });

  return (
    <AdminSettingsDialog
      permissionType={PermissionTypes.MEMORIES}
      sectionKey="com_ui_memories"
      permissions={permissions}
      menuId="memory-role-dropdown"
      mutation={mutation}
    />
  );
};

export default AdminSettings;
