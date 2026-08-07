import React, { useMemo, useState } from 'react';
import { Button } from '@librechat/client';
import { alternateName, getEndpointField } from 'librechat-data-provider';
import type { TEndpointsConfig } from 'librechat-data-provider';
import { SetKeyDialog } from '~/components/Input/SetKeyDialog';
import { useUserKey, useLocalize } from '~/hooks';
import { icons } from '~/hooks/Endpoint/Icons';
import { getIconKey } from '~/utils';

interface ProviderKeyRowProps {
  endpoint: string;
  endpointsConfig: TEndpointsConfig;
}

export default function ProviderKeyRow({ endpoint, endpointsConfig }: ProviderKeyRowProps) {
  const localize = useLocalize();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { getExpiry, checkExpiry } = useUserKey(endpoint);

  const endpointType = getEndpointField(endpointsConfig, endpoint, 'type');
  const iconURL = getEndpointField(endpointsConfig, endpoint, 'iconURL');
  const iconKey = getIconKey({ endpoint, endpointsConfig, endpointType });
  const Icon = icons[iconKey];

  const label = useMemo(() => alternateName[endpoint] || endpoint, [endpoint]);
  const expiry = getExpiry();
  const hasKey = !!expiry && checkExpiry();
  const expiryLabel = useMemo(() => {
    if (!expiry) {
      return localize('com_ui_provider_api_keys_not_set');
    }
    if (expiry === 'never') {
      return localize('com_endpoint_config_key_never_expires');
    }
    return `${localize('com_endpoint_config_key_encryption')} ${new Date(expiry).toLocaleString()}`;
  }, [expiry, localize]);

  return (
    <>
      <div className="flex items-center justify-between gap-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <div className="flex shrink-0 items-center justify-center" aria-hidden="true">
              {React.createElement(Icon, {
                size: 20,
                className: 'text-text-primary shrink-0 icon-md',
                iconURL,
                endpoint,
              })}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate font-medium text-text-primary">{label}</div>
            <div className="truncate text-xs text-text-secondary">{expiryLabel}</div>
          </div>
        </div>
        <Button variant="outline" onClick={() => setDialogOpen(true)}>
          {hasKey ? localize('com_ui_update') : localize('com_endpoint_config_key')}
        </Button>
      </div>
      {dialogOpen && (
        <SetKeyDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          endpoint={endpoint}
          endpointType={endpointType}
          userProvideURL={getEndpointField(endpointsConfig, endpoint, 'userProvideURL')}
          userProvideAccessKeyId={getEndpointField(
            endpointsConfig,
            endpoint,
            'userProvideAccessKeyId',
          )}
          userProvideSecretAccessKey={getEndpointField(
            endpointsConfig,
            endpoint,
            'userProvideSecretAccessKey',
          )}
          userProvideSessionToken={getEndpointField(
            endpointsConfig,
            endpoint,
            'userProvideSessionToken',
          )}
          userProvideBearerToken={getEndpointField(
            endpointsConfig,
            endpoint,
            'userProvideBearerToken',
          )}
        />
      )}
    </>
  );
}
