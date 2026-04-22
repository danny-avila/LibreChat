import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createNotificationMethods } from './notification';
import { createModels } from '../models';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: MongoMemoryServer | undefined;
let createNotification: ReturnType<typeof createNotificationMethods>['createNotification'];
let listNotificationsForUser: ReturnType<typeof createNotificationMethods>['listNotificationsForUser'];
let markNotificationRead: ReturnType<typeof createNotificationMethods>['markNotificationRead'];
let markAllNotificationsRead: ReturnType<typeof createNotificationMethods>['markAllNotificationsRead'];
let deleteNotification: ReturnType<typeof createNotificationMethods>['deleteNotification'];

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);

  const methods = createNotificationMethods(mongoose);
  createNotification = methods.createNotification;
  listNotificationsForUser = methods.listNotificationsForUser;
  markNotificationRead = methods.markNotificationRead;
  markAllNotificationsRead = methods.markAllNotificationsRead;
  deleteNotification = methods.deleteNotification;
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
});
