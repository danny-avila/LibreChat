import { useState } from 'react';
import type * as t from '~/admin/types';
import { CreateGroupDialog } from './CreateGroupDialog';
import { CreateRoleDialog } from './CreateRoleDialog';
import { useLocalize } from '~/admin/hooks';
import { GroupsTab } from './GroupsTab';
import { RolesTab } from './RolesTab';
import { Tabs } from '~/admin/ui';

export function AccessPage({
  activeTab,
  onTabChange,
  canReadRoles,
  canReadGroups,
}: t.AccessPageProps) {
  const localize = useLocalize();
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createRoleOpen, setCreateRoleOpen] = useState(false);

  return (
    <div
      role="region"
      aria-label={localize('com_admin_nav_access')}
      className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-2"
    >
      {canReadRoles && canReadGroups && (
        <Tabs
          value={activeTab}
          onValueChange={onTabChange}
          ariaLabel={localize('com_admin_nav_access')}
        >
          <Tabs.TriggersList>
            <Tabs.Trigger value="roles">{localize('com_admin_access_tab_roles')}</Tabs.Trigger>
            <Tabs.Trigger value="groups">{localize('com_admin_access_tab_groups')}</Tabs.Trigger>
          </Tabs.TriggersList>
          <Tabs.Content value="roles" tabIndex={-1} />
          <Tabs.Content value="groups" tabIndex={-1} />
        </Tabs>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-3">
        {activeTab === 'groups' && canReadGroups && (
          <GroupsTab onCreateGroup={() => setCreateGroupOpen(true)} />
        )}

        {activeTab === 'roles' && canReadRoles && (
          <RolesTab onCreateRole={() => setCreateRoleOpen(true)} />
        )}
      </div>

      <CreateGroupDialog open={createGroupOpen} onClose={() => setCreateGroupOpen(false)} />
      <CreateRoleDialog open={createRoleOpen} onClose={() => setCreateRoleOpen(false)} />
    </div>
  );
}
