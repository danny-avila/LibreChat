import type { Types } from 'mongoose';

export type NangoConnectionStatus = 'connected' | 'expired' | 'revoked';

export interface INangoConnection {
  _id?: Types.ObjectId;
  userId: Types.ObjectId;
  tenantId?: string;
  providerKey: string;
  nangoIntegrationId: string;
  connectionId: string;
  status: NangoConnectionStatus;
  connectedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type UpsertNangoConnectionInput = {
  userId: string;
  tenantId?: string;
  providerKey: string;
  nangoIntegrationId: string;
  connectionId: string;
  status?: NangoConnectionStatus;
};
