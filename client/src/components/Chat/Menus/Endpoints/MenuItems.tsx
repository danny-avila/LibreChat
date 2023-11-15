import type { FC } from 'react';
import { EModelEndpoint, useGetEndpointsQuery } from 'librechat-data-provider';
import MenuSeparator from '../UI/MenuSeparator';
import { alternateName } from '~/common';
import MenuItem from './MenuItem';

const EndpointItems: FC<{
  endpoints: EModelEndpoint[];
  selected: EModelEndpoint | '';
}> = ({ endpoints, selected }) => {
  const { data: endpointsConfig } = useGetEndpointsQuery();
  return (
    <>
      {endpoints &&
        endpoints.map((endpoint, i) => {
          if (!endpoint) {
            return null;
          } else if (!endpointsConfig?.[endpoint]) {
            return null;
          }
          const userProvidesKey = endpointsConfig?.[endpoint]?.userProvide;
          return (
            <div key={`endpoint-${endpoint}`}>
              <MenuItem
                key={`endpoint-item-${endpoint}`}
                title={alternateName[endpoint] || endpoint}
                value={endpoint}
                selected={selected === endpoint}
                data-testid={`endpoint-item-${endpoint}`}
                userProvidesKey={!!userProvidesKey}
                // description="With DALL·E, browsing and analysis"
              />
              {i !== endpoints.length - 1 && <MenuSeparator />}
            </div>
          );
        })}
    </>
  );
};

export default EndpointItems;
