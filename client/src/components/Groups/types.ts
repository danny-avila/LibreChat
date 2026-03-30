// Temporary Group types for UI development
export interface Group {
  _id: string;
  name: string;
  description?: string;
  isActive: boolean;
  memberCount: number;
  timeWindows: TimeWindow[];
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimeWindow {
  _id?: string;
  name: string;
  windowType: 'daily' | 'weekly' | 'date_range' | 'exception';
  startTime?: string; // HH:MM format
  endTime?: string;   // HH:MM format
  daysOfWeek?: number[]; // Array of numbers 0-6 (Sunday-Saturday)
  startDate?: string; // ISO date string
  endDate?: string;   // ISO date string
  timezone?: string;  // IANA timezone identifier
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateTimeWindowRequest {
  name: string;
  windowType: 'daily' | 'weekly' | 'date_range' | 'exception';
  startTime?: string;
  endTime?: string;
  daysOfWeek?: number[];
  startDate?: string;
  endDate?: string;
  timezone?: string;
  isActive?: boolean;
}

export interface UpdateTimeWindowRequest {
  name?: string;
  windowType?: 'daily' | 'weekly' | 'date_range' | 'exception';
  startTime?: string;
  endTime?: string;
  daysOfWeek?: number[];
  startDate?: string;
  endDate?: string;
  timezone?: string;
  isActive?: boolean;
}

export interface GroupsListParams {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  sort?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface GroupsListResponse {
  groups: Group[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
}

export interface GroupStatsResponse {
  totalGroups: number;
  activeGroups: number;
  totalMembers: number;
  averageMembersPerGroup: number;
  groupsWithTimeWindows: number;
}

export interface CreateGroupRequest {
  name: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdateGroupRequest {
  name?: string;
  description?: string;
  isActive?: boolean;
}