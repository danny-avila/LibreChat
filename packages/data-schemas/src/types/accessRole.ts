import type { Document, Types } from 'mongoose';

export type AccessRole = {
  /** e.g., "agent_viewer", "agent_editor" */
  accessRoleId: string;
  /** e.g., "Viewer", "Editor" */
  name: string;
  description?: string;
  /** e.g., 'agent', 'project', 'file' */
  resourceType: string;
  /** e.g., 1 for read, 3 for read+write */
  permBits: number;
};

export type IAccessRole = AccessRole &
  Document & {
    _id: Types.ObjectId;
  };
