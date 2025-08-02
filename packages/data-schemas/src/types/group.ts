import type { Document, Types } from 'mongoose';

export type Group = {
  /** The name of the group */
  name: string;
  /** Optional description of the group */
  description?: string;
  /** Optional email address for the group */
  email?: string;
  /** Optional avatar URL for the group */
  avatar?: string;
  /** Array of member IDs (stores idOnTheSource values, not ObjectIds) */
  memberIds: string[];
  /** The source of the group ('local' or 'entra') */
  source: 'local' | 'entra';
  /** External ID (e.g., Entra ID) - required for non-local sources */
  idOnTheSource?: string;
};

export type IGroup = Group &
  Document & {
    _id: Types.ObjectId;
  };
