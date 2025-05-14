import mongoose, { Schema, Document } from 'mongoose';
import { conversationPreset } from './defaults';

// @ts-ignore
export interface IPreset extends Document {
  presetId: string;
  title: string;
  user: string | null;
  defaultPreset?: boolean;
  order?: number;
  // Additional fields from conversationPreset and others will be available via an index signature.
  endpoint?: string;
  endpointType?: string;
  model?: string;
  region?: string;
  chatGptLabel?: string;
  examples?: unknown[];
  modelLabel?: string;
  promptPrefix?: string;
  temperature?: number;
  top_p?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  maxTokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  file_ids?: string[];
  resendImages?: boolean;
  promptCache?: boolean;
  thinking?: boolean;
  thinkingBudget?: number;
  system?: string;
  resendFiles?: boolean;
  imageDetail?: string;
  agent_id?: string;
  assistant_id?: string;
  instructions?: string;
  stop?: string[];
  isArchived?: boolean;
  iconURL?: string;
  greeting?: string;
  spec?: string;
  tags?: string[];
  tools?: string[];
  maxContextTokens?: number;
  max_tokens?: number;
  reasoning_effort?: string;
  // end of additional fields
  agentOptions?: unknown;
}

const presetSchema: Schema<IPreset> = new Schema(
  {
    presetId: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    title: {
      type: String,
      default: 'New Chat',
      meiliIndex: true,
    },
    user: {
      type: String,
      default: null,
    },
    defaultPreset: {
      type: Boolean,
    },
    order: {
      type: Number,
    },
    ...conversationPreset,
    agentOptions: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true },
);

export default presetSchema;
