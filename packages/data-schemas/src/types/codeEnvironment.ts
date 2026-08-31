import type { Document, Types } from 'mongoose';

export type CodeEnvironment = {
  environmentId: string;
  name: string;
  type: 'managed' | 'attached';
  baseURL: string;
  controlPlaneId: string;
  createdBy: Types.ObjectId;
  ownerSlot?: number;
  pendingAgentReferences?: string[];
  deletionStartedAt?: Date;
  revocationPendingAt?: Date;
  revocationAttempts?: number;
  revocationLastError?: string;
  workerId?: string;
  revocationTokenEnv?: string;
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
