import { Schema } from 'mongoose';
import type { IContact } from '~/types';

const contactSchema = new Schema<IContact>(
  {
    name: {
      type: String,
      required: true,
      index: true,
    },
    company: {
      type: String,
      index: true,
      default: '',
    },
    role: {
      type: String,
      index: true,
      default: '',
    },
    email: {
      type: String,
      index: true,
      lowercase: true,
      trim: true,
      default: '',
    },
    phone: {
      type: String,
      index: true,
      trim: true,
      default: '',
    },
    tags: {
      type: [String],
      default: [],
      index: true,
    },
    notes: {
      type: String,
      default: '',
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    deleted_at: {
      type: Date,
      default: null,
      index: true,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

contactSchema.index(
  {
    name: 'text',
    company: 'text',
    role: 'text',
    email: 'text',
    phone: 'text',
    tags: 'text',
    notes: 'text',
  },
  {
    name: 'ContactTextIndex',
  },
);

export default contactSchema;
