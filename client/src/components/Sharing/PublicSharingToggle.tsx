import React from 'react';
import { Globe, Shield } from 'lucide-react';
import { ResourceType } from 'librechat-data-provider';
import { Switch, InfoHoverCard, ESide, Label } from '@librechat/client';
import type { AccessRoleIds } from 'librechat-data-provider';
import AccessRolesPicker from './AccessRolesPicker';
import { useLocalize } from '~/hooks';

export default function PublicSharingToggle({
  isPublic,
  publicRole,
  onPublicToggle,
  onPublicRoleChange,
  resourceType = ResourceType.AGENT,
}: {
  isPublic: boolean;
  publicRole?: AccessRoleIds;
  onPublicToggle: (isPublic: boolean) => void;
  onPublicRoleChange: (role: AccessRoleIds) => void;
  resourceType?: ResourceType;
}) {
  const localize = useLocalize();

  return (
    <div className="space-y-2">
      {/* Main toggle section */}
      <div className="flex items-center justify-between py-3">
        <div className="flex items-center gap-3">
          <Globe className="size-5 text-text-secondary" />
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium text-text-primary">
              {localize('com_ui_public_access')}
            </Label>
            <InfoHoverCard side={ESide.Top} text={localize('com_ui_public_access_description')} />
          </div>
        </div>
        <Switch
          checked={isPublic}
          onCheckedChange={onPublicToggle}
          aria-labelledby="public-access-toggle"
        />
      </div>

      {/* Permission level section */}
      {isPublic && (
        <div className="pt-2 duration-200 animate-in slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="size-5 text-text-secondary" />
              <Label className="text-sm font-medium text-text-primary">
                {localize('com_ui_public_permission_level')}
              </Label>
            </div>
            <AccessRolesPicker
              resourceType={resourceType}
              selectedRoleId={publicRole}
              onRoleChange={onPublicRoleChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}
