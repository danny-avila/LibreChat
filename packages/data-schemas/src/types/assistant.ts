import { Document, Types } from 'mongoose';

export interface IAssistant extends Document {
  user: Types.ObjectId;
  assistant_id: string;
  avatar?: {
    filepath: string;
    source: string;
  };
  conversation_starters?: string[];
  access_level?: number;
  file_ids?: string[];
  actions?: string[];
  append_current_datetime?: boolean;
}
