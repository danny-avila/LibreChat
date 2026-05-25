import React, { useMemo } from 'react';
import { useGetEndpointsQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { isUserProvidedEndpointConfig } from './utils';
import APIKeyRow from './APIKeyRow';

function APIKeys() {
  const localize = useLocalize();
  const { data: endpointsConfig } = useGetEndpointsQuery();

  const userProvidedEndpoints = useMemo(() => {
    if (!endpointsConfig) {
      return [];
    }
    const entries = Object.entries(endpointsConfig);
    const result: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const [endpoint, config] = entries[i];
      if (isUserProvidedEndpointConfig(config)) {
        result.push(endpoint);
      }
    }
    return result;
  }, [endpointsConfig]);

  return (
    <div className="flex flex-col gap-3 p-1 text-sm text-text-primary">
      <p className="pb-1 text-text-secondary">{localize('com_nav_api_keys_description')}</p>
      {userProvidedEndpoints.length === 0 ? (
        <div className="rounded-md border border-border-light p-4 text-text-secondary">
          {localize('com_nav_api_keys_empty')}
        </div>
      ) : (
        <div className="divide-y divide-border-light">
          {userProvidedEndpoints.map((endpoint) => (
            <APIKeyRow key={endpoint} endpoint={endpoint} endpointsConfig={endpointsConfig} />
          ))}
        </div>
      )}
    </div>
  );
}

export default React.memo(APIKeys);
