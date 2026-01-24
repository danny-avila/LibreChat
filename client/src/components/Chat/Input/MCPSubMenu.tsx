import React from 'react';
import * as Ariakit from '@ariakit/react';
import { ChevronRight } from 'lucide-react';
import { MCPIcon, PinIcon } from '@librechat/client';
import MCPServerMenuItem from '~/components/MCP/MCPServerMenuItem';
import MCPConfigDialog from '~/components/MCP/MCPConfigDialog';
import { useBadgeRowContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface MCPSubMenuProps {
  placeholder?: string;
}

const MCPSubMenu = React.forwardRef<HTMLDivElement, MCPSubMenuProps>(
  ({ placeholder, ...props }, ref) => {
    const localize = useLocalize();
    const { mcpServerManager } = useBadgeRowContext();
    const {
      isPinned,
      mcpValues,
      setIsPinned,
      placeholderText,
      selectableServers,
      connectionStatus,
      isInitializing,
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
    if (!selectableServers || selectableServers.length === 0) {
      return null;
    }

    const configDialogProps = getConfigDialogProps();

    return (
      <div ref={ref}>
        <Ariakit.MenuProvider store={menuStore}>
          <Ariakit.MenuItem
            {...props}
            hideOnClick={false}
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
              <MCPIcon className="h-5 w-5 flex-shrink-0 text-text-primary" aria-hidden="true" />
              <span>{placeholder || placeholderText}</span>
              <ChevronRight className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
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
              aria-label={isPinned ? localize('com_ui_unpin') : localize('com_ui_pin')}
            >
              <div className="h-4 w-4">
                <PinIcon unpin={isPinned} />
              </div>
            </button>
          </Ariakit.MenuItem>

          <Ariakit.Menu
            portal={true}
            unmountOnHide={true}
            aria-label={localize('com_ui_mcp_servers')}
            className={cn(
              'animate-popover-left z-40 ml-3 flex min-w-[260px] max-w-[320px] flex-col rounded-xl',
              'border border-border-light bg-presentation p-1.5 shadow-lg',
            )}
          >
            <div className="flex max-h-[320px] flex-col gap-1 overflow-y-auto">
              {selectableServers.map((server) => (
                <MCPServerMenuItem
                  key={server.serverName}
                  server={server}
                  isSelected={mcpValues?.includes(server.serverName) ?? false}
                  connectionStatus={connectionStatus}
                  isInitializing={isInitializing}
                  statusIconProps={getServerStatusIconProps(server.serverName)}
                  onToggle={toggleServerSelection}
                />
              ))}
            </div>
          </Ariakit.Menu>
        </Ariakit.MenuProvider>
        {configDialogProps && <MCPConfigDialog {...configDialogProps} />}
      </div>
    );
  },
);

MCPSubMenu.displayName = 'MCPSubMenu';

export default React.memo(MCPSubMenu);
