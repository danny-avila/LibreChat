import { memo } from 'react';
import { InfoHoverCard, ESide } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useLocalize, useHasAccess } from '~/hooks';
import ToggleSwitch from '../ToggleSwitch';
import store from '~/store';

const commandSwitchConfigs = [
  {
    stateAtom: store.atCommand,
    localizationKey: 'com_nav_at_command_description' as const,
    switchId: 'atCommand',
    key: 'atCommand',
    permissionType: undefined,
  },
  {
    stateAtom: store.plusCommand,
    localizationKey: 'com_nav_plus_command_description' as const,
    switchId: 'plusCommand',
    key: 'plusCommand',
    permissionType: PermissionTypes.MULTI_CONVO,
  },
  {
    stateAtom: store.slashCommand,
    localizationKey: 'com_nav_slash_command_description' as const,
    switchId: 'slashCommand',
    key: 'slashCommand',
    permissionType: PermissionTypes.PROMPTS,
  },
] as const;

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

  const getShowSwitch = (permissionType?: PermissionTypes) => {
    if (!permissionType) {
      return true;
    }
    if (permissionType === PermissionTypes.MULTI_CONVO) {
      return hasAccessToMultiConvo === true;
    }
    if (permissionType === PermissionTypes.PROMPTS) {
      return hasAccessToPrompts === true;
    }
    return true;
  };

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-medium text-text-primary">
          {localize('com_nav_chat_commands')}
        </h3>
        <InfoHoverCard side={ESide.Bottom} text={localize('com_nav_chat_commands_info')} />
      </div>
      <div className="flex flex-col gap-3 text-sm text-text-primary">
        {commandSwitchConfigs.map((config) => (
          <div key={config.key} className="pb-3">
            <ToggleSwitch
              stateAtom={config.stateAtom}
              localizationKey={config.localizationKey}
              switchId={config.switchId}
              showSwitch={getShowSwitch(config.permissionType)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(Commands);
