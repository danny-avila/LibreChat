import React from 'react';
import { Content } from '@radix-ui/react-popover';
import { EModelEndpoint } from 'librechat-data-provider';
import MenuSeparator from './UI/MenuSeparator';
import { alternateName } from '~/utils';
import MenuItem from './UI/MenuItem';

const NewEndpointMenu: React.FC<{
  endpoints: EModelEndpoint[];
  selected: EModelEndpoint | '';
}> = ({ endpoints, selected }) => {
  return (
    <div
      style={{
        position: 'fixed',
        left: '0px',
        top: '0px',
        transform: 'translate3d(268px, 50px, 0px)',
        minWidth: 'max-content',
        zIndex: 'auto',
      }}
    >
      <Content
        side="bottom"
        align="start"
        className="bg-token-surface-primary mt-2 min-w-[340px] max-w-xs overflow-hidden rounded-lg border border-gray-100 bg-gray-900 shadow-lg dark:border-gray-700 dark:text-white"
      >
        {endpoints &&
          endpoints.map((endpoint, i) => (
            <>
              <MenuItem
                key={`endpoint-${endpoint}`}
                title={alternateName[endpoint] || endpoint}
                value={endpoint}
                selected={selected === endpoint}
                // description="With DALL·E, browsing and analysis"
              />
              {i !== endpoints.length - 1 && <MenuSeparator />}
            </>
          ))}
        {/* <MenuItem
          iconPath="M15.2406 3.48592C15.2405 3.48652..."
          title="GPT-3.5"
          description="Great for everyday tasks"
          hoverContent="New Chat"
        />
        <MenuSeparator />
        <MenuItem
          iconPath="M15.4646 19C15.2219 20.6961..."
          title="Plugins"
          hoverContent="New Chat"
        /> */}
      </Content>
    </div>
  );
};

export default NewEndpointMenu;
