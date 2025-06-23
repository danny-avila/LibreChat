import React from 'react';
import { Globe } from 'lucide-react';
import { Switch } from '@librechat/client';
import AccessRolesPicker from './AccessRolesPicker';
import { useLocalize } from '~/hooks';

interface PublicSharingToggleProps {
  isPublic: boolean;
  publicRole: string;
  onPublicToggle: (isPublic: boolean) => void;
  onPublicRoleChange: (role: string) => void;
  className?: string;
  resourceType?: string;
}

export default function PublicSharingToggle({
  isPublic,
  publicRole,
  onPublicToggle,
  onPublicRoleChange,
  className = '',
  resourceType = 'agent',
}: PublicSharingToggleProps) {
  const localize = useLocalize();

  return (
    <div className={`space-y-3 border-t pt-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Globe className="h-4 w-4" />
            {localize('com_ui_share_with_everyone')}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {localize('com_ui_make_agent_available_all_users')}
          </p>
        </div>
        <Switch
          checked={isPublic}
          onCheckedChange={onPublicToggle}
          aria-label={localize('com_ui_share_with_everyone')}
        />
      </div>

      {isPublic && (
        <div>
          <label className="mb-2 block text-sm font-medium">
            {localize('com_ui_public_access_level')}
          </label>
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
