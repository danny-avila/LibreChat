import { useQuery } from '@tanstack/react-query';
import { useAuthContext } from '~/hooks/AuthContext';

// API base URL
const API_BASE = '/api/statistics';

// User Statistics Types
export interface UserStatistics {
  userId: string;
  email: string;
  username?: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  lastActivity: string;
  joinDate: string;
  conversationCount: number;
  averageDaily: number;
  rank: number;
}

export interface UserLeaderboardParams {
  page?: number;
  limit?: number;
  sortBy?: 'totalTokens' | 'lastActivity' | 'joinDate' | 'totalCost';
  sortOrder?: 'asc' | 'desc';
  dateFrom?: string;
  dateTo?: string;
  groupId?: string;
  minUsage?: number;
  maxUsage?: number;
  includeInactive?: boolean;
}

export interface UserLeaderboardResponse {
  users: UserStatistics[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalUsers: number;
    usersPerPage: number;
  };
  summary: {
    totalTokensUsed: number;
    totalCost: number;
    averagePerUser: number;
    mostActiveUser: string | null;
    dateRange: {
      from: string | null;
      to: string | null;
    };
  };
}

export interface DetailedUserStatistics {
  userId: string;
  email: string;
  username?: string;
  joinDate: string;
  totalUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    totalCost: number;
  };
  periodUsage: {
    today: { tokens: number; cost: number };
    thisWeek: { tokens: number; cost: number };
    thisMonth: { tokens: number; cost: number };
  };
  topModels: Array<{
    model: string;
    usage: number;
    cost: number;
    percentage: number;
  }>;
  averages: {
    tokensPerDay: number;
    tokensPerConversation: number;
    conversationsPerDay: number;
  };
  usageHistory?: Array<{
    date: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost: number;
    conversations: number;
  }>;
}

// API Functions
const fetchUserLeaderboard = async (token: string, params: UserLeaderboardParams = {}): Promise<UserLeaderboardResponse> => {
  const searchParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  });

  const queryString = searchParams.toString();
  const url = queryString ? `${API_BASE}/users/leaderboard?${queryString}` : `${API_BASE}/users/leaderboard`;
  
  console.log('fetchUserLeaderboard DEBUG:', { url, params });
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  if (!response.ok) {
    console.error('fetchUserLeaderboard ERROR:', response.status, response.statusText);
    throw new Error(`Failed to fetch user leaderboard: ${response.status}`);
  }
  
  const data = await response.json();
  console.log('fetchUserLeaderboard RESPONSE:', data);
  
  if (!data.success) {
    throw new Error(data.error?.message || 'Failed to fetch user leaderboard');
  }
  
  return data.data;
};

const fetchUserStatistics = async (
  token: string,
  userId: string, 
  options: { 
    dateFrom?: string; 
    dateTo?: string; 
    includeHistory?: boolean;
  } = {}
): Promise<DetailedUserStatistics> => {
  const searchParams = new URLSearchParams();
  
  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  });

  const queryString = searchParams.toString();
  const url = queryString 
    ? `${API_BASE}/users/${userId}?${queryString}` 
    : `${API_BASE}/users/${userId}`;
  
  console.log('fetchUserStatistics DEBUG:', { url, userId, options });
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  if (!response.ok) {
    console.error('fetchUserStatistics ERROR:', response.status, response.statusText);
    throw new Error(`Failed to fetch user statistics: ${response.status}`);
  }
  
  const data = await response.json();
  console.log('fetchUserStatistics RESPONSE:', data);
  
  if (!data.success) {
    throw new Error(data.error?.message || 'Failed to fetch user statistics');
  }
  
  return data.data;
};

// Group Statistics Types
export interface GroupStatistics {
  groupId: string;
  groupName: string;
  groupDescription?: string;
  isActive: boolean;
  memberCount: number;
  activeMemberCount: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  averagePerMember: number;
  averagePerActiveMember: number;
  totalCost: number;
  timeWindowsActive: number;
  lastActivity: string;
  conversationCount: number;
  rank: number;
}

export interface GroupLeaderboardParams {
  page?: number;
  limit?: number;
  sortBy?: 'totalTokens' | 'averagePerMember' | 'memberCount' | 'totalCost' | 'lastActivity';
  sortOrder?: 'asc' | 'desc';
  dateFrom?: string;
  dateTo?: string;
  minMembers?: number;
  includeInactive?: boolean;
}

export interface GroupLeaderboardResponse {
  groups: GroupStatistics[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalGroups: number;
    groupsPerPage: number;
  };
  summary: {
    totalGroups: number;
    totalMembers: number;
    totalTokensUsed: number;
    averageGroupSize: number;
    mostActiveGroup: string | null;
  };
}

export interface DetailedGroupStatistics {
  groupId: string;
  groupName: string;
  description?: string;
  memberCount: number;
  isActive: boolean;
  timeWindows: Array<{
    name: string;
    windowType: string;
    isActive: boolean;
  }>;
  totalUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    totalCost: number;
    conversationCount: number;
    activeMemberCount: number;
  };
  memberUsage: {
    averagePerMember: number;
    highestUser: any;
    lowestUser: any;
    topMembers: Array<{
      userId: string;
      email: string;
      username?: string;
      tokens: number;
      cost: number;
      lastActivity: string;
      percentageOfGroup: number;
    }>;
  };
  periodComparison: {
    thisMonth: { tokens: number; cost: number };
    lastMonth: { tokens: number; cost: number };
    growth: string;
  };
  topModels: Array<{
    model: string;
    usage: number;
    cost: number;
    percentage: number;
  }>;
  timeWindowCompliance?: number;
}

export interface GroupMemberStatistics {
  userId: string;
  email: string;
  username?: string;
  tokens: number;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  lastActivity: string;
  conversationCount: number;
  percentageOfGroup: number;
  rank: number;
}

export interface GroupMembersResponse {
  groupId: string;
  groupName: string;
  members: GroupMemberStatistics[];
  groupTotals: {
    totalTokens: number;
    totalMembers: number;
    averagePerMember: number;
  };
  pagination: {
    currentPage: number;
    totalPages: number;
    totalMembers: number;
    membersPerPage: number;
  };
}

// Group API Functions
const fetchGroupLeaderboard = async (token: string, params: GroupLeaderboardParams = {}): Promise<GroupLeaderboardResponse> => {
  const searchParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  });

  const queryString = searchParams.toString();
  const url = queryString ? `${API_BASE}/groups/leaderboard?${queryString}` : `${API_BASE}/groups/leaderboard`;
  
  console.log('fetchGroupLeaderboard DEBUG:', { url, params });
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  if (!response.ok) {
    console.error('fetchGroupLeaderboard ERROR:', response.status, response.statusText);
    throw new Error(`Failed to fetch group leaderboard: ${response.status}`);
  }
  
  const data = await response.json();
  console.log('fetchGroupLeaderboard RESPONSE:', data);
  
  if (!data.success) {
    throw new Error(data.error?.message || 'Failed to fetch group leaderboard');
  }
  
  return data.data;
};

const fetchGroupStatistics = async (
  token: string,
  groupId: string,
  options: { 
    dateFrom?: string; 
    dateTo?: string; 
    includeMemberDetails?: boolean;
  } = {}
): Promise<DetailedGroupStatistics> => {
  const searchParams = new URLSearchParams();
  
  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  });

  const queryString = searchParams.toString();
  const url = queryString 
    ? `${API_BASE}/groups/${groupId}?${queryString}` 
    : `${API_BASE}/groups/${groupId}`;
  
  console.log('fetchGroupStatistics DEBUG:', { url, groupId, options });
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  if (!response.ok) {
    console.error('fetchGroupStatistics ERROR:', response.status, response.statusText);
    throw new Error(`Failed to fetch group statistics: ${response.status}`);
  }
  
  const data = await response.json();
  console.log('fetchGroupStatistics RESPONSE:', data);
  
  if (!data.success) {
    throw new Error(data.error?.message || 'Failed to fetch group statistics');
  }
  
  return data.data;
};

const fetchGroupMemberStatistics = async (
  token: string,
  groupId: string,
  params: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {}
): Promise<GroupMembersResponse> => {
  const searchParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  });

  const queryString = searchParams.toString();
  const url = queryString 
    ? `${API_BASE}/groups/${groupId}/members?${queryString}` 
    : `${API_BASE}/groups/${groupId}/members`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch group member statistics: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error?.message || 'Failed to fetch group member statistics');
  }
  
  return data.data;
};

// React Query Hooks
export const useUserLeaderboard = (params: UserLeaderboardParams = {}) => {
  const { token } = useAuthContext();
  
  return useQuery({
    queryKey: ['userLeaderboard', params],
    queryFn: () => fetchUserLeaderboard(token, params),
    enabled: !!token,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
};

export const useUserStatistics = (
  userId: string, 
  options: { 
    dateFrom?: string; 
    dateTo?: string; 
    includeHistory?: boolean;
  } = {}
) => {
  const { token } = useAuthContext();
  
  return useQuery({
    queryKey: ['userStatistics', userId, options],
    queryFn: () => fetchUserStatistics(token, userId, options),
    enabled: !!userId && !!token,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
  });
};

export const useGroupLeaderboard = (params: GroupLeaderboardParams = {}) => {
  const { token } = useAuthContext();
  
  return useQuery({
    queryKey: ['groupLeaderboard', params],
    queryFn: () => fetchGroupLeaderboard(token, params),
    enabled: !!token,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
};

export const useGroupStatistics = (
  groupId: string,
  options: { 
    dateFrom?: string; 
    dateTo?: string; 
    includeMemberDetails?: boolean;
  } = {}
) => {
  const { token } = useAuthContext();
  
  return useQuery({
    queryKey: ['groupStatistics', groupId, options],
    queryFn: () => fetchGroupStatistics(token, groupId, options),
    enabled: !!groupId && !!token,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
  });
};

export const useGroupMemberStatistics = (
  groupId: string,
  params: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {}
) => {
  const { token } = useAuthContext();
  
  return useQuery({
    queryKey: ['groupMemberStatistics', groupId, params],
    queryFn: () => fetchGroupMemberStatistics(token, groupId, params),
    enabled: !!groupId && !!token,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
};