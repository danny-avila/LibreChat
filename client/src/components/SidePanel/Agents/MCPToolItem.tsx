import { useState } from 'react';
import { TooltipAnchor } from '@librechat/client';
import { Check, Clock, Code2, Info } from 'lucide-react';
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

const iconButton =
  'flex size-6 items-center justify-center rounded-md transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary';

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
  const [expanded, setExpanded] = useState(false);

  const description = tool.metadata.description?.trim();
  const detailsId = `mcp-tool-details-${tool.tool_id}`;

  return (
    <div className="overflow-hidden rounded-lg">
      <div className="flex items-center gap-1 rounded-lg pr-1 transition-colors hover:bg-surface-secondary">
        <button
          type="button"
          onClick={onToggleSelect}
          aria-pressed={isSelected}
          aria-label={tool.metadata.name}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-2 text-left',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'flex size-4 shrink-0 items-center justify-center rounded border border-border-medium transition-colors',
              isSelected && 'bg-primary text-primary-foreground',
            )}
          >
            {isSelected && <Check className="size-4" />}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
            {tool.metadata.name}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          {deferredToolsEnabled && (
            <TooltipAnchor
              description={localize('com_ui_mcp_click_to_defer')}
              side="top"
              render={
                <button
                  type="button"
                  onClick={onToggleDefer}
                  aria-pressed={isDeferred}
                  aria-label={localize('com_ui_mcp_defer_loading')}
                  className={cn(
                    iconButton,
                    isDeferred ? 'text-amber-500' : 'text-text-secondary hover:text-text-primary',
                  )}
                >
                  <Clock className="size-4" aria-hidden="true" />
                </button>
              }
            />
          )}
          {programmaticToolsEnabled && (
            <TooltipAnchor
              description={localize('com_ui_mcp_click_to_programmatic')}
              side="top"
              render={
                <button
                  type="button"
                  onClick={onToggleProgrammatic}
                  aria-pressed={isProgrammatic}
                  aria-label={localize('com_ui_mcp_programmatic')}
                  className={cn(
                    iconButton,
                    isProgrammatic
                      ? 'text-violet-500'
                      : 'text-text-secondary hover:text-text-primary',
                  )}
                >
                  <Code2 className="size-4" aria-hidden="true" />
                </button>
              }
            />
          )}
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-controls={detailsId}
            aria-label={localize('com_ui_tools_info')}
            className={cn(
              iconButton,
              expanded ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary',
            )}
          >
            <Info className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {/* Auto-height reveal via grid-template-rows 0fr -> 1fr so the panel — and
          the auto-sized dialog around it — grow/shrink smoothly instead of jumping. */}
      <div
        id={detailsId}
        className={cn(
          'grid transition-[grid-template-rows] [transition-duration:var(--resize-dur)] [transition-timing-function:var(--resize-ease)] motion-reduce:transition-none',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className={cn(
              'border-t border-border-light px-3 py-3 transition-opacity duration-200 ease-out motion-reduce:transition-none',
              expanded ? 'opacity-100' : 'opacity-0',
            )}
          >
            <p className="max-h-44 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-text-secondary">
              {description || localize('com_ui_mcp_no_description')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
