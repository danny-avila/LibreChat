import React, { useMemo, useState, useEffect } from 'react';
import { Label } from '@librechat/client';
import type t from 'librechat-data-provider';
import { useLocalize, TranslationKeys, useAgentCategories } from '~/hooks';
import { cn, renderAgentAvatar, getContactDisplayName } from '~/utils';

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
  const { categories } = useAgentCategories();
  const queryClient: any = (globalThis as any).__REACT_QUERY_CLIENT__;

  const favoriteData = queryClient?.getQueryData?.(['user', 'favoriteAgents']) as
    | { favoriteAgents: string[] }
    | undefined;
  const favoriteIds = favoriteData?.favoriteAgents ?? [];
  const isFavorite = favoriteIds.includes(agent.id);
  const [favorited, setFavorited] = useState<boolean>(isFavorite);

  // Ensure initial favorite state reflects server data in Marketplace
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const { dataService } = await import('librechat-data-provider');
        const res = await dataService.getFavoriteAgents();
        if (!ignore) {
          const ids = res?.favoriteAgents ?? [];
          setFavorited(ids.includes(agent.id));
        }
      } catch (_err) {
        // ignore
      }
    })();
    return () => {
      ignore = true;
    };
  }, [agent.id]);

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (favorited) {
        const { dataService } = await import('librechat-data-provider');
        const res = await dataService.removeFavoriteAgent(agent.id);
        queryClient?.setQueryData?.(['user', 'favoriteAgents'], res);
        setFavorited(false);
        try {
          window.dispatchEvent(
            new CustomEvent('favoriteAgentsUpdated', {
              detail: { id: agent.id, favorited: false },
            }),
          );
        } catch (_err) {
          void 0;
        }
      } else {
        const { dataService } = await import('librechat-data-provider');
        const res = await dataService.addFavoriteAgent(agent.id);
        queryClient?.setQueryData?.(['user', 'favoriteAgents'], res);
        setFavorited(true);
        try {
          window.dispatchEvent(
            new CustomEvent('favoriteAgentsUpdated', {
              detail: { id: agent.id, favorited: true },
            }),
          );
        } catch (_err) {
          void 0;
        }
      }
    } catch (_err) {
      // ignore
    }
  };

  const categoryLabel = useMemo(() => {
    if (!agent.category) return '';

    const category = categories.find((cat) => cat.value === agent.category);
    if (category) {
      if (category.label && category.label.startsWith('com_')) {
        return localize(category.label as TranslationKeys);
      }
      return category.label;
    }

    return agent.category.charAt(0).toUpperCase() + agent.category.slice(1);
  }, [agent.category, categories, localize]);

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
      {/* Favorite toggle */}
      <button
        role="switch"
        aria-checked={favorited}
        aria-label={favorited ? 'Unfavorite agent' : 'Favorite agent'}
        onClick={toggleFavorite}
        className="absolute right-3 top-3 rounded-full p-1 hover:bg-surface-hover"
      >
        <svg
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          className={`size-5 ${favorited ? 'fill-yellow-400 text-yellow-400' : 'text-text-secondary'}`}
          aria-hidden="true"
        >
          <path
            d="M12 17.27l-5.197 3.084 1.39-5.96L3 9.82l6.02-.52L12 3l2.98 6.3L21 9.82l-5.193 4.574 1.39 5.96z"
            fill="currentColor"
          />
        </svg>
      </button>
      {/* Two column layout */}
      <div className="flex h-full items-start gap-3">
        {/* Left column: Avatar and Category */}
        <div className="flex h-full flex-shrink-0 flex-col justify-between space-y-4">
          <div className="flex-shrink-0">{renderAgentAvatar(agent, { size: 'sm' })}</div>

          {/* Category tag */}
          {agent.category && (
            <div className="inline-flex items-center rounded-md border-border-xheavy bg-surface-active-alt px-2 py-1 text-xs font-medium">
              <Label className="line-clamp-1 font-normal">{categoryLabel}</Label>
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
