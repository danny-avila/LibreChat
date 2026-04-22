import { Schema } from 'mongoose';
import { notificationTypes } from 'librechat-data-provider';
import type { INotification } from '~/types/notification';

const notificationSchema = new Schema<INotification>(
  {
    user: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [...notificationTypes],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    link: {
      type: String,
    },
    read: {
      type: Boolean,
      default: false,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

notificationSchema.index({ user: 1, createdAt: -1 });

export default notificationSchema;
