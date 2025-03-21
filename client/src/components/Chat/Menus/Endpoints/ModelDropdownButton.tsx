import React from 'react';
import { MenuButton } from '@ariakit/react';
import { isAgentsEndpoint } from 'librechat-data-provider';
import type { TModelSpec } from 'librechat-data-provider';
import Icon from '~/components/Endpoints/Icon';
import SpecIcon from './SpecIcon';
import { cn } from '~/utils';

interface ModelDropdownButtonProps {
  displayValue: string;
  currentModelSpec?: TModelSpec | null;
  currentEndpointItem?: any;
  endpoint?: string;
  selectedAgentId?: string;
  agentsMap: Record<string, any>;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  isMobile: boolean;
  endpointsConfig: any;
}

const ModelDropdownButton = ({
  displayValue,
  currentModelSpec,
  currentEndpointItem,
  endpoint,
  selectedAgentId,
  agentsMap,
  menuOpen,
  setMenuOpen,
  isMobile,
  endpointsConfig,
}: ModelDropdownButtonProps) => {
  const isAgent = isAgentsEndpoint(endpoint as string) && selectedAgentId;

  const renderIcon = () => {
    if (currentModelSpec) {
      return <SpecIcon currentSpec={currentModelSpec} endpointsConfig={endpointsConfig} />;
    }

    if (currentEndpointItem?.icon) {
      return isAgent ? (
        <Icon
          isCreatedByUser={false}
          endpoint={endpoint}
          agentName={agentsMap[selectedAgentId]?.name || ''}
          iconURL={agentsMap[selectedAgentId]?.avatar?.filepath}
          className="rounded-full"
          aria-hidden="true"
        />
      ) : (
        currentEndpointItem.icon
      );
    }

    return null;
  };

  return (
    <MenuButton
      onClick={() => setMenuOpen(!menuOpen)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setMenuOpen(!menuOpen);
        }
      }}
      tabIndex={0}
      role="button"
      aria-haspopup="true"
      aria-expanded={menuOpen}
      aria-label={`Select model: ${displayValue}`}
      className={cn(
        'flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border-light px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
        menuOpen ? 'bg-surface-tertiary' : 'bg-surface-secondary hover:bg-surface-tertiary',
        isMobile && 'text-base',
      )}
    >
      {(currentModelSpec || currentEndpointItem?.icon) && (
        <div
          className={cn(
            'flex h-5 w-5 items-center justify-center overflow-hidden text-text-primary',
            isAgent && 'rounded-full',
            isMobile && 'h-6 w-6',
          )}
          aria-hidden="true"
        >
          {renderIcon()}
        </div>
      )}
      <span className="flex-grow truncate text-left">{displayValue}</span>
    </MenuButton>
  );
};

export default ModelDropdownButton;
