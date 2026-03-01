import React from 'react';
import { FileCode, Globe, Shield } from 'lucide-react';
import { AccessRoleIds, ResourceType } from 'librechat-data-provider';
import { Switch, InfoHoverCard, ESide, Label, Checkbox } from '@librechat/client';
import AccessRolesPicker from './AccessRolesPicker';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface PublicSharingToggleProps {
  isPublic: boolean;
  publicRole?: AccessRoleIds;
  onPublicToggle: (isPublic: boolean) => void;
  onPublicRoleChange: (role: AccessRoleIds) => void;
  onIncludeEndpointsChange?: (role: AccessRoleIds, include: boolean) => void;
  includeEndpointsForRole?: boolean;
  resourceType?: ResourceType;
  className?: string;
}

const accessDescriptions: Record<
  ResourceType,
  'com_ui_agent' | 'com_ui_prompt' | 'com_ui_mcp_server'
> = {
  [ResourceType.AGENT]: 'com_ui_agent',
  [ResourceType.PROMPTGROUP]: 'com_ui_prompt',
  [ResourceType.MCPSERVER]: 'com_ui_mcp_server',
};

export default function PublicSharingToggle({
  isPublic,
  publicRole,
  onPublicToggle,
  onPublicRoleChange,
  onIncludeEndpointsChange,
  includeEndpointsForRole,
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

  const handleIncludeEndpointsChange = React.useCallback(
    (checked: boolean) => {
      if (publicRole && onIncludeEndpointsChange) {
        onIncludeEndpointsChange(publicRole, checked);
      }
    },
    [publicRole, onIncludeEndpointsChange],
  );

  const isEndpointIncluded = publicRole && isPublic ? includeEndpointsForRole ?? false : false;
  const showEndpointToggle = isPublic && publicRole;
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
          {/* Include Endpoints checkbox - Only show for publicRole selected */}
          {showEndpointToggle && (
            <div className="flex items-center justify-between mt-3 pt-4 border-t border-border-light">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'transition-all duration-300',
                    isPublic
                      ? 'scale-100 text-blue-600 dark:text-blue-500'
                      : 'scale-95 text-text-secondary',
                  )}
                >
                  <FileCode className="size-5" />
                </div>
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="include-endpoints"
                    className="cursor-pointer text-sm font-medium text-text-primary"
                  >
                    {localize('com_ui_include_endpoint_options')}
                  </Label>
                  <InfoHoverCard
                    side={ESide.Top}
                    text={localize('com_ui_include_endpoint_options_description')}
                  />
                </div>
              </div>
              <Checkbox
                id="include-endpoints"
                checked={isEndpointIncluded}
                onCheckedChange={handleIncludeEndpointsChange}
                aria-label={localize('com_ui_include_endpoint_options')}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
