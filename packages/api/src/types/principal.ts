import type { Types } from 'mongoose';

export interface ResolvedPrincipal {
  principalType: string;
  principalId?: string | Types.ObjectId;
}
