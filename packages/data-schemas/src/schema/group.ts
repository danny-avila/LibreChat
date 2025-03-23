import { Schema, Document, Types } from 'mongoose';
import { GroupType } from 'librechat-data-provider';

export interface IGroup extends Document {
  name: string;
  externalId?: string;
  type: GroupType;
  roles: Types.ObjectId[];
}

const groupSchema = new Schema<IGroup>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    externalId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(GroupType),
      default: GroupType.LOCAL,
      required: true,
    },
    roles: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Role',
      },
    ],
  },
  { timestamps: true },
);

export default groupSchema;
