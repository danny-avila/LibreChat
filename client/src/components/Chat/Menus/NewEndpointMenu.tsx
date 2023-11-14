import type { FC } from 'react';
import { Content, Portal } from '@radix-ui/react-popover';
import { EModelEndpoint } from 'librechat-data-provider';
import MenuItems from './Endpoints/MenuItems';

const NewEndpointMenu: FC<{
  endpoints: EModelEndpoint[];
  selected: EModelEndpoint | '';
}> = ({ endpoints, selected }) => {
  return (
    <Portal>
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
          className="bg-token-surface-primary mt-2 min-w-[340px] overflow-hidden rounded-lg border border-gray-100 bg-gray-900 shadow-lg dark:border-gray-700 dark:text-white"
        >
          <MenuItems endpoints={endpoints} selected={selected} />
        </Content>
      </div>
    </Portal>
  );
};

export default NewEndpointMenu;
