import React, { useMemo, useState } from 'react';
import { Label, OGDialog, OGDialogTrigger } from '@librechat/client';
import type t from 'librechat-data-provider';
import { useLocalize, TranslationKeys, useAgentCategories } from '~/hooks';
import AgentDetailContent from './AgentDetailContent';
import { cn, renderAgentAvatar } from '~/utils';
import AgentContact from './AgentContact';

interface AgentCardProps {
  agent: t.Agent;
  onSelect?: (agent: t.Agent) => void;
  className?: string;
}

/**
 * Card component to display agent information with integrated detail dialog
 */
const AgentCard: React.FC<AgentCardProps> = ({ agent, onSelect, className = '' }) => {
  const localize = useLocalize();
  const { categories } = useAgentCategories();
  const [isOpen, setIsOpen] = useState(false);

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

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open && onSelect) {
      onSelect(agent);
    }
  };

  return (
    <OGDialog open={isOpen} onOpenChange={handleOpenChange}>
      <OGDialogTrigger asChild>
        <div
          className={cn(
            'group relative flex h-full min-h-[150px] flex-col gap-2.5 overflow-hidden rounded-xl',
            'cursor-pointer select-none p-4',
            'bg-surface-tertiary transition-colors duration-150 hover:bg-surface-hover',
            '[&_*]:cursor-pointer',
            className,
          )}
          aria-label={localize('com_agents_agent_card_label', {
            name: agent.name,
            description: agent.description ?? '',
          })}
          aria-describedby={agent.description ? `agent-${agent.id}-description` : undefined}
          tabIndex={0}
          role="button"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsOpen(true);
            }
          }}
        >
          {/* Category badge - top right */}
          {categoryLabel && (
            <span className="absolute right-3.5 top-3.5 rounded-md bg-surface-hover px-1.5 py-0.5 text-xs text-text-secondary">
              {categoryLabel}
            </span>
          )}

          {/* Avatar + name, on one row so the card stays compact. `pr-14` reserves
              room for the absolutely-positioned category badge above. */}
          <div className="flex items-center gap-2.5 pr-14">
            <div className="flex-shrink-0 overflow-hidden rounded-full shadow-[0_0_15px_rgba(0,0,0,0.3)] dark:shadow-[0_0_15px_rgba(0,0,0,0.5)]">
              {renderAgentAvatar(agent, { size: 'xs', showBorder: false })}
            </div>
            {/* `w-auto` overrides Label's default `w-full`, which would otherwise
                stretch the name across the whole row */}
            <Label className="line-clamp-2 w-auto text-sm font-semibold leading-snug text-text-primary">
              {agent.name}
            </Label>
          </div>

          {/* Agent description */}
          {agent.description && (
            <p
              id={`agent-${agent.id}-description`}
              className="line-clamp-3 text-xs leading-snug text-text-secondary"
              aria-label={localize('com_agents_description_card', {
                description: agent.description,
              })}
            >
              {agent.description}
            </p>
          )}

          <div className="flex-1" />

          <AgentContact
            agent={agent}
            className="text-[11px] text-text-tertiary [&_a]:font-normal [&_a]:text-text-tertiary"
          />
        </div>
      </OGDialogTrigger>

      <AgentDetailContent agent={agent} />
    </OGDialog>
  );
};

export default AgentCard;
