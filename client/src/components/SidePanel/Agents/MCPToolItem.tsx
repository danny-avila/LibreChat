import React from 'react';
import { Clock, MoreHorizontal, Code2 } from 'lucide-react';
import {
  Checkbox,
  DropdownMenu,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from '@librechat/client';
import type { AgentToolType } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface MCPToolItemProps {
  tool: AgentToolType;
  isSelected: boolean;
  isDeferred: boolean;
  isProgrammatic: boolean;
  deferredToolsEnabled: boolean;
  programmaticToolsEnabled: boolean;
  onToggleSelect: () => void;
  onToggleDefer: () => void;
  onToggleProgrammatic: () => void;
}

function getToolItemStyle(isDeferred: boolean, isProgrammatic: boolean): string {
  if (isDeferred && isProgrammatic) {
    return 'border-purple-500/50 bg-purple-500/5 hover:bg-purple-500/10';
  }
  if (isDeferred) {
    return 'border-amber-500/50 bg-amber-500/5 hover:bg-amber-500/10';
  }
  if (isProgrammatic) {
    return 'border-violet-500/50 bg-violet-500/5 hover:bg-violet-500/10';
  }
  return 'border-token-border-light hover:bg-token-surface-secondary';
}

export default function MCPToolItem({
  tool,
  isSelected,
  isDeferred,
  onToggleDefer,
  onToggleSelect,
  isProgrammatic,
  onToggleProgrammatic,
  deferredToolsEnabled,
  programmaticToolsEnabled,
}: MCPToolItemProps) {
  const localize = useLocalize();
  const hasOptions = isDeferred || isProgrammatic;

  return (
    <div
      className={cn(
        'group/item flex cursor-pointer items-center rounded-lg border p-2',
        'ml-2 mr-1 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
        getToolItemStyle(isDeferred, isProgrammatic),
      )}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Checkbox
        id={tool.tool_id}
        checked={isSelected}
        onCheckedChange={onToggleSelect}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const checkbox = e.currentTarget as HTMLButtonElement;
            checkbox.click();
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className="relative mr-2 inline-flex h-4 w-4 shrink-0 cursor-pointer rounded border border-border-medium transition-[border-color] duration-200 hover:border-border-heavy focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
        aria-label={tool.metadata.name}
      />
      <span className="text-token-text-primary min-w-0 flex-1 select-none truncate">
        {tool.metadata.name}
      </span>
      <div className="ml-2 flex shrink-0 items-center gap-1.5">
        {isDeferred && <Clock className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />}
        {isProgrammatic && <Code2 className="h-3.5 w-3.5 text-violet-500" aria-hidden="true" />}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded transition-all duration-200',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                hasOptions
                  ? 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                  : 'text-text-tertiary opacity-0 hover:bg-surface-hover hover:text-text-primary group-focus-within/item:opacity-100 group-hover/item:opacity-100',
              )}
              onClick={(e) => e.stopPropagation()}
              aria-label={localize('com_ui_mcp_tool_options')}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            side="left"
            className="w-80"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenuLabel className="text-xs font-normal text-text-primary">
              {tool.metadata.description || localize('com_ui_mcp_no_description')}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {deferredToolsEnabled && (
              <DropdownMenuCheckboxItem
                checked={isDeferred}
                onCheckedChange={onToggleDefer}
                className="cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  <div className="flex flex-col">
                    <span>{localize('com_ui_mcp_defer_loading')}</span>
                    <span className="text-xs text-text-secondary">
                      {localize('com_ui_mcp_click_to_defer')}
                    </span>
                  </div>
                </div>
              </DropdownMenuCheckboxItem>
            )}
            {programmaticToolsEnabled && (
              <DropdownMenuCheckboxItem
                checked={isProgrammatic}
                onCheckedChange={onToggleProgrammatic}
                className="cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-violet-500" />
                  <div className="flex flex-col">
                    <span>{localize('com_ui_mcp_programmatic')}</span>
                    <span className="text-xs text-text-secondary">
                      {localize('com_ui_mcp_click_to_programmatic')}
                    </span>
                  </div>
                </div>
              </DropdownMenuCheckboxItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
