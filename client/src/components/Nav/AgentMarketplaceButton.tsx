import { useCallback } from 'react';
import { LayoutGrid } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TooltipAnchor } from '@librechat/client';
import { useLocalize, useShowMarketplace } from '~/hooks';

/** Agent Marketplace entry in the sidebar's icon rail, directly under the New
 *  Chat button. Self-gated on marketplace permissions, so a deployment without
 *  access is left with no gap in the rail. */
export default function AgentMarketplaceButton() {
  const navigate = useNavigate();
  const localize = useLocalize();
  const showAgentMarketplace = useShowMarketplace();

  const handleAgentMarketplace = useCallback(() => {
    navigate('/agents');
  }, [navigate]);

  if (!showAgentMarketplace) {
    return null;
  }

  return (
    <TooltipAnchor
      side="right"
      description={localize('com_agents_marketplace')}
      render={
        <a
          href="/agents"
          data-testid="nav-agents-marketplace-button"
          aria-label={localize('com_agents_marketplace')}
          className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-surface-hover"
          onClick={(e) => {
            e.preventDefault();
            handleAgentMarketplace();
          }}
        >
          <LayoutGrid className="h-5 w-5 text-text-primary" aria-hidden="true" />
        </a>
      }
    />
  );
}
