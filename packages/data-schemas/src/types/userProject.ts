import type { Document, Types } from 'mongoose';

export interface IUserProject extends Document {
  userId: Types.ObjectId;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserProjectLean {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}
