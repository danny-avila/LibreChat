import React from 'react';
import { Label } from '@librechat/client';
import type t from 'librechat-data-provider';
import { cn, renderAgentAvatar, getContactDisplayName } from '~/utils';
import { useLocalize } from '~/hooks';

interface AgentCardProps {
  agent: t.Agent; // The agent data to display
  onClick: () => void; // Callback when card is clicked
  className?: string; // Additional CSS classes
}

/**
 * Card component to display agent information
 */
const AgentCard: React.FC<AgentCardProps> = ({ agent, onClick, className = '' }) => {
  const localize = useLocalize();

  return (
    <div
      className={cn(
        'group relative h-40 overflow-hidden rounded-xl border border-border-light',
        'cursor-pointer shadow-sm transition-all duration-200 hover:border-border-medium hover:shadow-lg',
        'bg-surface-tertiary hover:bg-surface-hover',
        'space-y-3 p-4',
        className,
      )}
      onClick={onClick}
      aria-label={localize('com_agents_agent_card_label', {
        name: agent.name,
        description: agent.description ?? '',
      })}
      aria-describedby={`agent-${agent.id}-description`}
      tabIndex={0}
      role="button"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Two column layout */}
      <div className="flex h-full items-start gap-3">
        {/* Left column: Avatar and Category */}
        <div className="flex h-full flex-shrink-0 flex-col justify-between space-y-4">
          <div className="flex-shrink-0">{renderAgentAvatar(agent, { size: 'sm' })}</div>

          {/* Category tag */}
          {agent.category && (
            <div className="inline-flex items-center rounded-md border-border-xheavy bg-surface-active-alt px-2 py-1 text-xs font-medium">
              <Label className="line-clamp-1 font-normal">
                {agent.category.charAt(0).toUpperCase() + agent.category.slice(1)}
              </Label>
            </div>
          )}
        </div>

        {/* Right column: Name, description, and other content */}
        <div className="flex h-full min-w-0 flex-1 flex-col justify-between space-y-1">
          <div className="space-y-1">
            {/* Agent name */}
            <Label className="mb-1 line-clamp-1 text-xl font-semibold text-text-primary">
              {agent.name}
            </Label>

            {/* Agent description */}
            <p
              id={`agent-${agent.id}-description`}
              className="line-clamp-3 text-sm leading-relaxed text-text-primary"
              {...(agent.description ? { 'aria-label': `Description: ${agent.description}` } : {})}
            >
              {agent.description ?? ''}
            </p>
          </div>

          {/* Owner info - moved to bottom right */}
          {(() => {
            const displayName = getContactDisplayName(agent);
            if (displayName) {
              return (
                <div className="flex justify-end">
                  <div className="flex items-center text-sm text-text-secondary">
                    <Label>{displayName}</Label>
                  </div>
                </div>
              );
            }
            return null;
          })()}
        </div>
      </div>
    </div>
  );
};

export default AgentCard;
