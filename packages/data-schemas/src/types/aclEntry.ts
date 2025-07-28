import type { Document, Types } from 'mongoose';

export type AclEntry = {
  /** The type of principal ('user', 'group', 'public') */
  principalType: 'user' | 'group' | 'public';
  /** The ID of the principal (null for 'public') */
  principalId?: Types.ObjectId;
  /** The model name for the principal ('User' or 'Group') */
  principalModel?: 'User' | 'Group';
  /** The type of resource ('agent', 'project', 'file', 'promptGroup') */
  resourceType: 'agent' | 'project' | 'file' | 'promptGroup';
  /** The ID of the resource */
  resourceId: Types.ObjectId;
  /** Permission bits for this entry */
  permBits: number;
  /** Optional role ID for predefined roles */
  roleId?: Types.ObjectId;
  /** ID of the resource this permission is inherited from */
  inheritedFrom?: Types.ObjectId;
  /** ID of the user who granted this permission */
  grantedBy?: Types.ObjectId;
  /** When this permission was granted */
  grantedAt?: Date;
};

export type IAclEntry = AclEntry &
  Document & {
    _id: Types.ObjectId;
  };
