import { Schema, Document, Types } from 'mongoose';

export interface IMongoProject extends Document {
  name: string;
  promptGroupIds: Types.ObjectId[];
  agentIds: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

const projectSchema = new Schema<IMongoProject>(
  {
    name: {
      type: String,
      required: true,
      index: true,
    },
    promptGroupIds: {
      type: [Schema.Types.ObjectId],
      ref: 'PromptGroup',
      default: [],
    },
    agentIds: {
      type: [String],
      ref: 'Agent',
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

export default projectSchema;
