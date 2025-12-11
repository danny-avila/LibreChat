import React, { useState, useMemo, useCallback } from 'react';
import * as Ariakit from '@ariakit/react';
import { ChevronRight, Search, X } from 'lucide-react';
import { MCPIcon, PinIcon } from '@librechat/client';
import MCPServerMenuItem from '~/components/MCP/MCPServerMenuItem';
import MCPConfigDialog from '~/components/MCP/MCPConfigDialog';
import { useBadgeRowContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface MCPSubMenuProps {
  placeholder?: string;
}

const SEARCH_THRESHOLD = 5;

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

    const [searchValue, setSearchValue] = useState('');

    const menuStore = Ariakit.useMenuStore({
      focusLoop: true,
      showTimeout: 100,
      placement: 'right',
    });

    const showSearch = selectableServers && selectableServers.length > SEARCH_THRESHOLD;

    const filteredServers = useMemo(() => {
      if (!selectableServers) {
        return [];
      }
      if (!searchValue.trim()) {
        return selectableServers;
      }
      const lowerSearch = searchValue.toLowerCase();
      return selectableServers.filter((server) =>
        (server.config?.title || server.serverName).toLowerCase().includes(lowerSearch),
      );
    }, [selectableServers, searchValue]);

    const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchValue(e.target.value);
    }, []);

    const clearSearch = useCallback(() => {
      setSearchValue('');
    }, []);

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
              'border border-border-light bg-presentation shadow-lg',
              showSearch ? 'p-0' : 'p-1.5',
            )}
          >
            {showSearch && (
              <div className="sticky top-0 z-10 border-b border-border-light bg-presentation p-1.5">
                <div className="flex items-center gap-2 rounded-lg bg-surface-tertiary px-2 py-1">
                  <Search className="h-3.5 w-3.5 text-text-secondary" aria-hidden="true" />
                  <input
                    type="text"
                    value={searchValue}
                    onChange={handleSearchChange}
                    placeholder={localize('com_ui_search') + '...'}
                    className="flex-1 border-none bg-transparent text-sm text-text-primary placeholder-text-secondary focus:outline-none"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    aria-label={localize('com_ui_search')}
                  />
                  {searchValue && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearSearch();
                      }}
                      className="flex h-4 w-4 items-center justify-center rounded text-text-secondary hover:text-text-primary"
                      aria-label="Clear search"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className={cn('flex flex-col', showSearch ? 'max-h-[320px] overflow-y-auto p-1.5' : 'max-h-[320px] overflow-y-auto', 'gap-1')}>
              {filteredServers.length === 0 ? (
                <div className="px-2 py-3 text-center text-sm text-text-secondary">
                  {localize('com_ui_no_results_found')}
                </div>
              ) : (
                filteredServers.map((server) => (
                  <MCPServerMenuItem
                    key={server.serverName}
                    server={server}
                    isSelected={mcpValues?.includes(server.serverName) ?? false}
                    connectionStatus={connectionStatus}
                    isInitializing={isInitializing}
                    statusIconProps={getServerStatusIconProps(server.serverName)}
                    onToggle={toggleServerSelection}
                  />
                ))
              )}
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
