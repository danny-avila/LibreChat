import { useState, useEffect } from 'react';
import { UserPlus, UserMinus, Search, Users } from 'lucide-react';
import { Button, Input, Label } from '@librechat/client';
import { cn } from '~/utils';

interface User {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
}

interface GroupMembersSectionProps {
  groupId: string;
  isActive?: boolean;
}

export default function GroupMembersSection({ groupId, isActive = true }: GroupMembersSectionProps) {
  const [members, setMembers] = useState<User[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);

  useEffect(() => {
    if (groupId) {
      fetchMembers();
      fetchAvailableUsers();
    }
  }, [groupId]);

  useEffect(() => {
    // Filter available users based on search and exclude current members
    const memberIds = new Set(members.map(m => m._id));
    const filtered = availableUsers.filter(user => 
      !memberIds.has(user._id) &&
      (user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       user.email?.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    setFilteredUsers(filtered);
  }, [searchTerm, availableUsers, members]);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:3081/api/groups/${groupId}/members`);
      const data = await response.json();
      if (data.success) {
        setMembers(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch group members:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableUsers = async () => {
    try {
      const response = await fetch('http://localhost:3081/api/groups/users/available');
      const data = await response.json();
      if (data.success) {
        setAvailableUsers(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch available users:', error);
    }
  };

  const handleAddMember = async (userId: string) => {
    try {
      const response = await fetch(`http://localhost:3081/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });
      
      const data = await response.json();
      if (data.success) {
        // Refresh members list
        await fetchMembers();
        setSearchTerm('');
      } else {
        console.error('Failed to add member:', data.message);
      }
    } catch (error) {
      console.error('Failed to add member:', error);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!window.confirm('Are you sure you want to remove this user from the group?')) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:3081/api/groups/${groupId}/members/${userId}`, {
        method: 'DELETE',
      });
      
      const data = await response.json();
      if (data.success) {
        // Refresh members list
        await fetchMembers();
      } else {
        console.error('Failed to remove member:', data.message);
      }
    } catch (error) {
      console.error('Failed to remove member:', error);
    }
  };

  if (!isActive) {
    return (
      <div className="rounded-lg bg-surface-secondary p-4">
        <p className="text-sm text-text-secondary">
          Member management is disabled for inactive groups. Activate the group to manage members.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-text-secondary" />
          <h3 className="text-lg font-semibold text-text-primary">Group Members</h3>
          <span className="rounded-full bg-surface-secondary px-2 py-1 text-xs text-text-secondary">
            {members.length} members
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddMember(!showAddMember)}
          className="flex items-center gap-1"
        >
          <UserPlus className="h-4 w-4" />
          Add Member
        </Button>
      </div>

      {/* Add Member Section */}
      {showAddMember && (
        <div className="rounded-lg border border-border-light bg-surface-tertiary p-4">
          <div className="space-y-3">
            <Label className="text-sm font-medium text-text-primary">
              Add Entra ID Users to Group
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
              <Input
                type="text"
                placeholder="Search users by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            {/* Available Users List */}
            <div className="max-h-48 overflow-y-auto rounded-lg border border-border-light bg-surface-primary">
              {filteredUsers.length === 0 ? (
                <p className="p-3 text-center text-sm text-text-secondary">
                  {searchTerm ? 'No users found' : 'All available users are already members'}
                </p>
              ) : (
                <div className="divide-y divide-border-light">
                  {filteredUsers.map((user) => (
                    <div
                      key={user._id}
                      className="flex items-center justify-between p-2 hover:bg-surface-hover"
                    >
                      <div className="flex items-center gap-2">
                        {user.avatar ? (
                          <img
                            src={user.avatar}
                            alt={user.name}
                            className="h-8 w-8 rounded-full"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-secondary text-xs font-medium text-text-primary">
                            {user.name?.charAt(0) || user.email?.charAt(0)}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium text-text-primary">{user.name}</p>
                          <p className="text-xs text-text-secondary">{user.email}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAddMember(user._id)}
                        className="flex items-center gap-1"
                      >
                        <UserPlus className="h-3 w-3" />
                        Add
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Current Members List */}
      <div className="rounded-lg border border-border-light bg-surface-primary">
        {loading ? (
          <div className="p-4 text-center text-sm text-text-secondary">
            Loading members...
          </div>
        ) : members.length === 0 ? (
          <div className="p-4 text-center text-sm text-text-secondary">
            No members in this group yet
          </div>
        ) : (
          <div className="divide-y divide-border-light">
            {members.map((member) => (
              <div
                key={member._id}
                className="flex items-center justify-between p-3 hover:bg-surface-hover"
              >
                <div className="flex items-center gap-3">
                  {member.avatar ? (
                    <img
                      src={member.avatar}
                      alt={member.name}
                      className="h-10 w-10 rounded-full"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-secondary text-sm font-medium text-text-primary">
                      {member.name?.charAt(0) || member.email?.charAt(0)}
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-text-primary">{member.name}</p>
                    <p className="text-sm text-text-secondary">{member.email}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveMember(member._id)}
                  className="flex items-center gap-1 text-red-500 hover:bg-red-50 hover:text-red-600"
                >
                  <UserMinus className="h-4 w-4" />
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}