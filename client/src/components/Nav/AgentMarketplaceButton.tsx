import React, { useCallback } from 'react';
import { LayoutGrid } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TooltipAnchor, Button } from '@librechat/client';
import { useLocalize, useShowMarketplace } from '~/hooks';

interface AgentMarketplaceButtonProps {
  isSmallScreen?: boolean;
  toggleNav: () => void;
}

export default function AgentMarketplaceButton({
  isSmallScreen,
  toggleNav,
}: AgentMarketplaceButtonProps) {
  const navigate = useNavigate();
  const localize = useLocalize();
  const showAgentMarketplace = useShowMarketplace();

  const handleAgentMarketplace = useCallback(() => {
    navigate('/agents');
    if (isSmallScreen) {
      toggleNav();
    }
  }, [navigate, isSmallScreen, toggleNav]);

  if (!showAgentMarketplace) {
    return null;
  }

  return (
    <TooltipAnchor
      description={localize('com_agents_marketplace')}
      render={
        <Button
          variant="outline"
          data-testid="nav-agents-marketplace-button"
          aria-label={localize('com_agents_marketplace')}
          className="rounded-full border-none bg-transparent p-2 hover:bg-surface-hover md:rounded-xl"
          onClick={handleAgentMarketplace}
        >
          <LayoutGrid className="icon-lg text-text-primary" aria-hidden="true" />
        </Button>
      }
    />
  );
}
