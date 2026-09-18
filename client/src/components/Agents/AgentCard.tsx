import React, { useMemo, useState } from 'react';
import { Label, OGDialog, OGDialogTrigger } from '@librechat/client';
import type t from 'librechat-data-provider';
import Description, { getPlainDescription } from '~/components/ui/Description';
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
  const description = useMemo(() => getPlainDescription(agent.description), [agent.description]);

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
            'group relative flex h-32 gap-5 overflow-hidden rounded-xl',
            'cursor-pointer px-6 py-4 select-none',
            'bg-surface-tertiary hover:bg-surface-hover transition-colors duration-150',
            'md:h-36 lg:h-40',
            '[&_*]:cursor-pointer',
            className,
          )}
          aria-label={localize('com_agents_agent_card_label', {
            name: agent.name,
            description,
          })}
          aria-describedby={description ? `agent-${agent.id}-description` : undefined}
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
            <span className="bg-surface-hover text-text-secondary absolute top-3 right-4 rounded-md px-2 py-0.5 text-xs">
              {categoryLabel}
            </span>
          )}

          {/* Avatar */}
          <div className="shrink-0 self-center">
            <div className="overflow-hidden rounded-full shadow-[0_0_15px_rgba(0,0,0,0.3)] dark:shadow-[0_0_15px_rgba(0,0,0,0.5)]">
              {renderAgentAvatar(agent, { size: 'sm', showBorder: false })}
            </div>
          </div>

          {/* Content */}
          <div className="flex min-w-0 flex-1 flex-col justify-center overflow-hidden">
            {/* Agent name */}
            <Label className="text-text-primary line-clamp-2 text-base font-semibold md:text-lg">
              {agent.name}
            </Label>

            {/* Agent description */}
            {description && (
              <Description
                as="p"
                id={`agent-${agent.id}-description`}
                className="text-text-secondary mt-0.5 line-clamp-2 text-sm leading-snug md:line-clamp-5"
                aria-label={localize('com_agents_description_card', {
                  description,
                })}
                description={description}
                plainText
              />
            )}

            <AgentContact
              agent={agent}
              className="text-text-secondary [&_a]:text-text-secondary mt-1 text-xs [&_a]:font-normal"
            />
          </div>
        </div>
      </OGDialogTrigger>

      <AgentDetailContent agent={agent} />
    </OGDialog>
  );
};

export default AgentCard;
