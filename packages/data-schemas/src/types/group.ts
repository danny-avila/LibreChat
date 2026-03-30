import { Document, Types } from 'mongoose';
import { CursorPaginationParams } from '~/common';

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
  _id: Types.ObjectId;
  name: string;
  description?: string;
  email?: string;
  avatar?: string;
  /** Array of member IDs (stores idOnTheSource values, not ObjectIds) */
  memberIds?: string[];
  source: 'local' | 'entra';
  /** External ID (e.g., Entra ID) - required for non-local sources */
  idOnTheSource?: string;
  tenantId?: string;
  isActive: boolean;
  timeWindows: ITimeWindow[];
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  memberCount: number;
  pendingEmails: string[];
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

export interface CreateGroupRequest {
  name: string;
  description?: string;
  email?: string;
  avatar?: string;
  memberIds?: string[];
  source: 'local' | 'entra';
  idOnTheSource?: string;
}

export interface UpdateGroupRequest {
  name?: string;
  description?: string;
  email?: string;
  avatar?: string;
  memberIds?: string[];
  source?: 'local' | 'entra' | 'ldap';
  idOnTheSource?: string;
}

export interface GroupFilterOptions extends CursorPaginationParams {
  // Includes email, name and description
  search?: string;
  source?: 'local' | 'entra' | 'ldap';
  hasMember?: string;
}
