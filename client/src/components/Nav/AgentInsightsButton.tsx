import React, { useCallback, useContext } from 'react';
import { BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TooltipAnchor, Button } from '@librechat/client';
import { useLocalize, AuthContext } from '~/hooks';

interface AgentInsightsButtonProps {
  isSmallScreen?: boolean;
  toggleNav: () => void;
}

export default function AgentInsightsButton({
  isSmallScreen,
  toggleNav,
}: AgentInsightsButtonProps) {
  const navigate = useNavigate();
  const localize = useLocalize();
  const authContext = useContext(AuthContext);

  const handleAgentInsights = useCallback(() => {
    navigate('/insights');
    if (isSmallScreen) {
      toggleNav();
    }
  }, [navigate, isSmallScreen, toggleNav]);

  // Check if auth is ready (avoid race conditions)
  const authReady =
    authContext?.isAuthenticated !== undefined &&
    (authContext?.isAuthenticated === false || authContext?.user !== undefined);

  if (!authReady || !authContext?.isAuthenticated) {
    return null;
  }

  return (
    <TooltipAnchor
      description="Agent Insights"
      render={
        <Button
          variant="outline"
          data-testid="nav-agent-insights-button"
          aria-label="Agent Insights"
          className="rounded-full border-none bg-transparent p-2 hover:bg-surface-hover md:rounded-xl"
          onClick={handleAgentInsights}
        >
          <BarChart3 className="icon-lg text-text-primary" />
        </Button>
      }
    />
  );
}
