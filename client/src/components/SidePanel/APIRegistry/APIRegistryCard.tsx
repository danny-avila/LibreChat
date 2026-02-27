import React from 'react';
import { Edit, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '@librechat/client';
import { useLocalize } from '~/hooks';

interface APIRegistryCardProps {
  api: any;
  onEdit: () => void;
}

export default function APIRegistryCard({ api, onEdit }: APIRegistryCardProps) {
  const localize = useLocalize();

  const endpointCount = api.apiConfig?.selectedEndpoints?.length || 0;
  const authType = api.apiConfig?.auth?.type || 'none';

  return (
    <div className="rounded-lg border border-border-medium bg-surface-primary p-4 transition-colors hover:border-border-heavy">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-text-primary">
              {api.title || api.serverName}
            </h3>
            {api.apiConfig?.baseUrl && (
              <a
                href={api.apiConfig.baseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-secondary hover:text-text-primary"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          
          {api.description && (
            <p className="mt-1 text-sm text-text-secondary line-clamp-2">
              {api.description}
            </p>
          )}

          <div className="mt-3 flex items-center gap-4 text-xs text-text-tertiary">
            <span>
              {endpointCount} {endpointCount === 1 ? 'endpoint' : 'endpoints'}
            </span>
            <span className="capitalize">
              Auth: {authType}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={onEdit}
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            aria-label={localize('com_ui_edit')}
          >
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}