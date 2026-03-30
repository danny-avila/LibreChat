import { useState, useEffect } from 'react';
import { Plus, Search, Users } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Input } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import GroupListItem from './GroupListItem';
import { useGetGroupsQuery } from './hooks';

interface GroupsSidePanelProps {
  isDetailView: boolean;
}

export default function GroupsSidePanel({ isDetailView }: GroupsSidePanelProps) {
  const navigate = useNavigate();
  const params = useParams();
  const localize = useLocalize();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const limit = 10;

  const {
    data: groupsData,
    isLoading,
    error,
    refetch,
  } = useGetGroupsQuery({
    page: currentPage,
    limit,
    search: searchTerm,
    isActive: true,
  });

  const groups = groupsData?.groups || [];
  const pagination = groupsData?.pagination;

  // Debug logging
  console.log('GroupsSidePanel Debug:', {
    groupsData,
    groups: groups.length,
    isLoading,
    error: error?.message,
    searchTerm,
    currentPage
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const handleCreateGroup = () => {
    navigate('/d/groups/new');
  };

  const handleGroupSelect = (groupId: string) => {
    navigate(`/d/groups/${groupId}`);
  };

  const handleLoadMore = () => {
    if (pagination && currentPage < pagination.totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  return (
    <div
      className={cn(
        'flex w-full flex-col overflow-hidden bg-surface-primary lg:w-1/4',
        isDetailView ? 'hidden md:flex' : 'flex',
      )}
    >
      {/* Header */}
      <div className="border-b border-border-light px-4 py-3 dark:border-gray-600">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-text-primary" />
            <h2 className="text-lg font-semibold text-text-primary">Groups</h2>
          </div>
          <Button
            onClick={handleCreateGroup}
            size="sm"
            className="flex items-center gap-1"
          >
            <Plus className="h-4 w-4" />
            New
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="border-b border-border-light px-4 py-3 dark:border-gray-600">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
          <Input
            type="text"
            placeholder="Search groups..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Groups List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && currentPage === 1 ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-text-secondary">Loading groups...</div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="text-red-500">Error loading groups</div>
            <Button
              onClick={() => refetch()}
              variant="outline"
              size="sm"
              className="mt-2"
            >
              Try Again
            </Button>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <Users className="h-12 w-12 text-text-secondary/50" />
            <div className="mt-2 text-text-secondary">
              {searchTerm ? 'No groups found' : 'No groups yet'}
            </div>
            {!searchTerm && (
              <Button
                onClick={handleCreateGroup}
                variant="outline"
                size="sm"
                className="mt-2"
              >
                Create First Group
              </Button>
            )}
          </div>
        ) : (
          <>
            {groups.map((group) => (
              <GroupListItem
                key={group._id}
                group={group}
                isSelected={params.groupId === group._id}
                onSelect={handleGroupSelect}
              />
            ))}
            
            {/* Load More */}
            {pagination && currentPage < pagination.totalPages && (
              <div className="border-t border-border-light px-4 py-3 dark:border-gray-600">
                <Button
                  onClick={handleLoadMore}
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? 'Loading...' : `Load More (${pagination.totalItems - (currentPage * limit)} remaining)`}
                </Button>
              </div>
            )}
            
            {/* Pagination Info */}
            {pagination && (
              <div className="border-t border-border-light px-4 py-2 text-xs text-text-secondary dark:border-gray-600">
                Showing {Math.min(currentPage * limit, pagination.totalItems)} of {pagination.totalItems} groups
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}