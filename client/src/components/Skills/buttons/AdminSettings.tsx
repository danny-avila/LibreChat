import { useToastContext } from '@librechat/client';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import type { PermissionConfig } from '~/components/ui';
import { useUpdateSkillPermissionsMutation } from '~/data-provider';
import { AdminSettingsDialog } from '~/components/ui';
import { useLocalize } from '~/hooks';

const permissions: PermissionConfig[] = [
  { permission: Permissions.USE, labelKey: 'com_ui_skills_allow_use' },
  { permission: Permissions.CREATE, labelKey: 'com_ui_skills_allow_create' },
  // V1 UX POP/BETC : partage interne + public sont conceptuellement
  // enfants de "création" — indent visuel pour signaler la hiérarchie.
  // Le disabling fonctionnel quand parent=off est volontairement non
  // implémenté en V1, à traiter en atelier specs post-congé.
  { permission: Permissions.SHARE, labelKey: 'com_ui_skills_allow_share', indent: true },
  {
    permission: Permissions.SHARE_PUBLIC,
    labelKey: 'com_ui_skills_allow_share_public',
    indent: true,
  },
];

const AdminSettings = () => {
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const mutation = useUpdateSkillPermissionsMutation({
    onSuccess: () => {
      showToast({ status: 'success', message: localize('com_ui_saved') });
    },
    onError: () => {
      showToast({ status: 'error', message: localize('com_ui_error_save_admin_settings') });
    },
  });

  return (
    <AdminSettingsDialog
      permissionType={PermissionTypes.SKILLS}
      sectionKey="com_ui_skills"
      permissions={permissions}
      menuId="skill-role-dropdown"
      mutation={mutation}
    />
  );
};

export default AdminSettings;
