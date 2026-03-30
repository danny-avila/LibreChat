import React from 'react';
import { BarChart3, Users, TrendingUp } from 'lucide-react';
import { Button } from '@librechat/client';
import { useNavigate } from 'react-router-dom';
import { useCustomLink } from '~/hooks';

export default function StatisticsAccordion() {
  const navigate = useNavigate();
  const userStatsLink = useCustomLink('/d/statistics/users');
  const groupStatsLink = useCustomLink('/d/statistics/groups');
  const handleUserStats = (e: React.MouseEvent<HTMLButtonElement>) => {
    userStatsLink(e as unknown as React.MouseEvent<HTMLAnchorElement>);
  };

  const handleGroupStats = (e: React.MouseEvent<HTMLButtonElement>) => {
    groupStatsLink(e as unknown as React.MouseEvent<HTMLAnchorElement>);
  };

  return (
    <div className="flex h-full w-full flex-col space-y-2 p-2">
      <div className="flex flex-col space-y-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start bg-transparent hover:bg-surface-hover"
          onClick={handleUserStats}
        >
          <Users className="mr-2 h-4 w-4" />
          User Leaderboard
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start bg-transparent hover:bg-surface-hover"
          onClick={handleGroupStats}
        >
          <TrendingUp className="mr-2 h-4 w-4" />
          Group Statistics
        </Button>

        <div className="my-2 border-t border-border-light"></div>

        <div className="px-2 py-1 text-xs font-semibold text-text-secondary">
          Analytics & Reports
        </div>

        <div className="px-2 text-xs text-text-secondary">
          <p>View detailed usage statistics, token consumption, and platform analytics.</p>
        </div>
      </div>
    </div>
  );
}
