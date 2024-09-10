import { memo } from 'react';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import HoverCardSettings from '~/components/Nav/SettingsTabs/HoverCardSettings';
import { useLocalize, useHasAccess } from '~/hooks';
import SlashCommandSwitch from './SlashCommandSwitch';
import PlusCommandSwitch from './PlusCommandSwitch';
import AtCommandSwitch from './AtCommandSwitch';

function Commands() {
  const localize = useLocalize();

  const hasAccessToPrompts = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.USE,
  });

  const hasAccessToMultiConvo = useHasAccess({
    permissionType: PermissionTypes.MULTI_CONVO,
    permission: Permissions.USE,
  });

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-medium text-text-primary">
          {localize('com_nav_chat_commands')}
        </h3>
        <HoverCardSettings side="bottom" text="com_nav_chat_commands_info" />
      </div>
      <div className="flex flex-col gap-3 text-sm text-text-primary">
        <div className="border-b border-border-medium pb-3 last-of-type:border-b-0">
          <AtCommandSwitch />
        </div>
        {hasAccessToMultiConvo === true && (
          <div className="border-b border-border-medium pb-3 last-of-type:border-b-0">
            <PlusCommandSwitch />
          </div>
        )}
        {hasAccessToPrompts === true && (
          <div className="border-b border-border-medium pb-3 last-of-type:border-b-0">
            <SlashCommandSwitch />
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(Commands);
