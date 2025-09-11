import React, { useCallback, useContext } from 'react';
import { LayoutGrid } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { TooltipAnchor, Button } from '@librechat/client';
import { useLocalize, useHasAccess, AuthContext } from '~/hooks';

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
  const authContext = useContext(AuthContext);

  const hasAccessToAgents = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });

  const hasAccessToMarketplace = useHasAccess({
    permissionType: PermissionTypes.MARKETPLACE,
    permission: Permissions.USE,
  });

  const handleAgentMarketplace = useCallback(() => {
    navigate('/agents');
    if (isSmallScreen) {
      toggleNav();
    }
  }, [navigate, isSmallScreen, toggleNav]);

  // Check if auth is ready (avoid race conditions)
  const authReady =
    authContext?.isAuthenticated !== undefined &&
    (authContext?.isAuthenticated === false || authContext?.user !== undefined);

  // Show agent marketplace when marketplace permission is enabled, auth is ready, and user has access to agents
  const showAgentMarketplace = authReady && hasAccessToAgents && hasAccessToMarketplace;

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
          <LayoutGrid className="icon-lg text-text-primary" />
        </Button>
      }
    />
  );
}
