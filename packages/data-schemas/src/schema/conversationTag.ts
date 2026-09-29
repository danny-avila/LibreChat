import { Schema, Document } from 'mongoose';

export interface IConversationTag extends Document {
  tag?: string;
  user?: string;
  description?: string;
  count?: number;
  position?: number;
}

const conversationTag = new Schema<IConversationTag>(
  {
    tag: {
      type: String,
      index: true,
    },
    user: {
      type: String,
      index: true,
    },
    description: {
      type: String,
      index: true,
    },
    /** BKL: 신뢰하지 말 것 — 감소 경로가 불완전해 실제 건수와 벌어진다.
     * `getConversationTags` 가 조회 시점에 대화에서 집계한 값으로 덮어쓴다. */
    count: {
      type: Number,
      default: 0,
    },
    position: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  { timestamps: true },
);

// Create a compound index on tag and user with unique constraint.
conversationTag.index({ tag: 1, user: 1 }, { unique: true });

export default conversationTag;
