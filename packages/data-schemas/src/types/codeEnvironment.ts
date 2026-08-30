import type { Document, Types } from 'mongoose';

export type CodeEnvironment = {
  environmentId: string;
  name: string;
  type: 'managed' | 'attached';
  baseURL: string;
  controlPlaneId: string;
  createdBy: Types.ObjectId;
  workerId?: string;
  tenantId?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CodeEnvironmentDocument = CodeEnvironment &
  Document<Types.ObjectId> & {
    _id: Types.ObjectId;
  };
