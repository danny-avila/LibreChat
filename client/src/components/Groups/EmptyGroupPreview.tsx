import { Users, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@librechat/client';
import { useGetGroupStatsQuery } from './hooks';

export default function EmptyGroupPreview() {
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading } = useGetGroupStatsQuery();

  const handleCreateGroup = () => {
    navigate('/d/groups/new');
  };

  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
        <Users className="h-8 w-8 text-blue-600 dark:text-blue-400" />
      </div>
      
      <h2 className="mb-2 text-xl font-semibold text-text-primary">
        Group Management
      </h2>
      
      <p className="mb-6 max-w-md text-text-secondary">
        Create and manage user groups with time-based access control. 
        Organize users and set specific access windows for different groups.
      </p>

      {!statsLoading && stats && (
        <div className="mb-8 grid grid-cols-2 gap-4 text-sm">
          <div className="rounded-lg bg-surface-secondary p-4">
            <div className="text-2xl font-bold text-text-primary">
              {stats.totalGroups}
            </div>
            <div className="text-text-secondary">
              Total Groups
            </div>
          </div>
          <div className="rounded-lg bg-surface-secondary p-4">
            <div className="text-2xl font-bold text-text-primary">
              {stats.totalMembers}
            </div>
            <div className="text-text-secondary">
              Total Members
            </div>
          </div>
        </div>
      )}

      <Button
        onClick={handleCreateGroup}
        className="flex items-center gap-2"
      >
        <Plus className="h-4 w-4" />
        Create First Group
      </Button>
      
      <div className="mt-8 text-xs text-text-secondary">
        Select a group from the sidebar to view details and manage members
      </div>
    </div>
  );
}