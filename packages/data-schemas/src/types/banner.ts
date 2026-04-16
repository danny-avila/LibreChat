import type { Document } from 'mongoose';

export interface IBanner extends Document {
  // Existing fields
  bannerId: string;
  message: string;
  displayFrom: Date;
  displayTo?: Date;
  type: 'banner' | 'popup';
  isPublic: boolean;
  persistable: boolean;
  tenantId?: string;

  // New fields for multi-banner system (all optional for backward compatibility)
  audienceMode?: 'global' | 'role' | 'group' | 'user';
  targetRoleIds?: string[];
  targetGroupIds?: string[];
  targetUserIds?: string[];
  priority?: number;
  isActive?: boolean;
  order?: number;
  viewCount?: number;
  dismissCount?: number;
}

export interface CreateBannerRequest {
  message: string;
  displayFrom?: Date;
  displayTo?: Date;
  type?: 'banner' | 'popup';
  isPublic?: boolean;
  persistable?: boolean;
  tenantId?: string;
  audienceMode?: 'global' | 'role' | 'group' | 'user';
  targetRoleIds?: string[];
  targetGroupIds?: string[];
  targetUserIds?: string[];
  priority?: number;
  isActive?: boolean;
  order?: number;
}

export interface UpdateBannerRequest {
  message?: string;
  displayFrom?: Date;
  displayTo?: Date;
  type?: 'banner' | 'popup';
  isPublic?: boolean;
  persistable?: boolean;
  audienceMode?: 'global' | 'role' | 'group' | 'user';
  targetRoleIds?: string[];
  targetGroupIds?: string[];
  targetUserIds?: string[];
  priority?: number;
  isActive?: boolean;
  order?: number;
}
