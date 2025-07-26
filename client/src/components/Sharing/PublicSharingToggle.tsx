import React from 'react';
import { Globe, Shield } from 'lucide-react';
import { Switch } from '@librechat/client';
import AccessRolesPicker from '../SidePanel/Agents/Sharing/AccessRolesPicker';
import { useLocalize } from '~/hooks';

export default function PublicSharingToggle({
  isPublic,
  publicRole,
  onPublicToggle,
  onPublicRoleChange,
  resourceType = 'agent',
}: {
  isPublic: boolean;
  publicRole: string;
  onPublicToggle: (isPublic: boolean) => void;
  onPublicRoleChange: (role: string) => void;
  resourceType?: string;
}) {
  const localize = useLocalize();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="flex items-start gap-3">
          <Globe className="mt-0.5 h-5 w-5 text-blue-500" />
          <div>
            <h4 className="text-sm font-medium text-text-primary">
              {localize('com_ui_public_access')}
            </h4>
            <p className="text-xs text-text-secondary">
              {localize('com_ui_public_access_description')}
            </p>
          </div>
        </div>
        <Switch
          checked={isPublic}
          onCheckedChange={onPublicToggle}
          aria-labelledby="public-access-toggle"
        />
      </div>

      {isPublic && (
        <div className="ml-8 space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-text-secondary" />
            <label className="text-sm font-medium text-text-primary">
              {localize('com_ui_public_permission_level')}
            </label>
          </div>
          <AccessRolesPicker
            resourceType={resourceType}
            selectedRoleId={publicRole}
            onRoleChange={onPublicRoleChange}
          />
        </div>
      )}
    </div>
  );
}
