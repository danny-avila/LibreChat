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
  role?: string;
  /** 助手可见性分组：仅该分组的用户可见，空值表示遵循默认规则 */
  group?: string;
}
