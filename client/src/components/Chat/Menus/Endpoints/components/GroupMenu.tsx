import React from 'react';
import { CustomMenu as Menu } from '../CustomMenu';
import GroupIcon from './GroupIcon';

interface GroupMenuProps {
  id: string;
  groupName: string;
  groupIcon?: string;
  children: React.ReactNode;
}

export default function GroupMenu({ id, groupName, groupIcon, children }: GroupMenuProps) {
  return (
    <Menu
      id={id}
      className="transition-opacity duration-200 ease-in-out"
      label={
        <div className="group flex w-full flex-shrink cursor-pointer items-center justify-between rounded-xl px-1 py-1 text-sm">
          <div className="flex items-center gap-2">
            {groupIcon && (
              <div className="flex-shrink-0">
                <GroupIcon iconURL={groupIcon} groupName={groupName} />
              </div>
            )}
            <span className="truncate text-left">{groupName}</span>
          </div>
        </div>
      }
    >
      {children}
    </Menu>
  );
}
