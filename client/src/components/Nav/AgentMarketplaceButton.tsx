import { Link } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import { useLocalize, useShowMarketplace } from '~/hooks';

/** Agent Marketplace entry in the sidebar's icon rail, directly under the New
 *  Chat button. Self-gated on marketplace permissions, so a deployment without
 *  access is left with no gap in the rail. */
export default function AgentMarketplaceButton() {
  const localize = useLocalize();
  const showAgentMarketplace = useShowMarketplace();

  if (!showAgentMarketplace) {
    return null;
  }

  return (
    <TooltipAnchor
      side="right"
      description={localize('com_agents_marketplace')}
      render={
        /** A router Link rather than an anchor with a swallowed default, so
         *  modifier- and middle-clicks still open the marketplace in a new tab. */
        <Link
          to="/agents"
          data-testid="nav-agents-marketplace-button"
          aria-label={localize('com_agents_marketplace')}
          className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-surface-hover"
        >
          <LayoutGrid className="h-5 w-5 text-text-primary" aria-hidden="true" />
        </Link>
      }
    />
  );
}
