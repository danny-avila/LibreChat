import type { Document, Types } from 'mongoose';

export type CodeEnvironment = {
  environmentId: string;
  name: string;
  type: 'managed' | 'attached';
  baseURL: string;
  controlPlaneId: string;
  createdBy: Types.ObjectId;
  workerId?: string;
  controlPlaneId?: string;
  workerPrincipal?: {
    type: 'deployment' | 'tenant' | 'user' | 'role' | 'group';
    id: string;
  };
  tenantId?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CodeEnvironmentDocument = CodeEnvironment &
  Document<Types.ObjectId> & {
    _id: Types.ObjectId;
  };
