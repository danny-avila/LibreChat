import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Token types accepted by the Transaction model. Media types
 * (audio_input, audio_output, ocr_pages, image_count) cover non-text
 * usage from STT, TTS, OCR, and image-generation endpoints.
 */
export type TokenType =
  | 'prompt'
  | 'completion'
  | 'credits'
  | 'audio_input'
  | 'audio_output'
  | 'ocr_pages'
  | 'image_count';

// @ts-ignore
export interface ITransaction extends Document {
  user: Types.ObjectId;
  conversationId?: string;
  tokenType: TokenType;
  model?: string;
  context?: string;
  valueKey?: string;
  rate?: number;
  rawAmount?: number;
  tokenValue?: number;
  inputTokens?: number;
  writeTokens?: number;
  readTokens?: number;
  messageId?: string;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}

const transactionSchema: Schema<ITransaction> = new Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      required: true,
    },
    conversationId: {
      type: String,
      ref: 'Conversation',
      index: true,
    },
    tokenType: {
      type: String,
      enum: [
        'prompt',
        'completion',
        'credits',
        'audio_input',
        'audio_output',
        'ocr_pages',
        'image_count',
      ],
      required: true,
    },
    model: {
      type: String,
      index: true,
    },
    context: {
      type: String,
    },
    valueKey: {
      type: String,
    },
    rate: Number,
    rawAmount: Number,
    tokenValue: Number,
    inputTokens: { type: Number },
    writeTokens: { type: Number },
    readTokens: { type: Number },
    messageId: { type: String },
    tenantId: {
      type: String,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

export default transactionSchema;
