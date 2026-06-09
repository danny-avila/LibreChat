import type { Document, Types } from 'mongoose';

export type TenantStatus = 'active' | 'suspended' | 'archived';

export interface ITenant extends Document {
  _id: Types.ObjectId;
  tenantId: string;
  name: string;
  description?: string;
  status: TenantStatus;
  createdBy?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateTenantInput {
  tenantId?: string;
  name: string;
  description?: string;
  createdBy?: string | Types.ObjectId;
}

export interface UpdateTenantInput {
  name?: string;
  description?: string;
  status?: TenantStatus;
}
