const express = require('express');
const request = require('supertest');

jest.mock('@librechat/api', () => jest.requireActual('../../../../packages/api/dist'));

const mockListNotificationsForUser = jest.fn();
const mockCreateNotification = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  SystemCapabilities: {
    ACCESS_ADMIN: 'access:admin',
  },
}));

jest.mock('~/models', () => ({
  listNotificationsForUser: (...args) => mockListNotificationsForUser(...args),
  createNotification: (...args) => mockCreateNotification(...args),
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    next();
  },
}));

jest.mock('~/server/middleware/roles/capabilities', () => ({
  requireCapability: () => (req, res, next) => {
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  },
}));

const notificationsRoute = require('../notifications');

function createApp(user) {
  const app = express();
  app.use(express.json());
  if (user) {
    app.use((req, _res, next) => {
      req.user = user;
      next();
    });
  }
  app.use('/api/notifications', notificationsRoute);
  return app;
}

describe('Notifications route', () => {
  beforeEach(() => {
    mockListNotificationsForUser.mockReset();
    mockCreateNotification.mockReset();
  });

  it('requires authentication for GET /', async () => {
    const app = createApp(null);
    const response = await request(app).get('/api/notifications').expect(401);
    expect(response.body.error).toBe('Authentication required');
    expect(mockListNotificationsForUser).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid pagination cursor', async () => {
    const invalidCursorError = new Error('Invalid cursor');
    invalidCursorError.name = 'InvalidNotificationCursorError';
    mockListNotificationsForUser.mockRejectedValue(invalidCursorError);
    const app = createApp({ id: 'user-1', role: 'USER' });

    const response = await request(app)
      .get('/api/notifications')
      .query({ cursor: 'invalid-cursor' })
      .expect(400);

    expect(response.body.error).toBe('Invalid cursor');
  });

  it('lists notifications for authenticated user', async () => {
    mockListNotificationsForUser.mockResolvedValue({
      notifications: [{ id: 'n1', title: 'Hello', read: false }],
      nextCursor: null,
      hasNextPage: false,
    });
    const app = createApp({ id: 'user-1', role: 'USER' });

    const response = await request(app).get('/api/notifications').expect(200);

    expect(mockListNotificationsForUser).toHaveBeenCalledWith('user-1', expect.any(Object));
    expect(response.body.notifications).toHaveLength(1);
  });

  it('forbids non-admin POST /', async () => {
    const app = createApp({ id: 'user-1', role: 'USER' });
    const response = await request(app)
      .post('/api/notifications')
      .send({ type: 'generic', title: 'T', message: 'M' })
      .expect(403);

    expect(response.body.error).toBe('Forbidden');
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('allows admin POST / and creates for authenticated admin', async () => {
    mockCreateNotification.mockResolvedValue({
      id: 'n1',
      type: 'generic',
      title: 'T',
      message: 'M',
      user: 'admin-1',
      read: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const app = createApp({ id: 'admin-1', role: 'ADMIN' });

    const response = await request(app)
      .post('/api/notifications')
      .send({ type: 'generic', title: 'T', message: 'M' })
      .expect(201);

    expect(mockCreateNotification).toHaveBeenCalledWith({
      userId: 'admin-1',
      type: 'generic',
      title: 'T',
      message: 'M',
      link: undefined,
    });
    expect(response.body.created).toBe(true);
    expect(response.body.notification.id).toBe('n1');
  });
});
