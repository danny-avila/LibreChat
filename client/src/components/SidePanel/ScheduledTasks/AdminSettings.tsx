import { Permissions, PermissionTypes } from 'librechat-data-provider';
import { useToastContext } from '@librechat/client';
import { AdminSettingsDialog } from '~/components/ui';
import { useUpdateScheduledTasksPermissionsMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import type { PermissionConfig } from '~/components/ui';

const permissions: PermissionConfig[] = [
  { permission: Permissions.USE, labelKey: 'com_ui_scheduled_tasks_allow_use' },
  { permission: Permissions.CREATE, labelKey: 'com_ui_scheduled_tasks_allow_create' },
];

/**
 * Minimal admin gate for Scheduled Tasks:
 *  - `USE` controls visibility of the side-panel entry + builder routes.
 *  - `CREATE` controls whether the form accepts new tasks.
 *
 * `AdminSettingsDialog` handles role selection, mutation wiring, and the
 * trigger button rendering.
 */
const AdminSettings = () => {
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const mutation = useUpdateScheduledTasksPermissionsMutation({
    onSuccess: () => {
      showToast({ status: 'success', message: localize('com_ui_saved') });
    },
    onError: () => {
      showToast({ status: 'error', message: localize('com_ui_error_save_admin_settings') });
    },
  });

  return (
    <AdminSettingsDialog
      permissionType={PermissionTypes.SCHEDULED_TASKS}
      sectionKey="com_sidepanel_scheduled_tasks"
      permissions={permissions}
      menuId="scheduled-tasks-role-dropdown"
      mutation={mutation}
    />
  );
};

export default AdminSettings;
