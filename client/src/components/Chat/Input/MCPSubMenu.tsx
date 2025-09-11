import React from 'react';
import * as Ariakit from '@ariakit/react';
import { ChevronRight } from 'lucide-react';
import { PinIcon, MCPIcon } from '@librechat/client';
import MCPServerStatusIcon from '~/components/MCP/MCPServerStatusIcon';
import MCPConfigDialog from '~/components/MCP/MCPConfigDialog';
import { useBadgeRowContext } from '~/Providers';
import { cn } from '~/utils';

interface MCPSubMenuProps {
  placeholder?: string;
}

const MCPSubMenu = React.forwardRef<HTMLDivElement, MCPSubMenuProps>(
  ({ placeholder, ...props }, ref) => {
    const { mcpServerManager } = useBadgeRowContext();
    const {
      isPinned,
      mcpValues,
      setIsPinned,
      isInitializing,
      placeholderText,
      configuredServers,
      getConfigDialogProps,
      toggleServerSelection,
      getServerStatusIconProps,
    } = mcpServerManager;

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
      <div ref={ref}>
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
              const isServerInitializing = isInitializing(serverName);

              const statusIcon = statusIconProps && <MCPServerStatusIcon {...statusIconProps} />;

              return (
                <Ariakit.MenuItem
                  key={serverName}
                  onClick={(event) => {
                    event.preventDefault();
                    toggleServerSelection(serverName);
                  }}
                  disabled={isServerInitializing}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-2 py-1.5 text-text-primary hover:cursor-pointer',
                    'scroll-m-1 outline-none transition-colors',
                    'hover:bg-black/[0.075] dark:hover:bg-white/10',
                    'data-[active-item]:bg-black/[0.075] dark:data-[active-item]:bg-white/10',
                    'w-full min-w-0 justify-between text-sm',
                    isServerInitializing &&
                      'opacity-50 hover:bg-transparent dark:hover:bg-transparent',
                  )}
                >
                  <div className="flex flex-grow items-center gap-2">
                    <Ariakit.MenuItemCheck checked={isSelected} />
                    <span>{serverName}</span>
                  </div>
                  {statusIcon && <div className="ml-2 flex items-center">{statusIcon}</div>}
                </Ariakit.MenuItem>
              );
            })}
          </Ariakit.Menu>
        </Ariakit.MenuProvider>
        {configDialogProps && <MCPConfigDialog {...configDialogProps} />}
      </div>
    );
  },
);

MCPSubMenu.displayName = 'MCPSubMenu';

export default React.memo(MCPSubMenu);
