import React, { memo } from 'react';
import { Scroll } from 'lucide-react';
import { CheckboxButton } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useLocalize, useHasAccess } from '~/hooks';
import { useBadgeRowContext } from '~/Providers';

function Skills() {
  const localize = useLocalize();
  const context = useBadgeRowContext();
  const { toggleState: skillsActive, debouncedChange, isPinned } = context?.skills ?? {};

  const canUseSkills = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.USE,
  });

  if (!canUseSkills) {
    return null;
  }

  return (
    (skillsActive || isPinned) && (
      <CheckboxButton
        className="max-w-fit"
        checked={skillsActive}
        setValue={debouncedChange}
        label={localize('com_ui_skills')}
        isCheckedClassName="border-cyan-600/40 bg-cyan-500/10 hover:bg-cyan-700/10"
        icon={<Scroll className="icon-md" aria-hidden="true" />}
      />
    )
  );
}

export default memo(Skills);
