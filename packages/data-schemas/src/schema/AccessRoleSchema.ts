import { Schema, Document, Types } from 'mongoose';

// Permission bit flags
export enum PermissionBits {
  VIEW = 1, // 0001 - Can view/access the resource
  EDIT = 2, // 0010 - Can modify the resource
  DELETE = 4, // 0100 - Can delete the resource
  SHARE = 8, // 1000 - Can share the resource with others
}

// Common role combinations
export enum RoleBits {
  VIEWER = PermissionBits.VIEW, // 0001 = 1
  EDITOR = PermissionBits.VIEW | PermissionBits.EDIT, // 0011 = 3
  MANAGER = PermissionBits.VIEW | PermissionBits.EDIT | PermissionBits.DELETE, // 0111 = 7
  OWNER = PermissionBits.VIEW | PermissionBits.EDIT | PermissionBits.DELETE | PermissionBits.SHARE, // 1111 = 15
}

export interface IAccessRole extends Document {
  _id: Types.ObjectId;
  accessRoleId: string; // e.g., "agent_viewer", "agent_editor"
  name: string; // e.g., "Viewer", "Editor"
  description?: string;
  resourceType: string; // e.g., 'agent', 'project', 'file'
  permBits: number; // e.g., 1 for read, 3 for read+write
}

const AccessRoleSchema = new Schema<IAccessRole>(
  {
    accessRoleId: {
      type: String,
      required: true,
      index: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: String,
    resourceType: {
      type: String,
      enum: ['agent', 'project', 'file'],
      required: true,
      default: 'agent',
    },
    permBits: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true },
);

export default AccessRoleSchema;
