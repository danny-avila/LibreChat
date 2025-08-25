import { Document, Types } from 'mongoose';

export interface IUserActivityLog extends Document {
  user: Types.ObjectId;
  action: 'LOGIN' | 'LOGOUT' | 'ATTACHED FILE' | 'MODEL CHANGED';
  timestamp: Date;
  details?:any;
  createdAt: Date;
  updatedAt: Date;
}
