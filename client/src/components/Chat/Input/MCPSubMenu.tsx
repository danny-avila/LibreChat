import React from 'react';
import * as Ariakit from '@ariakit/react';
import { ChevronRight } from 'lucide-react';
import { PinIcon, MCPIcon } from '~/components/svg';
import MCPConfigDialog from '~/components/ui/MCP/MCPConfigDialog';
import MCPServerStatusIcon from '~/components/ui/MCP/MCPServerStatusIcon';
import { useMCPServerManager } from '~/hooks/MCP/useMCPServerManager';
import { cn } from '~/utils';

interface MCPSubMenuProps {
  placeholder?: string;
}

const MCPSubMenu = ({ placeholder, ...props }: MCPSubMenuProps) => {
  const {
    configuredServers,
    mcpValues,
    isPinned,
    setIsPinned,
    placeholderText,
    toggleServerSelection,
    getServerStatusIconProps,
    getConfigDialogProps,
  } = useMCPServerManager();

  const menuStore = Ariakit.useMenuStore({
    focusLoop: true,
    showTimeout: 100,
    placement: 'right',
  });

  // Don't render if no MCP servers are configured
  if (!configuredServers || configuredServers.length === 0) {
    return null;
  }

  const configDialogProps = getConfigDialogProps();

  return (
    <>
      <Ariakit.MenuProvider store={menuStore}>
        <Ariakit.MenuItem
          {...props}
          render={
            <Ariakit.MenuButton
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.stopPropagation();
                menuStore.toggle();
              }}
              className="flex w-full cursor-pointer items-center justify-between rounded-lg p-2 hover:bg-surface-hover"
            />
          }
        >
          <div className="flex items-center gap-2">
            <MCPIcon className="icon-md" />
            <span>{placeholder || placeholderText}</span>
            <ChevronRight className="ml-auto h-3 w-3" />
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsPinned(!isPinned);
            }}
            className={cn(
              'rounded p-1 transition-all duration-200',
              'hover:bg-surface-tertiary hover:shadow-sm',
              !isPinned && 'text-text-secondary hover:text-text-primary',
            )}
            aria-label={isPinned ? 'Unpin' : 'Pin'}
          >
            <div className="h-4 w-4">
              <PinIcon unpin={isPinned} />
            </div>
          </button>
        </Ariakit.MenuItem>
        <Ariakit.Menu
          portal={true}
          unmountOnHide={true}
          className={cn(
            'animate-popover-left z-50 ml-3 flex min-w-[200px] flex-col rounded-xl',
            'border border-border-light bg-surface-secondary p-1 shadow-lg',
          )}
        >
          {configuredServers.map((serverName) => {
            const statusIconProps = getServerStatusIconProps(serverName);
            const isSelected = mcpValues?.includes(serverName) ?? false;

            const statusIcon = statusIconProps && <MCPServerStatusIcon {...statusIconProps} />;

            return (
              <Ariakit.MenuItem
                key={serverName}
                onClick={(event) => {
                  event.preventDefault();
                  toggleServerSelection(serverName);
                }}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-2 py-1.5 text-text-primary hover:cursor-pointer',
                  'scroll-m-1 outline-none transition-colors',
                  'hover:bg-black/[0.075] dark:hover:bg-white/10',
                  'data-[active-item]:bg-black/[0.075] dark:data-[active-item]:bg-white/10',
                  'w-full min-w-0 justify-between text-sm',
                )}
              >
                <button
                  type="button"
                  className="flex flex-grow items-center gap-2 rounded bg-transparent p-0 text-left transition-colors focus:outline-none"
                  tabIndex={0}
                >
                  <Ariakit.MenuItemCheck checked={isSelected} />
                  <span>{serverName}</span>
                </button>
                {statusIcon && <div className="ml-2 flex items-center">{statusIcon}</div>}
              </Ariakit.MenuItem>
            );
          })}
        </Ariakit.Menu>
      </Ariakit.MenuProvider>
      {configDialogProps && <MCPConfigDialog {...configDialogProps} />}
    </>
  );
};

export default React.memo(MCPSubMenu);
