import React from 'react';
import { FilterInput } from '@librechat/client';
import { SystemRoles, PermissionTypes, Permissions } from 'librechat-data-provider';
import { AdminSettings, CreateSkillMenu } from '~/components/Skills/buttons';
import { useHasAccess, useAuthContext, useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function FilterSkills({
  searchTerm,
  onSearchChange,
  className = '',
}: {
  searchTerm: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
}) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.CREATE,
  });

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div role="search" className="flex items-center gap-2">
        <FilterInput
          inputId="skills-filter"
          label={localize('com_ui_filter_skills_name')}
          value={searchTerm}
          onChange={onSearchChange}
          containerClassName="flex-1"
        />
        {hasCreateAccess && <CreateSkillMenu />}
      </div>
      {user?.role === SystemRoles.ADMIN && (
        <div className="flex w-full items-center justify-end">
          <AdminSettings />
        </div>
      )}
    </div>
  );
}
