import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@librechat/client';
import { Users, UserCheck } from 'lucide-react';
import UserLeaderboard from './Users/UserLeaderboard';
import GroupLeaderboard from './Groups/GroupLeaderboard';

const Statistics: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const getCurrentTab = () => {
    if (location.pathname.includes('/groups')) return 'groups';
    if (location.pathname.includes('/users')) return 'users';
    return 'groups'; // Default to groups
  };

  const [activeTab, setActiveTab] = useState(getCurrentTab());

  useEffect(() => {
    setActiveTab(getCurrentTab());
  }, [location.pathname]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === 'users') {
      navigate('/d/statistics/users');
    } else if (value === 'groups') {
      navigate('/d/statistics/groups');
    }
  };

  const isSpecificRoute = location.pathname.includes('/users/') || location.pathname.includes('/groups/');

  if (isSpecificRoute) {
    return <Outlet />;
  }

  return (
    <div className="flex h-full w-full flex-col">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex h-full flex-col">
        <TabsList className="mx-auto mb-4 grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="groups" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Group Statistics
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            User Leaderboard
          </TabsTrigger>
        </TabsList>
        
        <div className="flex-1 overflow-auto px-4">
          <TabsContent value="groups" className="h-full">
            <GroupLeaderboard />
          </TabsContent>
          <TabsContent value="users" className="h-full">
            <UserLeaderboard />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default Statistics;