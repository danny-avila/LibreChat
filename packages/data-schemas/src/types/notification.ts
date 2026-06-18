import type { Document } from 'mongoose';
import type { NotificationType } from 'librechat-data-provider';

export interface INotification extends Document {
  user: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  tenantId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateNotificationParams = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
};
