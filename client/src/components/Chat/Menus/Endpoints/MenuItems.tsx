import type { FC } from 'react';
import { Close } from '@radix-ui/react-popover';
import {
  EModelEndpoint,
  alternateName,
  PermissionTypes,
  Permissions,
} from 'librechat-data-provider';
import { useGetEndpointsQuery } from 'librechat-data-provider/react-query';
import MenuSeparator from '../UI/MenuSeparator';
import { getEndpointField } from '~/utils';
import { useHasAccess } from '~/hooks';
import MenuItem from './MenuItem';

const EndpointItems: FC<{
  endpoints: Array<EModelEndpoint | undefined>;
  selected: EModelEndpoint | '';
}> = ({ endpoints = [], selected }) => {
  const hasAccessToAgents = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });
  const { data: endpointsConfig } = useGetEndpointsQuery();
  return (
    <>
      {endpoints.map((endpoint, i) => {
        if (!endpoint) {
          return null;
        } else if (!endpointsConfig?.[endpoint]) {
          return null;
        }

        if (endpoint === EModelEndpoint.agents && !hasAccessToAgents) {
          return null;
        }
        const userProvidesKey: boolean | null | undefined =
          getEndpointField(endpointsConfig, endpoint, 'userProvide') ?? false;
        return (
          <Close asChild key={`endpoint-${endpoint}`}>
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
          </Close>
        );
      })}
    </>
  );
};

export default EndpointItems;
