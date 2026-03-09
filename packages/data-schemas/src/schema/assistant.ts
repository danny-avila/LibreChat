import { Schema } from 'mongoose';
import type { IAssistant } from '~/types';

const assistantSchema = new Schema<IAssistant>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    assistant_id: {
      type: String,
      index: true,
      required: true,
    },
    avatar: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    conversation_starters: {
      type: [String],
      default: [],
    },
    access_level: {
      type: Number,
    },
    file_ids: { type: [String], default: undefined },
    actions: { type: [String], default: undefined },
    append_current_datetime: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      default: undefined,
    },
    // 助手可见性分组：设置后只有该分组的用户可以看到此助手
    // 空值表示遵循默认规则（ADMIN 创建的助手对所有人可见）
    group: {
      type: String,
      default: undefined,
    },
  },
  {
    timestamps: true,
  },
);

export default assistantSchema;
