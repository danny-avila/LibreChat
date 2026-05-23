import React from 'react';
import { Button, useMediaQuery } from '@librechat/client';
import { Users, X, ExternalLink } from 'lucide-react';
import { ResourceType } from 'librechat-data-provider';
import type { TPrincipal, AccessRoleIds } from 'librechat-data-provider';
import AccessRolesPicker from '~/components/Sharing/AccessRolesPicker';
import PrincipalAvatar from '~/components/Sharing/PrincipalAvatar';
import { useLocalize } from '~/hooks';

interface SelectedPrincipalsListProps {
  principles: TPrincipal[];
  onRemoveHandler: (idOnTheSource: string) => void;
  onRoleChange?: (idOnTheSource: string, newRoleId: AccessRoleIds) => void;
  resourceType?: ResourceType;
  className?: string;
}

export default function SelectedPrincipalsList({
  principles,
  onRemoveHandler,
  className = '',
  onRoleChange,
  resourceType = ResourceType.AGENT,
}: SelectedPrincipalsListProps) {
  const localize = useLocalize();
  const isMobile = useMediaQuery('(max-width: 768px)');

  const getPrincipalDisplayInfo = (principal: TPrincipal) => {
    const displayName = principal.name || localize('com_ui_unknown');
    const subtitle = isMobile
      ? `${principal.type} (${principal.source || 'local'})`
      : principal.email || `${principal.type} (${principal.source || 'local'})`;

    return { displayName, subtitle };
  };

  if (principles.length === 0) {
    return (
      <div className={`space-y-3 ${className}`}>
        <div className="rounded-lg border border-dashed border-border-medium py-8 text-center text-muted-foreground">
          <Users className="mx-auto mb-2 h-8 w-8 opacity-50" aria-hidden="true" />
          <p className="mt-1 text-xs">{localize('com_ui_search_above_to_add_all')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="space-y-2">
        {principles.map((share) => {
          const { displayName, subtitle } = getPrincipalDisplayInfo(share);
          return (
            <div
              key={share.idOnTheSource + '-principalList'}
              className="bg-surface flex items-center justify-between rounded-2xl border border-border p-3"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <PrincipalAvatar principal={share} size="md" />

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{displayName}</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>{subtitle}</span>
                    {share.source === 'entra' && (
                      <>
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        <span>{localize('com_ui_azure_ad')}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-shrink-0 items-center gap-2">
                {!!share.accessRoleId && !!onRoleChange && (
                  <AccessRolesPicker
                    resourceType={resourceType}
                    selectedRoleId={share.accessRoleId}
                    onRoleChange={(newRole) => {
                      onRoleChange?.(share.idOnTheSource!, newRole);
                    }}
                    className="min-w-0"
                  />
                )}
                <Button
                  variant="outline"
                  onClick={() => onRemoveHandler(share.idOnTheSource!)}
                  className="h-9 w-9 p-0 hover:border-destructive/10 hover:bg-destructive/10 hover:text-destructive"
                  aria-label={localize('com_ui_remove_user', { 0: displayName })}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
