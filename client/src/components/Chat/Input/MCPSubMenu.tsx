import React from 'react';
import * as Ariakit from '@ariakit/react';
import { ChevronRight } from 'lucide-react';
import { PinIcon, MCPIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';

import { cn } from '~/utils';

interface MCPSubMenuProps {
  isMCPPinned: boolean;
  setIsMCPPinned: (value: boolean) => void;
  mcpValues?: string[];
  mcpServerNames: string[];
  handleMCPToggle: (serverName: string) => void;
}

const MCPSubMenu = ({
  mcpValues,
  isMCPPinned,
  mcpServerNames,
  setIsMCPPinned,
  handleMCPToggle,
  ...props
}: MCPSubMenuProps) => {
  const localize = useLocalize();

  return (
    <Ariakit.MenuProvider>
      <Ariakit.MenuButton {...props}>
        <div className="flex items-center gap-2">
          <MCPIcon className="icon-md" />
          <span>{localize('com_ui_mcp_servers')}</span>
          <ChevronRight className="h-3 w-3" />
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsMCPPinned(!isMCPPinned);
          }}
          className={cn(
            'rounded p-1 transition-all duration-200',
            'hover:bg-surface-tertiary hover:shadow-sm',
            !isMCPPinned && 'text-text-secondary hover:text-text-primary',
          )}
          aria-label={isMCPPinned ? 'Unpin' : 'Pin'}
        >
          <div className="h-4 w-4">
            <PinIcon unpin={isMCPPinned} />
          </div>
        </button>
      </Ariakit.MenuButton>
      <Ariakit.Menu
        gutter={4}
        shift={-8}
        unmountOnHide
        portal={true}
        className="z-50 flex min-w-[200px] flex-col rounded-xl border border-border-light bg-surface-secondary p-1 shadow-lg"
      >
        {mcpServerNames.map((serverName) => (
          <Ariakit.MenuItem
            key={serverName}
            onClick={(event) => {
              event.preventDefault();
              handleMCPToggle(serverName);
            }}
            className={cn(
              'flex items-center gap-2 rounded-lg px-2 py-1.5 text-text-primary hover:cursor-pointer',
              'scroll-m-1 outline-none transition-colors',
              'hover:bg-black/[0.075] dark:hover:bg-white/10',
              'data-[active-item]:bg-black/[0.075] dark:data-[active-item]:bg-white/10',
              'w-full min-w-0 text-sm',
            )}
          >
            <Ariakit.MenuItemCheck checked={mcpValues?.includes(serverName) ?? false} />
            <span>{serverName}</span>
          </Ariakit.MenuItem>
        ))}
      </Ariakit.Menu>
    </Ariakit.MenuProvider>
  );
};

export default React.memo(MCPSubMenu);
