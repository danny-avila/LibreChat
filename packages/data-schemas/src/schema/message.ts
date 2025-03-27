import mongoose, { Schema, Document } from 'mongoose';
import { TFeedbackRating, TFeedbackContent } from 'librechat-data-provider';

// @ts-ignore
export interface IMessage extends Document {
  messageId: string;
  conversationId: string;
  user: string;
  model?: string;
  endpoint?: string;
  conversationSignature?: string;
  clientId?: string;
  invocationId?: number;
  parentMessageId?: string;
  tokenCount?: number;
  summaryTokenCount?: number;
  sender?: string;
  text?: string;
  summary?: string;
  isCreatedByUser: boolean;
  unfinished?: boolean;
  error?: boolean;
  finish_reason?: string;
  rating?: TFeedbackRating;
  ratingContent?: TFeedbackContent;
  _meiliIndex?: boolean;
  files?: unknown[];
  plugin?: {
    latest?: string;
    inputs?: unknown[];
    outputs?: string;
  };
  plugins?: unknown[];
  content?: unknown[];
  thread_id?: string;
  iconURL?: string;
  attachments?: unknown[];
  expiredAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const messageSchema: Schema<IMessage> = new Schema(
  {
    messageId: {
      type: String,
      unique: true,
      required: true,
      index: true,
      meiliIndex: true,
    },
    conversationId: {
      type: String,
      index: true,
      required: true,
      meiliIndex: true,
    },
    user: {
      type: String,
      index: true,
      required: true,
      default: null,
    },
    model: {
      type: String,
      default: null,
    },
    endpoint: {
      type: String,
    },
    conversationSignature: {
      type: String,
    },
    clientId: {
      type: String,
    },
    invocationId: {
      type: Number,
    },
    parentMessageId: {
      type: String,
    },
    tokenCount: {
      type: Number,
    },
    summaryTokenCount: {
      type: Number,
    },
    sender: {
      type: String,
      meiliIndex: true,
    },
    text: {
      type: String,
      meiliIndex: true,
    },
    summary: {
      type: String,
    },
    isCreatedByUser: {
      type: Boolean,
      required: true,
      default: false,
    },
    unfinished: {
      type: Boolean,
      default: false,
    },
    error: {
      type: Boolean,
      default: false,
    },
    finish_reason: {
      type: String,
    },
    rating: {
      type: String,
      enum: ['thumbsUp', 'thumbsDown'],
      default: undefined,
    },
    ratingContent: {
      type: {
        tags: {
          type: [String],
          default: undefined,
        },
        text: {
          type: String,
          default: undefined,
        },
      },
      default: undefined,
    },
    _meiliIndex: {
      type: Boolean,
      required: false,
      select: false,
      default: false,
    },
    files: { type: [{ type: mongoose.Schema.Types.Mixed }], default: undefined },
    plugin: {
      type: {
        latest: {
          type: String,
          required: false,
        },
        inputs: {
          type: [mongoose.Schema.Types.Mixed],
          required: false,
          default: undefined,
        },
        outputs: {
          type: String,
          required: false,
        },
      },
      default: undefined,
    },
    plugins: { type: [{ type: mongoose.Schema.Types.Mixed }], default: undefined },
    content: {
      type: [{ type: mongoose.Schema.Types.Mixed }],
      default: undefined,
      meiliIndex: true,
    },
    thread_id: {
      type: String,
    },
    /* frontend components */
    iconURL: {
      type: String,
    },
    attachments: { type: [{ type: mongoose.Schema.Types.Mixed }], default: undefined },
    /*
    attachments: {
      type: [
        {
          file_id: String,
          filename: String,
          filepath: String,
          expiresAt: Date,
          width: Number,
          height: Number,
          type: String,
          conversationId: String,
          messageId: {
            type: String,
            required: true,
          },
          toolCallId: String,
        },
      ],
      default: undefined,
    },
    */
    expiredAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

messageSchema.index({ expiredAt: 1 }, { expireAfterSeconds: 0 });
messageSchema.index({ createdAt: 1 });
messageSchema.index({ messageId: 1, user: 1 }, { unique: true });

export default messageSchema;
