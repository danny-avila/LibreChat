import { Outlet } from 'react-router-dom';
import { SystemRoles, PermissionTypes, Permissions } from 'librechat-data-provider';
import { AdminSettings, CreateSkillMenu } from '~/components/Skills/buttons';
import SkillsSidePanel from '~/components/Skills/sidebar/SkillsSidePanel';
import PageHeader from '~/components/ui/PageHeader';
import { useAuthContext, useHasAccess, useLocalize } from '~/hooks';

export default function SkillsLayout() {
  const localize = useLocalize();
  const { user } = useAuthContext();

  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.CREATE,
  });

  const headerActions = hasCreateAccess ? <CreateSkillMenu /> : undefined;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Full-width page header */}
      <PageHeader title={localize('com_ui_skills')} actions={headerActions} />

      {/* Two-column section below header */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left column — skills list */}
        <div className="flex w-[280px] flex-shrink-0 flex-col overflow-hidden border-r border-border-light">
          <SkillsSidePanel className="flex-1 border-r-0" hideHeader />
          {user?.role === SystemRoles.ADMIN && (
            <div className="flex w-full items-center justify-end px-4 pb-2">
              <AdminSettings />
            </div>
          )}
        </div>

        {/* Right column — detail / edit / create */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
