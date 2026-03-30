import { useState, useEffect } from 'react';
import { Plus, Settings, Users, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@librechat/client';
import { useCustomLink, useLocalize } from '~/hooks';

interface Group {
  _id: string;
  name: string;
  description: string;
  memberCount: number;
  isActive: boolean;
}

export default function GroupsAccordion() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  
  const manageGroupsLink = useCustomLink('/d/groups');
  const newGroupLink = useCustomLink('/d/groups/new');

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      // Use relative URL to leverage Vite proxy
      const response = await fetch('/api/groups');
      const data = await response.json();
      console.log('GroupsAccordion fetch response:', data); // Debug log
      if (data.success && data.data?.groups) {
        setGroups(data.data.groups);
      }
    } catch (error) {
      console.error('Failed to fetch groups:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleManageGroups = (e: React.MouseEvent<HTMLButtonElement>) => {
    manageGroupsLink(e as unknown as React.MouseEvent<HTMLAnchorElement>);
  };

  const handleNewGroup = (e: React.MouseEvent<HTMLButtonElement>) => {
    newGroupLink(e as unknown as React.MouseEvent<HTMLAnchorElement>);
  };

  const handleGroupClick = (groupId: string) => {
    navigate(`/d/groups/${groupId}`);
  };

  return (
    <div className="flex h-full w-full flex-col space-y-2 p-2">
      <div className="flex flex-col space-y-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start bg-transparent hover:bg-surface-hover"
          onClick={handleManageGroups}
        >
          <Settings className="mr-2 h-4 w-4" />
          Manage Groups
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start bg-transparent hover:bg-surface-hover"
          onClick={handleNewGroup}
        >
          <Plus className="mr-2 h-4 w-4" />
          Create New Group
        </Button>

        <div className="border-t border-border-light my-2"></div>

        <div className="text-xs text-text-secondary font-semibold px-2 py-1">
          Groups & Members
        </div>

        {loading ? (
          <div className="text-xs text-text-secondary px-2">Loading groups...</div>
        ) : groups.length === 0 ? (
          <div className="text-xs text-text-secondary px-2">No groups created yet</div>
        ) : (
          <div className="flex flex-col space-y-1">
            {groups.map((group) => (
              <Button
                key={group._id}
                variant="ghost"
                size="sm"
                className="w-full justify-between text-left hover:bg-surface-hover px-2"
                onClick={() => handleGroupClick(group._id)}
              >
                <div className="flex items-center">
                  <Users className="mr-2 h-3 w-3" />
                  <span className="text-xs">{group.name}</span>
                </div>
                <div className="flex items-center text-text-secondary">
                  <span className="text-xs mr-1">{group.memberCount}</span>
                  <ChevronRight className="h-3 w-3" />
                </div>
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 text-xs text-text-secondary">
        <p className="px-2">Click on a group to manage its members.</p>
      </div>
    </div>
  );
}