import React from 'react';

import type t from 'librechat-data-provider';

import useLocalize from '~/hooks/useLocalize';
import { renderAgentAvatar, getContactDisplayName } from '~/utils/agents';
import { cn } from '~/utils';

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
        'group relative flex overflow-hidden rounded-2xl',
        'cursor-pointer transition-colors duration-200',
        'aspect-[5/2.5] w-full',
        'bg-gray-50 hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600',
        className,
      )}
      onClick={onClick}
      aria-label={localize('com_agents_agent_card_label', {
        name: agent.name,
        description: agent.description || localize('com_agents_no_description'),
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
      <div className="flex h-full gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
        {/* Agent avatar section - left side, responsive */}
        <div className="flex flex-shrink-0 items-center">
          {renderAgentAvatar(agent, { size: 'md' })}
        </div>

        {/* Agent info section - right side, responsive */}
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          {/* Agent name - responsive text sizing */}
          <h3 className="mb-1 line-clamp-1 text-base font-bold text-gray-900 dark:text-white sm:mb-2 sm:text-lg">
            {agent.name}
          </h3>

          {/* Agent description - responsive text sizing and spacing */}
          <p
            id={`agent-${agent.id}-description`}
            className={cn(
              'mb-1 line-clamp-2 text-xs leading-relaxed text-gray-600 dark:text-gray-300',
              'sm:mb-2 sm:text-sm',
            )}
            aria-label={`Description: ${agent.description || localize('com_agents_no_description')}`}
          >
            {agent.description || (
              <span className="italic text-gray-400">{localize('com_agents_no_description')}</span>
            )}
          </p>

          {/* Owner info - responsive text sizing */}
          {(() => {
            const displayName = getContactDisplayName(agent);

            if (displayName) {
              return (
                <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
                  <span className="font-light">{localize('com_agents_created_by')}</span>
                  <span className="ml-1 font-bold">{displayName}</span>
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
