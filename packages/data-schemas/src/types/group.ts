import { Document, Types } from 'mongoose';

export interface ITimeWindow {
  _id?: Types.ObjectId;
  name: string;
  windowType: 'daily' | 'weekly' | 'date_range' | 'exception';
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  daysOfWeek: number[]; // 0-6 (Sunday-Saturday)
  startDate?: Date;
  endDate?: Date;
  timezone: string; // IANA timezone identifier
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IGroup extends Document {
  name: string;
  description?: string;
  isActive: boolean;
  timeWindows: ITimeWindow[];
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  memberCount: number;
  createdAt?: Date;
  updatedAt?: Date;
  
  // Methods
  updateMemberCount(): Promise<IGroup>;
}

export interface IGroupMembership {
  groupId: Types.ObjectId;
  assignedAt: Date;
  assignedBy: Types.ObjectId;
}

export interface IEffectiveTimeWindow {
  groupId: Types.ObjectId;
  groupName: string;
  windowType: 'daily' | 'weekly' | 'date_range' | 'exception';
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  startDate?: Date;
  endDate?: Date;
  timezone: string;
  isActive: boolean;
}

// API request/response types
export interface GroupCreateData {
  name: string;
  description?: string;
  isActive?: boolean;
}

export interface GroupUpdateData {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface TimeWindowCreateData {
  name: string;
  windowType: 'daily' | 'weekly' | 'date_range' | 'exception';
  startTime: string;
  endTime: string;
  daysOfWeek?: number[];
  startDate?: Date;
  endDate?: Date;
  timezone?: string;
  isActive?: boolean;
}

export interface GroupMembershipData {
  userId: Types.ObjectId | string;
  groupId: Types.ObjectId | string;
}

export interface GroupSearchCriteria {
  name?: string;
  isActive?: boolean;
  createdBy?: Types.ObjectId | string;
  _id?: Types.ObjectId | string;
}

export interface GroupQueryOptions {
  fieldsToSelect?: string | string[] | null;
  lean?: boolean;
  populate?: boolean;
}

export interface BulkGroupAssignmentData {
  userIds: (Types.ObjectId | string)[];
  groupId: Types.ObjectId | string;
}

export interface GroupStatistics {
  totalGroups: number;
  activeGroups: number;
  totalMembers: number;
  averageMembersPerGroup: number;
  groupsWithTimeWindows: number;
}