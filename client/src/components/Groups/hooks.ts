import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { 
  GroupsListParams, 
  GroupsListResponse, 
  Group, 
  CreateGroupRequest, 
  UpdateGroupRequest, 
  GroupStatsResponse,
  CreateTimeWindowRequest,
  UpdateTimeWindowRequest
} from './types';

// Temporary API functions for testing
const API_BASE = '/api/groups';

const fetchGroups = async (params: GroupsListParams = {}): Promise<GroupsListResponse> => {
  const searchParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  });

  const queryString = searchParams.toString();
  const url = queryString ? `${API_BASE}?${queryString}` : API_BASE;
  
  console.log('fetchGroups DEBUG:', { url, params });
  
  const response = await fetch(url);
  if (!response.ok) {
    console.error('fetchGroups ERROR:', response.status, response.statusText);
    throw new Error('Failed to fetch groups');
  }
  
  const data = await response.json();
  console.log('fetchGroups RESPONSE:', data);
  return data.success ? data.data : data;
};

const fetchGroup = async (groupId: string): Promise<{ success: boolean; data: Group }> => {
  const response = await fetch(`${API_BASE}/${groupId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch group');
  }
  return response.json();
};

const fetchGroupStats = async (): Promise<GroupStatsResponse> => {
  const response = await fetch(`${API_BASE}/stats`);
  if (!response.ok) {
    throw new Error('Failed to fetch group stats');
  }
  const data = await response.json();
  return data.success ? data.data : data;
};

const createGroup = async (data: CreateGroupRequest): Promise<{ success: boolean; data: Group; message: string }> => {
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Failed to create group');
  }
  return response.json();
};

const updateGroup = async (groupId: string, data: UpdateGroupRequest): Promise<{ success: boolean; data: Group; message: string }> => {
  const response = await fetch(`${API_BASE}/${groupId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Failed to update group');
  }
  return response.json();
};

const deleteGroup = async (groupId: string): Promise<{ success: boolean; message: string }> => {
  const response = await fetch(`${API_BASE}/${groupId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete group');
  }
  return response.json();
};

// Query hooks
export const useGetGroupsQuery = (params: GroupsListParams = {}) => {
  return useQuery({
    queryKey: ['groups', params],
    queryFn: () => fetchGroups(params),
    staleTime: 5000,
  });
};

export const useGetGroupQuery = (groupId: string) => {
  return useQuery({
    queryKey: ['group', groupId],
    queryFn: () => fetchGroup(groupId),
    enabled: !!groupId,
  });
};

export const useGetGroupStatsQuery = () => {
  return useQuery({
    queryKey: ['groupStats'],
    queryFn: fetchGroupStats,
    staleTime: 30000,
  });
};

// Mutation hooks
export const useCreateGroupMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['groupStats'] });
    },
  });
};

export const useUpdateGroupMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, data }: { groupId: string; data: UpdateGroupRequest }) =>
      updateGroup(groupId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['group', variables.groupId] });
      queryClient.invalidateQueries({ queryKey: ['groupStats'] });
    },
  });
};

export const useDeleteGroupMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteGroup,
    onSuccess: (_, groupId) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.removeQueries({ queryKey: ['group', groupId] });
      queryClient.invalidateQueries({ queryKey: ['groupStats'] });
    },
  });
};

// Time Window API functions
const addTimeWindow = async (groupId: string, data: CreateTimeWindowRequest): Promise<{ success: boolean; data: Group; message: string }> => {
  const response = await fetch(`${API_BASE}/${groupId}/time-windows`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Failed to add time window');
  }
  return response.json();
};

const updateTimeWindow = async (groupId: string, windowId: string, data: UpdateTimeWindowRequest): Promise<{ success: boolean; data: Group; message: string }> => {
  const response = await fetch(`${API_BASE}/${groupId}/time-windows/${windowId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Failed to update time window');
  }
  return response.json();
};

const removeTimeWindow = async (groupId: string, windowId: string): Promise<{ success: boolean; data: Group; message: string }> => {
  const response = await fetch(`${API_BASE}/${groupId}/time-windows/${windowId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to remove time window');
  }
  return response.json();
};

// Time Window mutation hooks
export const useAddTimeWindowMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, data }: { groupId: string; data: CreateTimeWindowRequest }) =>
      addTimeWindow(groupId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['group', variables.groupId] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['groupStats'] });
    },
  });
};

export const useUpdateTimeWindowMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, windowId, data }: { groupId: string; windowId: string; data: UpdateTimeWindowRequest }) =>
      updateTimeWindow(groupId, windowId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['group', variables.groupId] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
};

export const useRemoveTimeWindowMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, windowId }: { groupId: string; windowId: string }) =>
      removeTimeWindow(groupId, windowId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['group', variables.groupId] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['groupStats'] });
    },
  });
};