import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  BROADCAST_USER_BATCH_SIZE,
  createNotificationMethods,
  InvalidNotificationCursorError,
} from './notification';
import { createModels } from '../models';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: MongoMemoryServer | undefined;
let createNotification: ReturnType<typeof createNotificationMethods>['createNotification'];
let createBroadcastNotification: ReturnType<
  typeof createNotificationMethods
>['createBroadcastNotification'];
let listNotificationsForUser: ReturnType<
  typeof createNotificationMethods
>['listNotificationsForUser'];
let markNotificationRead: ReturnType<typeof createNotificationMethods>['markNotificationRead'];
let markAllNotificationsRead: ReturnType<
  typeof createNotificationMethods
>['markAllNotificationsRead'];
let deleteNotification: ReturnType<typeof createNotificationMethods>['deleteNotification'];
let deleteAllUserNotifications: ReturnType<
  typeof createNotificationMethods
>['deleteAllUserNotifications'];

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);

  const methods = createNotificationMethods(mongoose);
  createNotification = methods.createNotification;
  createBroadcastNotification = methods.createBroadcastNotification;
  listNotificationsForUser = methods.listNotificationsForUser;
  markNotificationRead = methods.markNotificationRead;
  markAllNotificationsRead = methods.markAllNotificationsRead;
  deleteNotification = methods.deleteNotification;
  deleteAllUserNotifications = methods.deleteAllUserNotifications;
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

describe('Notification methods', () => {
  beforeEach(async () => {
    await mongoose.models.Notification.deleteMany({});
    await mongoose.models.User.deleteMany({});
  });

  it('creates and lists notifications for a user', async () => {
    await createNotification({
      userId: 'user-a',
      type: 'generic',
      title: 'Hello',
      message: 'World',
    });

    const page = await listNotificationsForUser('user-a', { limit: 10 });
    expect(page.notifications).toHaveLength(1);
    expect(page.notifications[0].title).toBe('Hello');
    expect(page.notifications[0].read).toBe(false);
    expect(page.hasNextPage).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it('paginates with cursor', async () => {
    await createNotification({
      userId: 'user-a',
      type: 'generic',
      title: 'First',
      message: 'm1',
    });
    await createNotification({
      userId: 'user-a',
      type: 'system',
      title: 'Second',
      message: 'm2',
    });

    const first = await listNotificationsForUser('user-a', { limit: 1 });
    expect(first.notifications).toHaveLength(1);
    expect(first.hasNextPage).toBe(true);
    expect(first.nextCursor).toBeTruthy();

    const second = await listNotificationsForUser('user-a', {
      limit: 1,
      cursor: first.nextCursor,
    });
    expect(second.notifications).toHaveLength(1);
    expect(second.notifications[0].title).not.toBe(first.notifications[0].title);
  });

  it('rejects invalid pagination cursors', async () => {
    await expect(
      listNotificationsForUser('user-a', { cursor: 'not-valid-base64!!!' }),
    ).rejects.toThrow(InvalidNotificationCursorError);

    const invalidDateCursor = Buffer.from(
      JSON.stringify({ createdAt: 'not-a-date', _id: new Types.ObjectId().toString() }),
    ).toString('base64');
    await expect(listNotificationsForUser('user-a', { cursor: invalidDateCursor })).rejects.toThrow(
      InvalidNotificationCursorError,
    );

    const invalidIdCursor = Buffer.from(
      JSON.stringify({ createdAt: new Date().toISOString(), _id: 'invalid-id' }),
    ).toString('base64');
    await expect(listNotificationsForUser('user-a', { cursor: invalidIdCursor })).rejects.toThrow(
      InvalidNotificationCursorError,
    );
  });

  it('filters unread only', async () => {
    const n = await createNotification({
      userId: 'user-a',
      type: 'generic',
      title: 'A',
      message: 'a',
    });
    await markNotificationRead('user-a', n.id);

    await createNotification({
      userId: 'user-a',
      type: 'generic',
      title: 'B',
      message: 'b',
    });

    const unread = await listNotificationsForUser('user-a', { unreadOnly: true, limit: 10 });
    expect(unread.notifications).toHaveLength(1);
    expect(unread.notifications[0].title).toBe('B');
  });

  it('marks one read and marks all read', async () => {
    await createNotification({
      userId: 'user-a',
      type: 'generic',
      title: 'A',
      message: 'a',
    });
    const b = await createNotification({
      userId: 'user-a',
      type: 'generic',
      title: 'B',
      message: 'b',
    });

    const r1 = await markNotificationRead('user-a', b.id);
    expect(r1.updated).toBe(true);

    const { count } = await markAllNotificationsRead('user-a');
    expect(count).toBe(1);

    const allRead = await listNotificationsForUser('user-a', { unreadOnly: true, limit: 10 });
    expect(allRead.notifications).toHaveLength(0);
  });

  it('deletes a notification scoped to user', async () => {
    const n = await createNotification({
      userId: 'user-a',
      type: 'generic',
      title: 'A',
      message: 'a',
    });

    const wrongUser = await deleteNotification('user-b', n.id);
    expect(wrongUser).toBe(false);

    const ok = await deleteNotification('user-a', n.id);
    expect(ok).toBe(true);

    const page = await listNotificationsForUser('user-a', { limit: 10 });
    expect(page.notifications).toHaveLength(0);
  });

  it('deletes all notifications for a user', async () => {
    await createNotification({
      userId: 'user-a',
      type: 'generic',
      title: 'A',
      message: 'a',
    });
    await createNotification({
      userId: 'user-a',
      type: 'system',
      title: 'B',
      message: 'b',
    });
    await createNotification({
      userId: 'user-b',
      type: 'generic',
      title: 'Other',
      message: 'other',
    });

    const deletedCount = await deleteAllUserNotifications('user-a');
    expect(deletedCount).toBe(2);

    const userAPage = await listNotificationsForUser('user-a', { limit: 10 });
    const userBPage = await listNotificationsForUser('user-b', { limit: 10 });
    expect(userAPage.notifications).toHaveLength(0);
    expect(userBPage.notifications).toHaveLength(1);
  });

  it('does not list other users notifications', async () => {
    await createNotification({
      userId: 'user-a',
      type: 'generic',
      title: 'A',
      message: 'a',
    });
    const page = await listNotificationsForUser('user-b', { limit: 10 });
    expect(page.notifications).toHaveLength(0);
  });

  it('creates announcement broadcast notifications for all users', async () => {
    await mongoose.models.User.create([
      {
        email: 'broadcast-user-a@example.com',
        emailVerified: true,
        provider: 'local',
      },
      {
        email: 'broadcast-user-b@example.com',
        emailVerified: true,
        provider: 'local',
      },
    ]);

    const { createdCount } = await createBroadcastNotification({
      type: 'announcement',
      title: 'New capability',
      message: 'KAIT now supports feature announcements.',
      link: '/admin/agents/verification',
    });

    expect(createdCount).toBe(2);

    const users = await mongoose.models.User.find({}, { _id: 1 }).lean<
      Array<{ _id: Types.ObjectId }>
    >();
    const [firstUser, secondUser] = users;

    const firstInbox = await listNotificationsForUser(firstUser._id.toString(), { limit: 10 });
    const secondInbox = await listNotificationsForUser(secondUser._id.toString(), { limit: 10 });

    expect(firstInbox.notifications).toHaveLength(1);
    expect(secondInbox.notifications).toHaveLength(1);
    expect(firstInbox.notifications[0].type).toBe('announcement');
    expect(secondInbox.notifications[0].type).toBe('announcement');
  });

  it('broadcasts in batches for large user tables', async () => {
    const userCount = BROADCAST_USER_BATCH_SIZE + 1;
    await mongoose.models.User.insertMany(
      Array.from({ length: userCount }, (_, index) => ({
        email: `batch-user-${index}@example.com`,
        emailVerified: true,
        provider: 'local',
      })),
    );

    const { createdCount } = await createBroadcastNotification({
      type: 'announcement',
      title: 'Batch test',
      message: 'Broadcast to many users',
    });

    expect(createdCount).toBe(userCount);
    const notificationCount = await mongoose.models.Notification.countDocuments();
    expect(notificationCount).toBe(userCount);
  });

  it('supports mark-read and mark-all-read for announcement notifications', async () => {
    const createdUser = await mongoose.models.User.create({
      email: 'announcement-read@example.com',
      emailVerified: true,
      provider: 'local',
    });
    const userId = createdUser._id.toString();

    await createNotification({
      userId,
      type: 'announcement',
      title: 'Announcement 1',
      message: 'A1',
    });

    const second = await createNotification({
      userId,
      type: 'announcement',
      title: 'Announcement 2',
      message: 'A2',
    });

    const single = await markNotificationRead(userId, second.id);
    expect(single.updated).toBe(true);

    const { count } = await markAllNotificationsRead(userId);
    expect(count).toBe(1);

    const unread = await listNotificationsForUser(userId, { unreadOnly: true, limit: 10 });
    expect(unread.notifications).toHaveLength(0);
  });
});
