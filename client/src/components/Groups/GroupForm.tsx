import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, ArrowLeft, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { Button, Input, Label, Textarea } from '@librechat/client';
import { useCreateGroupMutation, useUpdateGroupMutation, useDeleteGroupMutation, useGetGroupQuery } from './hooks';
import GroupMembersSection from './GroupMembersSection';
import TimeWindowManager from './TimeWindowManager';
import type { CreateGroupRequest, UpdateGroupRequest } from './types';

export default function GroupForm() {
  const navigate = useNavigate();
  const { groupId } = useParams();
  const isEditing = !!groupId;

  const [formData, setFormData] = useState<CreateGroupRequest>({
    name: '',
    description: '',
    isActive: true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Queries and mutations
  const { data: groupData, isLoading: loadingGroup, refetch } = useGetGroupQuery(groupId || '', {
    enabled: isEditing,
  });
  
  const createMutation = useCreateGroupMutation();
  const updateMutation = useUpdateGroupMutation();
  const deleteMutation = useDeleteGroupMutation();

  // Load group data for editing
  useEffect(() => {
    if (isEditing && groupData?.success && groupData.data) {
      const group = groupData.data;
      setFormData({
        name: group.name,
        description: group.description || '',
        isActive: group.isActive,
      });
    }
  }, [isEditing, groupData]);

  const handleInputChange = (field: keyof CreateGroupRequest, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name?.trim()) {
      newErrors.name = 'Group name is required';
    } else if (formData.name.length > 100) {
      newErrors.name = 'Group name must be less than 100 characters';
    }

    if (formData.description && formData.description.length > 500) {
      newErrors.description = 'Description must be less than 500 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      if (isEditing && groupId) {
        const updateData: UpdateGroupRequest = {
          name: formData.name,
          description: formData.description,
          isActive: formData.isActive,
        };
        
        await updateMutation.mutateAsync({ groupId, data: updateData });
        navigate('/d/groups');
      } else {
        await createMutation.mutateAsync(formData);
        navigate('/d/groups');
      }
    } catch (error) {
      console.error('Error saving group:', error);
    }
  };

  const handleDelete = async () => {
    if (!groupId) return;

    if (window.confirm('Are you sure you want to delete this group? This action cannot be undone.')) {
      try {
        await deleteMutation.mutateAsync(groupId);
        navigate('/d/groups');
      } catch (error) {
        console.error('Error deleting group:', error);
      }
    }
  };

  const handleBack = () => {
    navigate('/d/groups');
  };

  if (isEditing && loadingGroup) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-text-secondary">Loading group...</div>
      </div>
    );
  }

  const isLoading = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl p-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="flex items-center gap-1"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">
                {isEditing ? 'Edit Group' : 'Create New Group'}
              </h1>
              <p className="text-text-secondary">
                {isEditing ? 'Modify group settings and permissions' : 'Set up a new user group with access controls'}
              </p>
            </div>
          </div>
          
          {isEditing && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isLoading}
              className="flex items-center gap-1"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Group Name */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium text-text-primary">
              Group Name *
            </Label>
            <Input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="Enter group name..."
              className={errors.name ? 'border-red-500' : ''}
              disabled={isLoading}
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-medium text-text-primary">
              Description
            </Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Describe this group's purpose..."
              rows={3}
              className={errors.description ? 'border-red-500' : ''}
              disabled={isLoading}
            />
            {errors.description && (
              <p className="text-sm text-red-500">{errors.description}</p>
            )}
            <p className="text-xs text-text-secondary">
              {formData.description?.length || 0}/500 characters
            </p>
          </div>

          {/* Active Status */}
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => handleInputChange('isActive', !formData.isActive)}
              className="flex items-center gap-2 focus:outline-none"
              disabled={isLoading}
            >
              {formData.isActive ? (
                <ToggleRight className="h-6 w-6 text-blue-500" />
              ) : (
                <ToggleLeft className="h-6 w-6 text-gray-400" />
              )}
              <div className="text-left">
                <div className="text-sm font-medium text-text-primary">
                  Group Active
                </div>
                <div className="text-xs text-text-secondary">
                  {formData.isActive ? 'This group is active and can be used' : 'This group is disabled'}
                </div>
              </div>
            </button>
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {isLoading ? 'Saving...' : (isEditing ? 'Update Group' : 'Create Group')}
            </Button>
            
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={isLoading}
            >
              Cancel
            </Button>
          </div>
        </form>

        {/* Member Management Section */}
        {isEditing && groupId && (
          <div className="mt-8">
            <GroupMembersSection groupId={groupId} isActive={formData.isActive} />
          </div>
        )}

        {/* Time Window Management Section */}
        {isEditing && groupId && groupData?.success && (
          <div className="mt-8">
            <TimeWindowManager 
              groupId={groupId} 
              timeWindows={groupData.data.timeWindows || []} 
              onRefresh={() => refetch()}
            />
          </div>
        )}

        {/* Additional Information */}
        {isEditing && groupData?.success && (
          <div className="mt-8 space-y-4 rounded-lg bg-surface-secondary p-4">
            <h3 className="font-medium text-text-primary">Group Information</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-text-secondary">Members:</span>
                <span className="ml-2 font-medium text-text-primary">
                  {groupData.data.memberCount}
                </span>
              </div>
              <div>
                <span className="text-text-secondary">Time Windows:</span>
                <span className="ml-2 font-medium text-text-primary">
                  {groupData.data.timeWindows?.length || 0}
                </span>
              </div>
              <div>
                <span className="text-text-secondary">Created:</span>
                <span className="ml-2 font-medium text-text-primary">
                  {new Date(groupData.data.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div>
                <span className="text-text-secondary">Updated:</span>
                <span className="ml-2 font-medium text-text-primary">
                  {new Date(groupData.data.updatedAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}