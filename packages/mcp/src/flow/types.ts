import type { Logger } from 'winston';
export type FlowStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface FlowMetadata {
  [key: string]: unknown;
}

export interface FlowState<T = unknown> {
  type: string;
  status: FlowStatus;
  metadata: FlowMetadata;
  createdAt: number;
  result?: T;
  error?: string;
  completedAt?: number;
  failedAt?: number;
}

export interface FlowManagerOptions {
  ttl: number;
  ci?: boolean;
  logger?: Logger;
}
