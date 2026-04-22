import type { FilterQuery, Model } from 'mongoose';
import { Types } from 'mongoose';
import { notificationTypes, type NotificationType } from 'librechat-data-provider';
import logger from '~/config/winston';
import type { CreateNotificationParams, INotification } from '~/types/notification';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export type NotificationListItem = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  user: string;
  read: boolean;
  createdAt: string;
  updatedAt: string;
};

function toListItem(doc: {
  _id: Types.ObjectId;
  user: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}): NotificationListItem {
  return {
    id: doc._id.toString(),
    type: doc.type,
    title: doc.title,
    message: doc.message,
    link: doc.link,
    user: doc.user,
    read: doc.read,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function createNotificationMethods(mongoose: typeof import('mongoose')) {
  async function createNotification({
    userId,
    type,
    title,
    message,
    link,
  }: CreateNotificationParams): Promise<NotificationListItem> {
    if (!notificationTypes.includes(type)) {
      throw new Error('Invalid notification type');
    }

    const Notification = mongoose.models.Notification as Model<INotification>;
    const doc = await Notification.create({
      user: userId,
      type,
      title,
      message,
      link,
      read: false,
    });

    const lean = doc.toObject();
    return toListItem({
      _id: lean._id,
      user: lean.user,
      type: lean.type,
      title: lean.title,
      message: lean.message,
      link: lean.link,
      read: lean.read,
      createdAt: lean.createdAt,
      updatedAt: lean.updatedAt,
    });
  }

  async function listNotificationsForUser(
    userId: string,
    options: {
      cursor?: string | null;
      limit?: number;
      unreadOnly?: boolean;
    } = {},
  ): Promise<{ notifications: NotificationListItem[]; nextCursor: string | null; hasNextPage: boolean }> {
    const Notification = mongoose.models.Notification as Model<INotification>;
    const rawLimit = options.limit ?? DEFAULT_LIMIT;
    const limit = Math.min(Math.max(1, parseInt(String(rawLimit), 10) || DEFAULT_LIMIT), MAX_LIMIT);

    const andParts: FilterQuery<INotification>[] = [{ user: userId }];
    if (options.unreadOnly === true) {
      andParts.push({ read: false });
    }

    if (options.cursor) {
      try {
        const cursor = JSON.parse(Buffer.from(options.cursor, 'base64').toString('utf8')) as {
          createdAt: string;
          _id: string;
        };
        andParts.push({
          $or: [
            { createdAt: { $lt: new Date(cursor.createdAt) } },
            {
              createdAt: new Date(cursor.createdAt),
              _id: { $gt: new Types.ObjectId(cursor._id) },
            },
          ],
        });
      } catch (error) {
        logger.warn('[listNotificationsForUser] Invalid cursor provided', error);
      }
    }

    const baseQuery: FilterQuery<INotification> =
      andParts.length === 1 ? andParts[0] : { $and: andParts };

    const docs = await Notification.find(baseQuery)
      .sort({ createdAt: -1, _id: 1 })
      .limit(limit + 1)
      .lean();

    const hasNextPage = docs.length > limit;
    const slice = hasNextPage ? docs.slice(0, limit) : docs;

    let nextCursor: string | null = null;
    if (hasNextPage && slice.length > 0) {
      const last = slice[slice.length - 1];
      nextCursor = Buffer.from(
        JSON.stringify({
          createdAt: last.createdAt,
          _id: last._id.toString(),
        }),
      ).toString('base64');
    }

    return {
      notifications: slice.map((d) =>
        toListItem({
          _id: d._id,
          user: d.user,
          type: d.type as NotificationType,
          title: d.title,
          message: d.message,
          link: d.link,
          read: d.read,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        }),
      ),
      nextCursor,
      hasNextPage,
    };
  }

  async function markNotificationRead(
    userId: string,
    notificationId: string,
  ): Promise<{ updated: boolean }> {
    if (!Types.ObjectId.isValid(notificationId)) {
      return { updated: false };
    }

    const Notification = mongoose.models.Notification as Model<INotification>;
    const result = await Notification.findOneAndUpdate(
      { _id: new Types.ObjectId(notificationId), user: userId },
      { read: true },
      { new: true },
    );

    return { updated: !!result };
  }

  async function markAllNotificationsRead(userId: string): Promise<{ count: number }> {
    const Notification = mongoose.models.Notification as Model<INotification>;
    const result = await Notification.updateMany({ user: userId, read: false }, { read: true });

    return { count: result.modifiedCount ?? 0 };
  }

  async function deleteNotification(userId: string, notificationId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(notificationId)) {
      return false;
    }

    const Notification = mongoose.models.Notification as Model<INotification>;
    const result = await Notification.deleteOne({
      _id: new Types.ObjectId(notificationId),
      user: userId,
    });

    return result.deletedCount > 0;
  }

  return {
    createNotification,
    listNotificationsForUser,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
  };
}

export type NotificationMethods = ReturnType<typeof createNotificationMethods>;
