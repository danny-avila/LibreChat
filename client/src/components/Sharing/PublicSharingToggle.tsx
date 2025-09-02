import React from 'react';
import { Globe, Shield } from 'lucide-react';
import { ResourceType } from 'librechat-data-provider';
import { Switch, InfoHoverCard, ESide, Label } from '@librechat/client';
import type { AccessRoleIds } from 'librechat-data-provider';
import AccessRolesPicker from './AccessRolesPicker';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface PublicSharingToggleProps {
  isPublic: boolean;
  publicRole?: AccessRoleIds;
  onPublicToggle: (isPublic: boolean) => void;
  onPublicRoleChange: (role: AccessRoleIds) => void;
  resourceType?: ResourceType;
  className?: string;
}

const accessDescriptions: Record<ResourceType, 'com_ui_agent' | 'com_ui_prompt'> = {
  [ResourceType.AGENT]: 'com_ui_agent',
  [ResourceType.PROMPTGROUP]: 'com_ui_prompt',
};

export default function PublicSharingToggle({
  isPublic,
  publicRole,
  onPublicToggle,
  onPublicRoleChange,
  resourceType = ResourceType.AGENT,
  className,
}: PublicSharingToggleProps) {
  const localize = useLocalize();

  const handleToggle = React.useCallback(
    (checked: boolean) => {
      onPublicToggle(checked);
    },
    [onPublicToggle],
  );

  return (
    <div className={cn('space-y-4', className)}>
      {/* Main toggle section */}
      <div className="group relative rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'transition-colors duration-200',
                isPublic ? 'text-blue-600 dark:text-blue-500' : 'text-text-secondary',
              )}
            >
              <Globe className="size-5" />
            </div>
            <div className="flex items-center gap-2">
              <Label
                htmlFor="share-everyone-toggle"
                className="cursor-pointer text-sm font-medium text-text-primary"
              >
                {localize('com_ui_share_everyone')}
              </Label>
              <InfoHoverCard
                side={ESide.Top}
                text={localize('com_ui_share_everyone_description_var', {
                  resource:
                    localize(accessDescriptions[resourceType]) || localize('com_ui_resource'),
                })}
              />
            </div>
          </div>
          <Switch
            id="share-everyone-toggle"
            checked={isPublic}
            onCheckedChange={handleToggle}
            aria-label={localize('com_ui_share_everyone')}
          />
        </div>
      </div>

      {/* Permission level section with smooth animation */}
      <div
        className={cn(
          'transition-all duration-300 ease-in-out',
          isPublic ? 'max-h-32 opacity-100' : 'max-h-0 opacity-0',
        )}
        style={{ overflow: isPublic ? 'visible' : 'hidden' }}
      >
        <div
          className={cn(
            'rounded-lg transition-all duration-300',
            isPublic ? 'bg-surface-secondary/50 translate-y-0' : '-translate-y-2',
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'transition-all duration-300',
                  isPublic
                    ? 'scale-100 text-blue-600 dark:text-blue-500'
                    : 'scale-95 text-text-secondary',
                )}
              >
                <Shield className="size-5" />
              </div>
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="permission-level" className="text-sm font-medium text-text-primary">
                  {localize('com_ui_everyone_permission_level')}
                </Label>
              </div>
            </div>
            <div
              className={cn(
                'relative z-50 transition-all duration-300',
                isPublic ? 'scale-100 opacity-100' : 'scale-95 opacity-0',
              )}
            >
              <AccessRolesPicker
                id="permission-level"
                resourceType={resourceType}
                selectedRoleId={publicRole}
                onRoleChange={onPublicRoleChange}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
