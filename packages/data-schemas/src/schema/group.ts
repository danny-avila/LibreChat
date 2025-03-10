import { Schema, Document } from 'mongoose';

export interface IGroup extends Document {
  name: string;
  description?: string;
  externalId?: string;
  provider: 'local' | 'openid';
  createdAt?: Date;
  updatedAt?: Date;
}

const groupSchema = new Schema<IGroup>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    description: {
      type: String,
    },
    externalId: {
      type: String,
      unique: true,
      required: function (this: IGroup) {
        return this.provider !== 'local';
      },
    },
    provider: {
      type: String,
      required: true,
      default: 'local',
      enum: ['local', 'openid'],
    },
  },
  { timestamps: true },
);

export default groupSchema;
