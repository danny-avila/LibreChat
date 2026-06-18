import notificationSchema from '~/schema/notification';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type { Model } from 'mongoose';
import type { INotification } from '~/types/notification';

export function createNotificationModel(mongoose: typeof import('mongoose')): Model<INotification> {
  applyTenantIsolation(notificationSchema);
  return (
    mongoose.models.Notification ||
    mongoose.model<INotification>('Notification', notificationSchema)
  );
}
