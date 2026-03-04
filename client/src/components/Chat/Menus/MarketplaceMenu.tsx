import { useNavigate } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import { TooltipAnchor, Button } from '@librechat/client';
import { useLocalize } from '~/hooks';

export default function MarketplaceMenu() {
  const localize = useLocalize();
  const navigate = useNavigate();

  return (
    <TooltipAnchor
      description={localize('com_agents_marketplace')}
      render={
        <Button
          size="icon"
          variant="outline"
          data-testid="header-marketplace-button"
          aria-label={localize('com_agents_marketplace')}
          className="rounded-xl bg-presentation duration-0 hover:bg-surface-active-alt max-md:hidden"
          onClick={() => navigate('/agents')}
        >
          <LayoutGrid className="icon-lg text-text-primary" aria-hidden="true" />
        </Button>
      }
    />
  );
}
